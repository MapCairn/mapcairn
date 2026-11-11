import {
  announceDetent,
  computeDetentHeights,
  createFakeServices,
  type SheetDetent,
} from "@mapcairn/core";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import type { ChromeLayoutValue } from "../layoutContext";
import {
  ChromeSurfaceContext,
  type ChromeSurfaceValue,
} from "../MapChrome/chromeSurface";
import {
  renderChrome,
  stubResizeObserver,
  testChromeLayout,
} from "../MapChrome/chromeTestHarness";
import { Sheet, type SheetProps } from "./Sheet";

const VIEWPORT = { width: 390, height: 800 };
const HEIGHTS = computeDetentHeights({
  viewportHeight: VIEWPORT.height,
  insetBottom: 0,
});

/** Animation frames queued by the component, flushed by the test. */
let frames: FrameRequestCallback[];
let now: number;

beforeEach(() => {
  frames = [];
  now = 1000;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flushFrames(): void {
  act(() => {
    const queued = frames;
    frames = [];
    for (const callback of queued) {
      callback(now);
    }
  });
}

interface Setup {
  readonly props: SheetProps;
  readonly layout: ChromeLayoutValue;
  readonly surface: ChromeSurfaceValue;
}

function setup(
  overrides: Partial<SheetProps> = {},
  layoutOverrides: Partial<ChromeLayoutValue> = {},
): Setup {
  return {
    props: {
      id: "map-options-sheet",
      open: true,
      title: "Map options",
      onClose: vi.fn(),
      detent: "half",
      onDetentChange: vi.fn(),
      onModalChange: vi.fn(),
      restoreFocus: vi.fn(),
      children: (
        <>
          <button type="button">First option</button>
          <button type="button">Last option</button>
        </>
      ),
      ...overrides,
    },
    layout: testChromeLayout({
      viewport: VIEWPORT,
      publishSheetTop: vi.fn(),
      ...layoutOverrides,
    }),
    surface: {
      publishSheetDetent: vi.fn(),
      publishPanelEdge: vi.fn(),
      endStackMaxHeight: null,
    },
  };
}

function ui({ props, surface }: Setup, next: Partial<SheetProps> = {}) {
  return (
    <ChromeSurfaceContext.Provider value={surface}>
      <Sheet {...props} {...next} />
    </ChromeSurfaceContext.Provider>
  );
}

function mount(state: Setup) {
  return renderChrome(ui(state), { layout: state.layout, map: null });
}

function sheet(): HTMLElement {
  return screen.getByTestId("map-options-sheet");
}

function handle(): HTMLElement {
  return screen.getByRole("button", { name: "Resize panel" });
}

function offset(): number {
  return Number.parseFloat(sheet().style.getPropertyValue("--sheet-offset"));
}

describe("Sheet in the sheet layout", () => {
  it("is a dialog labelled by its heading, non-modal below full", () => {
    const state = setup();
    mount(state);
    const dialog = screen.getByRole("dialog", { name: "Map options" });
    expect(dialog).toBe(sheet());
    expect(dialog).toHaveAttribute("id", "map-options-sheet");
    expect(dialog).toHaveAttribute("data-chrome", "sheet");
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(dialog).not.toHaveAttribute("inert");
    expect(
      screen.getByRole("heading", { level: 2, name: "Map options" }),
    ).toHaveAttribute("tabindex", "-1");
    expect(state.props.onModalChange).toHaveBeenLastCalledWith(false);
  });

  it("moves focus to the heading on open and calls restoreFocus after close", () => {
    const state = setup({ open: false });
    const { rerenderChrome } = mount(state);
    expect(sheet()).toHaveAttribute("inert");
    expect(state.props.restoreFocus).not.toHaveBeenCalled();

    rerenderChrome(ui(state, { open: true }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Map options" }),
    );
    expect(sheet()).not.toHaveAttribute("inert");

    rerenderChrome(ui(state, { open: false }));
    expect(state.props.restoreFocus).toHaveBeenCalledOnce();
    expect(sheet()).toHaveAttribute("inert");
  });

  it("closes with the Close button and with Escape at every detent", () => {
    for (const detent of ["peek", "half", "full"] as const) {
      const state = setup({ detent });
      const { unmount } = mount(state);
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      fireEvent.keyDown(screen.getByText("First option"), { key: "Escape" });
      expect(state.props.onClose).toHaveBeenCalledTimes(2);
      unmount();
    }
  });

  it("ignores Escape while closed", () => {
    const state = setup({ open: false });
    mount(state);
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(state.props.onClose).not.toHaveBeenCalled();
  });

  it("cycles detents with the handle and steps with the arrow keys", () => {
    const state = setup({ detent: "half" });
    mount(state);
    expect(handle().tagName).toBe("BUTTON");
    fireEvent.click(handle());
    expect(state.props.onDetentChange).toHaveBeenLastCalledWith("full");
    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(state.props.onDetentChange).toHaveBeenLastCalledWith("full");
    fireEvent.keyDown(handle(), { key: "ArrowDown" });
    expect(state.props.onDetentChange).toHaveBeenLastCalledWith("peek");
    expect(state.props.onDetentChange).toHaveBeenCalledTimes(3);
  });

  it("does nothing for an arrow key at the end of the range", () => {
    const state = setup({ detent: "full" });
    mount(state);
    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    fireEvent.keyDown(handle(), { key: "Home" });
    expect(state.props.onDetentChange).not.toHaveBeenCalled();
  });

  it("is modal at full: aria-modal, onModalChange and a Tab loop", () => {
    const state = setup({ detent: "half" });
    const { rerenderChrome } = mount(state);
    rerenderChrome(ui(state, { detent: "full" }));
    expect(sheet()).toHaveAttribute("aria-modal", "true");
    expect(state.props.onModalChange).toHaveBeenLastCalledWith(true);

    const last = screen.getByText("Last option");
    last.focus();
    const forward = fireEvent.keyDown(last, { key: "Tab" });
    expect(forward).toBe(false);
    expect(document.activeElement).toBe(handle());

    const backward = fireEvent.keyDown(handle(), {
      key: "Tab",
      shiftKey: true,
    });
    expect(backward).toBe(false);
    expect(document.activeElement).toBe(last);

    // From the heading (not in the tab order), Shift+Tab wraps to the end.
    screen.getByRole("heading").focus();
    fireEvent.keyDown(screen.getByRole("heading"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(document.activeElement).toBe(last);

    // Tab inside the range is left to the browser.
    handle().focus();
    expect(fireEvent.keyDown(handle(), { key: "Tab" })).toBe(true);
  });

  it("wraps focus at full through sentinels at both ends, for browsers whose Tab skips links and buttons", () => {
    const state = setup({ detent: "full" });
    mount(state);
    const sentinels = sheet().querySelectorAll<HTMLElement>(
      "[data-focus-sentinel]",
    );
    expect(sentinels).toHaveLength(2);
    const [start, end] = sentinels;
    if (!start || !end) {
      throw new Error("No sentinels");
    }
    expect(sheet().firstElementChild).toBe(start);
    expect(sheet().lastElementChild).toBe(end);
    for (const sentinel of [start, end]) {
      expect(sentinel.tabIndex).toBe(0);
    }

    // Safari's default Tab passes the last link and reaches the end sentinel,
    // which hands focus to the first control.
    end.focus();
    expect(document.activeElement).toBe(handle());
    // Shift+Tab past the first control reaches the start sentinel, which
    // hands focus to the last control.
    start.focus();
    expect(document.activeElement).toBe(screen.getByText("Last option"));

    // The sentinels are not ends of the keyboard loop themselves.
    const last = screen.getByText("Last option");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(handle());
  });

  it("leaves Tab alone below full", () => {
    const state = setup({ detent: "half" });
    mount(state);
    const last = screen.getByText("Last option");
    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(true);
    expect(sheet().querySelector("[data-focus-sentinel]")).toBeNull();
  });

  it("announces detent changes, but not the first opening", () => {
    vi.useFakeTimers();
    const state = setup({ detent: "half" });
    const { rerenderChrome } = mount(state);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent("");
    rerenderChrome(ui(state, { detent: "full" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      announceDetent("full"),
    );
  });

  it("publishes its top edge and detent, and clears them when closed", () => {
    const state = setup({ detent: "half" });
    const { rerenderChrome, unmount } = mount(state);
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      VIEWPORT.height - HEIGHTS.half,
    );
    expect(state.surface.publishSheetDetent).toHaveBeenLastCalledWith("half");
    expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);
    expect(sheet().style.getPropertyValue("--sheet-full-height")).toBe(
      `${HEIGHTS.full}px`,
    );

    rerenderChrome(ui(state, { detent: "peek" }));
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      VIEWPORT.height - HEIGHTS.peek,
    );
    expect(offset()).toBe(HEIGHTS.full - HEIGHTS.peek);

    rerenderChrome(ui(state, { open: false }));
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(null);
    expect(state.surface.publishSheetDetent).toHaveBeenLastCalledWith(null);
    expect(state.surface.publishPanelEdge).toHaveBeenLastCalledWith(null);

    rerenderChrome(ui(state, { open: true }));
    unmount();
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(null);
  });

  describe("dragging", () => {
    function press(target: Element, clientY: number) {
      fireEvent.pointerDown(target, {
        pointerId: 1,
        button: 0,
        clientY,
        pointerType: "touch",
      });
    }
    function move(clientY: number, after = 16) {
      now += after;
      fireEvent.pointerMove(handle(), { pointerId: 1, clientY });
    }

    it("follows the pointer with a transform and snaps on release", () => {
      const state = setup({ detent: "half" });
      mount(state);
      press(handle(), 400);
      expect(sheet()).toHaveAttribute("data-dragging", "true");
      move(380, 200);
      // 20 px further up from half.
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half - 20);
      flushFrames();
      expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
        VIEWPORT.height - HEIGHTS.half - 20,
      );
      move(120, 400);
      fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 120 });
      expect(sheet()).not.toHaveAttribute("data-dragging");
      expect(state.props.onDetentChange).toHaveBeenLastCalledWith("full");
      expect(offset()).toBe(0);
      // The pointer click that follows a drag does not also cycle.
      fireEvent.click(handle(), { detail: 1 });
      expect(state.props.onDetentChange).toHaveBeenCalledOnce();
    });

    it("throttles publishing to one per animation frame", () => {
      const state = setup({ detent: "half" });
      mount(state);
      const calls = vi.mocked(state.layout.publishSheetTop).mock.calls.length;
      press(handle(), 400);
      move(390);
      move(380);
      move(370);
      expect(vi.mocked(state.layout.publishSheetTop).mock.calls.length).toBe(
        calls,
      );
      flushFrames();
      expect(vi.mocked(state.layout.publishSheetTop).mock.calls.length).toBe(
        calls + 1,
      );
      expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
        VIEWPORT.height - HEIGHTS.half - 30,
      );
    });

    it("treats a fast downward flick as a fling to the next detent down", () => {
      const state = setup({ detent: "half" });
      mount(state);
      press(handle(), 400);
      move(420, 10);
      move(460, 10);
      fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 460 });
      expect(state.props.onDetentChange).toHaveBeenLastCalledWith("peek");
    });

    it("rubber-bands past the extremes", () => {
      const state = setup({ detent: "full" });
      mount(state);
      press(handle(), 100);
      move(0, 300);
      expect(offset()).toBeLessThan(0);
      expect(offset()).toBeGreaterThan(-48);
    });

    it("snaps back to the current detent after a slow, small drag", () => {
      const state = setup({ detent: "half" });
      mount(state);
      press(handle(), 400);
      move(395, 500);
      move(394, 500);
      fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 394 });
      expect(state.props.onDetentChange).not.toHaveBeenCalled();
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);
    });

    it("snaps back when the pointer is cancelled", () => {
      const state = setup({ detent: "half" });
      mount(state);
      press(handle(), 400);
      move(200, 300);
      fireEvent.pointerCancel(handle(), { pointerId: 1 });
      expect(state.props.onDetentChange).not.toHaveBeenCalled();
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);
      expect(sheet()).not.toHaveAttribute("data-dragging");
    });

    it("drags from the header too, but not from the Close button", () => {
      const state = setup({ detent: "half" });
      mount(state);
      press(screen.getByRole("button", { name: "Close" }), 400);
      expect(sheet()).not.toHaveAttribute("data-dragging");
      press(screen.getByRole("heading"), 400);
      expect(sheet()).toHaveAttribute("data-dragging", "true");
    });

    it("ignores other pointers and secondary mouse buttons", () => {
      const state = setup({ detent: "half" });
      mount(state);
      fireEvent.pointerDown(handle(), {
        pointerId: 1,
        button: 2,
        clientY: 400,
        pointerType: "mouse",
      });
      expect(sheet()).not.toHaveAttribute("data-dragging");
      press(handle(), 400);
      fireEvent.pointerMove(handle(), { pointerId: 2, clientY: 100 });
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);
      fireEvent.pointerUp(handle(), { pointerId: 2, clientY: 100 });
      fireEvent.pointerCancel(handle(), { pointerId: 2 });
      expect(sheet()).toHaveAttribute("data-dragging", "true");
      // A second press while one drag is live does not restart it.
      press(handle(), 100);
      move(390);
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half - 10);
    });

    it("puts the sheet back on its detent after a press that wobbles under the drag slop", () => {
      const state = setup({ detent: "half" });
      mount(state);
      press(handle(), 400);
      move(397);
      flushFrames();
      fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 397 });
      expect(state.props.onDetentChange).not.toHaveBeenCalled();
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);
      expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
        VIEWPORT.height - HEIGHTS.half,
      );
    });

    it("treats a press that does not move as a tap, which cycles", () => {
      const state = setup({ detent: "peek" });
      mount(state);
      press(handle(), 400);
      move(398);
      fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 398 });
      expect(sheet()).not.toHaveAttribute("data-dragging");
      fireEvent.click(handle());
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "half",
      );
    });
  });

  /**
   * These tests model how a browser routes pointer events: while an element
   * holds pointer capture, moves and the release go to it rather than to the
   * element under the pointer, and a mouse click goes to the nearest common
   * ancestor of the press and release targets. A touch tap's click goes to the
   * tapped element.
   */
  describe("pointer clicks, taps and drags in a browser", () => {
    let captured: Element | null;

    beforeEach(() => {
      captured = null;
      Element.prototype.hasPointerCapture ??= () => false;
      vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(
        function (this: Element) {
          captured = this;
        },
      );
      vi.spyOn(Element.prototype, "releasePointerCapture").mockImplementation(
        function (this: Element) {
          if (captured === this) {
            captured = null;
          }
        },
      );
      vi.spyOn(Element.prototype, "hasPointerCapture").mockImplementation(
        function (this: Element) {
          return captured === this;
        },
      );
    });

    function commonAncestor(a: Element, b: Element): Element {
      let node: Element | null = a;
      while (node && !node.contains(b)) {
        node = node.parentElement;
      }
      return node ?? document.body;
    }

    type PointerType = "mouse" | "touch" | "pen";

    /** Presses on `target`, moves over each of `path`, and releases over `over`. */
    function gesture(
      pointerType: PointerType,
      target: Element,
      startY: number,
      path: readonly { readonly over: Element; readonly clientY: number }[],
      release: { readonly over: Element; readonly clientY: number },
    ): Element {
      const init = { pointerId: 7, button: 0, pointerType };
      fireEvent.pointerDown(target, { ...init, clientY: startY });
      for (const step of path) {
        now += 16;
        fireEvent.pointerMove(captured ?? step.over, {
          ...init,
          clientY: step.clientY,
        });
      }
      const upTarget = captured ?? release.over;
      fireEvent.pointerUp(upTarget, { ...init, clientY: release.clientY });
      return upTarget;
    }

    /** A mouse or pen click: press and release on `target`, then the click. */
    function pointerClick(target: Element, pointerType: PointerType): void {
      const upTarget = gesture(pointerType, target, 400, [], {
        over: target,
        clientY: 400,
      });
      fireEvent.click(commonAncestor(target, upTarget), { detail: 1 });
    }

    it("cycles once for a mouse click on the handle", () => {
      const state = setup({ detent: "half" });
      mount(state);
      pointerClick(handle(), "mouse");
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "full",
      );
      expect(sheet()).not.toHaveAttribute("data-dragging");
    });

    it("cycles once for a mouse click on the handle's grabber bar", () => {
      const state = setup({ detent: "peek" });
      mount(state);
      const grabber = handle().querySelector("span");
      expect(grabber).not.toBeNull();
      pointerClick(grabber as Element, "mouse");
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "half",
      );
    });

    it("cycles once for a pen click on the handle", () => {
      const state = setup({ detent: "half" });
      mount(state);
      pointerClick(handle(), "pen");
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "full",
      );
    });

    it("cycles once for a touch tap on the handle", () => {
      const state = setup({ detent: "full" });
      mount(state);
      gesture("touch", handle(), 400, [{ over: handle(), clientY: 402 }], {
        over: handle(),
        clientY: 402,
      });
      fireEvent.click(handle(), { detail: 1 });
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "peek",
      );
    });

    it("drags with the mouse when the pointer leaves the header, and the click after it does not cycle", () => {
      const state = setup({ detent: "half" });
      mount(state);
      fireEvent.pointerDown(handle(), {
        pointerId: 7,
        button: 0,
        clientY: 400,
        pointerType: "mouse",
      });
      now += 16;
      fireEvent.pointerMove(captured ?? document.body, {
        pointerId: 7,
        clientY: 370,
        pointerType: "mouse",
      });
      // The first move already leaves the header; the sheet still follows.
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half - 30);
      fireEvent.pointerCancel(captured ?? document.body, {
        pointerId: 7,
        pointerType: "mouse",
      });
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);

      // A long mouse drag up snaps to full, and its click does not cycle on.
      const longUp = gesture(
        "mouse",
        handle(),
        400,
        [
          { over: document.body, clientY: 300 },
          { over: document.body, clientY: 120 },
        ],
        { over: document.body, clientY: 120 },
      );
      fireEvent.click(commonAncestor(handle(), longUp), { detail: 1 });
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "full",
      );
      expect(offset()).toBe(0);
    });

    it("still cycles from the keyboard after a drag that no click followed", () => {
      const state = setup({ detent: "half" });
      mount(state);
      // A touch flick down, long enough that the browser sends no click.
      gesture("touch", handle(), 400, [{ over: handle(), clientY: 430 }], {
        over: handle(),
        clientY: 430,
      });
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "peek",
      );
      // Enter or Space on a button fires a click with no pointer press.
      fireEvent.click(handle(), { detail: 0 });
      expect(state.props.onDetentChange).toHaveBeenCalledTimes(2);
      expect(state.props.onDetentChange).toHaveBeenLastCalledWith("full");
    });

    it("cycles on the next handle click after a drag from the heading", () => {
      const state = setup({ detent: "half" });
      mount(state);
      const heading = screen.getByRole("heading");
      const upTarget = gesture(
        "mouse",
        heading,
        400,
        [{ over: document.body, clientY: 430 }],
        { over: document.body, clientY: 430 },
      );
      fireEvent.click(commonAncestor(heading, upTarget), { detail: 1 });
      expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith(
        "peek",
      );
      // Enter or Space on the handle still cycles.
      fireEvent.click(handle(), { detail: 0 });
      expect(state.props.onDetentChange).toHaveBeenCalledTimes(2);
      expect(state.props.onDetentChange).toHaveBeenLastCalledWith("full");
      pointerClick(handle(), "mouse");
      expect(state.props.onDetentChange).toHaveBeenCalledTimes(3);
    });

    it("releases the capture it took when the press ends", () => {
      const state = setup({ detent: "half" });
      mount(state);
      gesture("mouse", handle(), 400, [], { over: handle(), clientY: 400 });
      expect(captured).toBeNull();
    });

    it("snaps back when it loses pointer capture mid-drag, and ignores a loss after release", () => {
      const state = setup({ detent: "half" });
      mount(state);
      fireEvent.pointerDown(handle(), {
        pointerId: 7,
        button: 0,
        clientY: 400,
        pointerType: "touch",
      });
      now += 100;
      fireEvent.pointerMove(handle(), { pointerId: 7, clientY: 300 });
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half - 100);
      fireEvent.lostPointerCapture(handle(), { pointerId: 8 });
      expect(sheet()).toHaveAttribute("data-dragging", "true");
      fireEvent.lostPointerCapture(handle(), { pointerId: 7 });
      expect(sheet()).not.toHaveAttribute("data-dragging");
      expect(offset()).toBe(HEIGHTS.full - HEIGHTS.half);
      fireEvent.lostPointerCapture(handle(), { pointerId: 7 });
      fireEvent.pointerUp(handle(), { pointerId: 7, clientY: 300 });
      expect(state.props.onDetentChange).not.toHaveBeenCalled();
    });
  });
});

describe("Sheet over a credit row", () => {
  const RESERVE = 56;
  const ROOM = computeDetentHeights({
    viewportHeight: VIEWPORT.height - RESERVE,
    insetBottom: 0,
  });

  function withReserve(
    layoutOverrides: Partial<ChromeLayoutValue> = {},
  ): Setup {
    const state = setup(
      { detent: "half" },
      { bottomReserve: RESERVE, ...layoutOverrides },
    );
    return state;
  }
  const top = (height: number) => VIEWPORT.height - RESERVE - height;

  function press(clientY: number) {
    fireEvent.pointerDown(handle(), {
      pointerId: 1,
      button: 0,
      clientY,
      pointerType: "touch",
    });
  }

  it("sizes its detents within what the credit row leaves and publishes its top above the row", () => {
    const state = withReserve();
    const { rerenderChrome } = mount(state);
    expect(ROOM.half).not.toBe(HEIGHTS.half);
    expect(sheet().style.getPropertyValue("--sheet-full-height")).toBe(
      `${ROOM.full}px`,
    );
    expect(offset()).toBe(ROOM.full - ROOM.half);
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.half),
    );
    rerenderChrome(ui(state, { detent: "peek" }));
    expect(offset()).toBe(ROOM.full - ROOM.peek);
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.peek),
    );
  });

  it("publishes a dragged top above the row while dragging, and the snapped top on release", () => {
    const state = withReserve();
    mount(state);
    press(400);
    now += 200;
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 380 });
    flushFrames();
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.half + 20),
    );
    now += 400;
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 100 });
    expect(state.props.onDetentChange).toHaveBeenLastCalledWith("full");
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.full),
    );
  });

  it("puts the published top back above the row after a wobble, a cancelled drag and a tap", () => {
    const state = withReserve();
    mount(state);
    press(400);
    now += 16;
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 397 });
    flushFrames();
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 397 });
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.half),
    );

    press(400);
    now += 200;
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 300 });
    flushFrames();
    fireEvent.pointerCancel(handle(), { pointerId: 1 });
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.half),
    );
    expect(offset()).toBe(ROOM.full - ROOM.half);
  });

  it("cycles from a tap on the handle and publishes the next detent above the row", () => {
    const state = withReserve();
    const { rerenderChrome } = mount(state);
    press(400);
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 400 });
    fireEvent.click(handle(), { detail: 1 });
    expect(state.props.onDetentChange).toHaveBeenCalledExactlyOnceWith("full");
    rerenderChrome(ui(state, { detent: "full" }));
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(
      top(ROOM.full),
    );
  });

  it("is ignored by the side panel, which has no bottom edge to lift", () => {
    const state = withReserve({ layout: "panel" });
    mount(state);
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(null);
    expect(sheet().style.getPropertyValue("--sheet-full-height")).toBe("");
  });
});

describe("Sheet in the panel layout", () => {
  it("is a labelled complementary region with no handle and no modality", () => {
    const state = setup({ detent: "full" }, { layout: "panel" });
    mount(state);
    const panel = screen.getByRole("complementary", { name: "Map options" });
    expect(panel).toHaveAttribute("data-layout", "panel");
    expect(panel).not.toHaveAttribute("aria-modal");
    expect(screen.queryByRole("button", { name: "Resize panel" })).toBeNull();
    expect(state.props.onModalChange).toHaveBeenLastCalledWith(false);
    expect(state.layout.publishSheetTop).toHaveBeenLastCalledWith(null);
    expect(state.surface.publishSheetDetent).toHaveBeenLastCalledWith(null);
  });

  it("moves focus to the heading on open, closes on Escape and does not trap Tab", () => {
    const state = setup({ open: false }, { layout: "panel" });
    const { rerenderChrome } = mount(state);
    rerenderChrome(ui(state, { open: true }));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    const last = screen.getByText("Last option");
    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(true);
    fireEvent.keyDown(last, { key: "Escape" });
    expect(state.props.onClose).toHaveBeenCalledOnce();
  });

  it("publishes its right edge, and again when it resizes", () => {
    const observers = stubResizeObserver();
    const state = setup({}, { layout: "panel" });
    const { rerenderChrome } = mount(state);
    const panel = screen.getByRole("complementary");
    expect(state.surface.publishPanelEdge).toHaveBeenLastCalledWith(0);
    Object.defineProperty(panel, "offsetLeft", { value: 12 });
    Object.defineProperty(panel, "offsetWidth", { value: 360 });
    act(() => {
      observers.trigger();
    });
    expect(state.surface.publishPanelEdge).toHaveBeenLastCalledWith(372);
    rerenderChrome(ui(state, { open: false }));
    expect(state.surface.publishPanelEdge).toHaveBeenLastCalledWith(null);
    expect(observers.active).toBe(0);
  });

  it("ignores pointer drags", () => {
    const state = setup({}, { layout: "panel" });
    mount(state);
    fireEvent.pointerDown(screen.getByRole("heading"), {
      pointerId: 1,
      button: 0,
      clientY: 10,
    });
    expect(screen.getByRole("complementary")).not.toHaveAttribute(
      "data-dragging",
    );
  });
});

describe("Sheet server rendering", () => {
  it("renders no style attribute", () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        <Sheet
          id="s"
          open
          title="Map options"
          onClose={() => {}}
          detent={"half" satisfies SheetDetent}
          onDetentChange={() => {}}
        >
          content
        </Sheet>
      </ServicesProvider>,
    );
    expect(html).toContain("Map options");
    expect(html).not.toMatch(/style=/);
  });
});

describe("Sheet brand", () => {
  const brand = <svg data-testid="host-brand" />;

  it("draws no brand row without a brand", () => {
    mount(setup({}, { layout: "panel" }));
    expect(screen.queryByTestId("sheet-brand")).toBeNull();
  });

  it("draws the host's brand in a decorative row above the title, in both layouts", () => {
    for (const layout of ["panel", "sheet"] as const) {
      const { unmount } = mount(setup({ brand }, { layout }));
      const row = screen.getByTestId("sheet-brand");
      expect(row).toContainElement(screen.getByTestId("host-brand"));
      expect(row).toHaveAttribute("aria-hidden", "true");
      expect(
        row.compareDocumentPosition(screen.getByRole("heading")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      unmount();
    }
  });

  it("leaves the accessible name to the title, with nothing to focus in the brand row", () => {
    mount(setup({ brand }, { layout: "panel" }));
    expect(
      screen.getByRole("complementary", { name: "Map options" }),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sheet-brand").querySelector("button, a, [tabindex]"),
    ).toBeNull();
  });

  it("marks the detent on the surface, so the stylesheet can leave the row out at peek", () => {
    mount(setup({ brand, detent: "peek" }));
    expect(sheet()).toHaveAttribute("data-detent", "peek");
  });
});
