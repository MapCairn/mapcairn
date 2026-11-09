import {
  announceDetent,
  computeDetentHeights,
  createFakeServices,
  type SheetDetent,
} from "@karta/core";
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

  it("leaves Tab alone below full", () => {
    const state = setup({ detent: "half" });
    mount(state);
    const last = screen.getByText("Last option");
    last.focus();
    expect(fireEvent.keyDown(last, { key: "Tab" })).toBe(true);
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
      // The click that follows a drag does not also cycle.
      fireEvent.click(handle());
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
