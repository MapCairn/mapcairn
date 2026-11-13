// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  computeBottomSlotLayout,
  computeDetentHeights,
  createFakeServices,
  type SheetDetent,
} from "@mapcairn/core";
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui";
import { type ChromeLayoutValue, useChromeLayout } from "../layoutContext";
import { Sheet } from "../Sheet";
import { type ChromeSurfaceValue, useChromeSurface } from "./chromeSurface";
import {
  mockRect,
  type ResizeObserverStub,
  stubResizeObserver,
} from "./chromeTestHarness";
import { chromeVar, chromeVars } from "./chromeVars";
import { MapChrome, type MapChromeProps } from "./MapChrome";

let observers: ResizeObserverStub;

beforeEach(() => {
  observers = stubResizeObserver();
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Captures the context values the chrome provides to its slots. */
let layoutValue: ChromeLayoutValue;
let surfaceValue: ChromeSurfaceValue;
function Probe() {
  layoutValue = useChromeLayout();
  surfaceValue = useChromeSurface();
  return <span>probe</span>;
}

function chrome(props: Partial<MapChromeProps> = {}) {
  return (
    <MapChrome
      background={<div data-testid="map">map</div>}
      topStart={<div>search</div>}
      endStack={<Probe />}
      bottomStart={<div>scale</div>}
      bottomEnd={<div>credits</div>}
      bottomCentre={<div>toolbar</div>}
      sheet={<div data-chrome="sheet">sheet</div>}
      modal={false}
      {...props}
    />
  );
}

function mount(
  props: Partial<MapChromeProps> = {},
  services = createFakeServices(),
) {
  const result = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>{chrome(props)}</LiveRegionProvider>
    </ServicesProvider>,
  );
  return {
    ...result,
    services,
    rerenderChrome(next: Partial<MapChromeProps>) {
      result.rerender(
        <ServicesProvider services={services}>
          <LiveRegionProvider>
            {chrome({ ...props, ...next })}
          </LiveRegionProvider>
        </ServicesProvider>,
      );
    },
  };
}

function root(): HTMLElement {
  return screen.getByTestId("map-chrome");
}

function slot(name: string): HTMLElement {
  const element = root().querySelector<HTMLElement>(`[data-chrome="${name}"]`);
  if (!element) {
    throw new Error(`No slot ${name}`);
  }
  return element;
}

/** Fakes the layout box of a slot, relative to the chrome root. */
function place(name: string, top: number, height: number, width = 0) {
  const element = root().querySelector(`[data-chrome="${name}"]`);
  if (!element) {
    return;
  }
  Object.defineProperty(element, "offsetTop", {
    value: top,
    configurable: true,
  });
  Object.defineProperty(element, "offsetHeight", {
    value: height,
    configurable: true,
  });
  Object.defineProperty(element, "offsetWidth", {
    value: width,
    configurable: true,
  });
}

/** Sizes the container, lays the slots out like a phone and reports a resize. */
function resize(
  width: number,
  height: number,
  tourHeight = 0,
  readoutHeight = 30,
) {
  mockRect(root(), { left: 0, top: 0, width, height });
  place("top-start", 12, 48);
  place("tour", 72, tourHeight);
  place("end-stack", 72, 300, 48);
  place("bottom-start", height - 12 - readoutHeight, readoutHeight);
  place("bottom-end", height - 12 - 44, 44);
  place("bottom-centre", height - 12, 0);
  act(() => {
    observers.trigger();
  });
}

function cssVar(name: string): string {
  return root().style.getPropertyValue(name);
}

describe("MapChrome structure", () => {
  it("renders every slot as one measurable element, in reading order", () => {
    mount();
    expect(root()).toHaveAttribute("data-chrome-root");
    const order = [
      slot("top-start"),
      slot("end-stack"),
      screen.getByText("sheet"),
      screen.getByRole("main"),
      slot("bottom-start"),
      slot("bottom-centre"),
      slot("bottom-end"),
    ];
    order.reduce((earlier, later) => {
      expect(
        earlier.compareDocumentPosition(later) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      return later;
    });
    expect(screen.getByRole("main")).toContainElement(
      screen.getByTestId("map"),
    );
    expect(slot("top-start")).toHaveTextContent("search");
    expect(slot("bottom-end")).toHaveTextContent("credits");
  });

  it("makes everything but the sheet inert while modal", () => {
    const { rerenderChrome } = mount();
    const groups = [
      slot("top-start"),
      slot("end-stack"),
      screen.getByRole("main"),
      slot("bottom-start"),
      slot("bottom-centre"),
      slot("bottom-end"),
    ];
    for (const group of groups) {
      expect(group).not.toHaveAttribute("inert");
    }
    rerenderChrome({ modal: true });
    for (const group of groups) {
      expect(group).toHaveAttribute("inert");
    }
    expect(screen.getByText("sheet").closest("[inert]")).toBeNull();
  });

  it("leaves empty slots out", () => {
    render(
      <ServicesProvider services={createFakeServices()}>
        <MapChrome background={<div />} modal={false} />
      </ServicesProvider>,
    );
    expect(root().querySelectorAll("[data-chrome]")).toHaveLength(0);
    expect(screen.getByRole("main")).toBeInTheDocument();

    // With nothing to measure, the slots' edges fall back to the insets.
    mockRect(root(), { left: 0, top: 0, width: 390, height: 800 });
    act(() => {
      observers.trigger();
    });
    expect(cssVar(chromeVars.topStartBottom)).toBe("12px");
    expect(cssVar(chromeVars.endStackMaxHeight)).toBe(`${788 - 12 - 12}px`);
    expect(cssVar(chromeVars.bottomLift)).toBe("0px");
  });

  it("server-renders without a style attribute, in the sheet layout", () => {
    const html = renderToString(
      <ServicesProvider services={createFakeServices()}>
        {chrome()}
      </ServicesProvider>,
    );
    expect(html).toContain('data-layout="sheet"');
    expect(html).not.toMatch(/style=/);
  });
});

describe("MapChrome layout", () => {
  it("measures its container and chooses the layout", () => {
    const onViewportChange = vi.fn();
    mount({ onViewportChange });
    expect(layoutValue.layout).toBe("sheet");

    resize(390, 800);
    expect(layoutValue.viewport).toEqual({ width: 390, height: 800 });
    expect(layoutValue.layout).toBe("sheet");
    expect(root()).toHaveAttribute("data-layout", "sheet");
    expect(onViewportChange).toHaveBeenLastCalledWith({
      width: 390,
      height: 800,
    });
    expect(cssVar(chromeVars.width)).toBe("390px");

    resize(1024, 768);
    expect(layoutValue.layout).toBe("panel");
    expect(root()).toHaveAttribute("data-layout", "panel");

    resize(700, 420);
    expect(layoutValue.layout).toBe("panel");
    expect(onViewportChange).toHaveBeenCalledTimes(3);

    // The same size again is not a change.
    resize(700, 420);
    expect(onViewportChange).toHaveBeenCalledTimes(3);
  });

  it("passes the pointer preference through", () => {
    const services = createFakeServices();
    services.fakes.preferences.set({ finePointer: false });
    mount({}, services);
    expect(layoutValue.finePointer).toBe(false);
    act(() => {
      services.fakes.preferences.set({ finePointer: true });
    });
    expect(layoutValue.finePointer).toBe(true);
  });

  it("publishes where the top-start slot ends, for the side panel", () => {
    mount();
    resize(1024, 768);
    expect(cssVar(chromeVars.topStartBottom)).toBe("60px");
  });

  it("caps the end stack above the bottom row and tells the stack", () => {
    mount();
    resize(390, 800);
    // Bottom row starts at 800 - 12 - 44 = 744; minus the 12 px gap, minus
    // the stack's top at 72.
    expect(surfaceValue.endStackMaxHeight).toBe(744 - 12 - 72);
    expect(cssVar(chromeVars.endStackMaxHeight)).toBe(`${744 - 12 - 72}px`);
    // Room for the credits popover: from the stack's bottom (372) to the
    // bottom-end slot's top, less the gap.
    expect(cssVar(chromeVars.bottomEndRoom)).toBe(`${744 - 12 - 372}px`);
  });

  it("keeps the credits popover above the whole bottom row, whichever slot is tallest", () => {
    mount();
    resize(390, 800);
    // The credits slot is the tallest: nothing to rise over.
    expect(cssVar(chromeVars.bottomEndRise)).toBe("0px");

    // A readout 68 px tall starts at 800 - 12 - 68 = 720, 24 px above the
    // credits slot's top (744): the popover rises that far and has that much
    // less room.
    resize(390, 800, 0, 68);
    expect(cssVar(chromeVars.bottomEndRise)).toBe("24px");
    expect(cssVar(chromeVars.bottomEndRoom)).toBe(`${720 - 12 - 372}px`);
    expect(cssVar(chromeVars.bottomEndBesideRoom)).toBe(`${720 - 12 - 60}px`);
  });

  it("keeps the rise and measures the rooms from the lifted row while the sheet lifts it", () => {
    mount();
    resize(390, 800, 0, 68);
    const heights = computeDetentHeights({
      viewportHeight: 800,
      insetBottom: 0,
    });
    const top = 800 - heights.half;
    act(() => {
      layoutValue.publishSheetTop(top);
      surfaceValue.publishSheetDetent("half");
    });
    const { bottomEndTranslateY: lift } = computeBottomSlotLayout({
      layout: "sheet",
      viewportWidth: 390,
      viewportHeight: 800,
      sheetTopEdge: top,
      sheetDetent: "half",
      panelRightEdge: null,
      measureToolbarTop: null,
      inset: 12,
    });
    expect(lift).toBeLessThan(0);
    // The lift moves the whole row, so the readout still reaches 24 px above
    // the credits slot, and the rooms start from the lifted row's top (720).
    expect(cssVar(chromeVars.bottomEndRise)).toBe("24px");
    expect(cssVar(chromeVars.bottomEndRoom)).toBe(
      `${Math.max(0, 720 + lift - 12 - 372)}px`,
    );
    expect(cssVar(chromeVars.bottomEndBesideRoom)).toBe(
      `${Math.max(0, 720 + lift - 12 - 60)}px`,
    );
  });

  it("has no rise without a bottom-start slot", () => {
    mount({ bottomStart: undefined });
    resize(390, 800, 0, 68);
    expect(cssVar(chromeVars.bottomEndRise)).toBe("0px");
    expect(cssVar(chromeVars.bottomEndRoom)).toBe(`${744 - 12 - 372}px`);
  });

  it("publishes the room beside the end stack, for credits that do not fit above", () => {
    mount();
    // A short landscape phone: the end stack (72 to 372) reaches past the
    // bottom-end slot's top (390 - 12 - 44 = 334), so there is no room above.
    resize(844, 390);
    expect(cssVar(chromeVars.bottomEndRoom)).toBe("0px");
    // Beside the stack the credits may rise to the gap below the search row
    // (12 + 48 = 60).
    expect(cssVar(chromeVars.bottomEndBesideRoom)).toBe(`${334 - 12 - 60}px`);
    expect(cssVar(chromeVars.endStackWidth)).toBe("48px");
  });

  it("lifts the bottom slots above the sheet and hides them at full", () => {
    mount();
    resize(390, 800);
    expect(cssVar(chromeVars.bottomLift)).toBe("0px");
    const heights = computeDetentHeights({
      viewportHeight: 800,
      insetBottom: 0,
    });
    const top = 800 - heights.half;
    act(() => {
      layoutValue.publishSheetTop(top);
      surfaceValue.publishSheetDetent("half");
    });
    const expected = computeBottomSlotLayout({
      layout: "sheet",
      viewportWidth: 390,
      viewportHeight: 800,
      sheetTopEdge: top,
      sheetDetent: "half",
      panelRightEdge: null,
      measureToolbarTop: null,
      inset: 12,
    });
    expect(cssVar(chromeVars.bottomLift)).toBe(
      `${expected.bottomEndTranslateY}px`,
    );
    expect(cssVar(chromeVars.bottomCentreLift)).toBe(
      `${expected.bottomEndTranslateY}px`,
    );
    expect(root()).toHaveAttribute("data-hide-bottom", "false");
    // The end stack now stops above the lifted bottom row.
    expect(surfaceValue.endStackMaxHeight).toBe(
      744 + expected.bottomEndTranslateY - 12 - 72,
    );

    act(() => {
      layoutValue.publishSheetTop(12);
      surfaceValue.publishSheetDetent("full" satisfies SheetDetent);
    });
    expect(root()).toHaveAttribute("data-hide-bottom", "true");

    act(() => {
      layoutValue.publishSheetTop(null);
      surfaceValue.publishSheetDetent(null);
    });
    expect(cssVar(chromeVars.bottomLift)).toBe("0px");
    expect(root()).toHaveAttribute("data-hide-bottom", "false");
  });

  it("hides the tour card while it would run into the bottom row, and shows it again", () => {
    mount({ tour: <div>tour</div> });
    // A small phone: the welcome card (72 to 349) is clear of the bottom row
    // at rest (568 - 12 - 44 = 512).
    resize(320, 568, 277);
    expect(slot("tour")).toHaveAttribute("data-crowded", "false");
    expect(slot("tour")).not.toHaveAttribute("inert");

    // At half the bottom row rides above the sheet, whose top is above the
    // card's bottom edge, so the card gives way.
    const heights = computeDetentHeights({
      viewportHeight: 568,
      insetBottom: 0,
    });
    act(() => {
      layoutValue.publishSheetTop(568 - heights.half);
      surfaceValue.publishSheetDetent("half");
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "true");
    expect(slot("tour")).toHaveAttribute("inert");

    act(() => {
      layoutValue.publishSheetTop(null);
      surfaceValue.publishSheetDetent(null);
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "false");
  });

  it("keeps the tour card when the bottom row clears it, even beside a sheet", () => {
    mount({ tour: <div>tour</div> });
    resize(390, 844, 190);
    const heights = computeDetentHeights({
      viewportHeight: 844,
      insetBottom: 0,
    });
    act(() => {
      layoutValue.publishSheetTop(844 - heights.half);
      surfaceValue.publishSheetDetent("half");
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "false");
  });

  it("hides the tour card while a tall measure toolbar lifts the bottom row to it, and shows it again", () => {
    mount({ tour: <div>tour</div> });
    resize(390, 800, 190);
    act(() => {
      layoutValue.publishToolbarTop(300);
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "true");
    expect(surfaceValue.tourHidden).toBe(true);
    act(() => {
      layoutValue.publishToolbarTop(null);
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "false");
    expect(surfaceValue.tourHidden).toBe(false);
  });

  it("hides the tour card while something tall in bottom-centre lifts the bottom row to it, and shows it again", () => {
    mount({ tour: <div>tour</div> });
    resize(390, 800, 190);
    place("bottom-centre", 300, 40);
    act(() => {
      observers.trigger();
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "true");
    expect(slot("tour")).toHaveAttribute("inert");
    place("bottom-centre", 788, 0);
    act(() => {
      observers.trigger();
    });
    expect(slot("tour")).toHaveAttribute("data-crowded", "false");
    expect(slot("tour")).not.toHaveAttribute("inert");
  });

  it("tells the tour card its slot is hidden while the sheet is modal, and shown again after", () => {
    const view = mount({ tour: <div>tour</div>, modal: true });
    resize(390, 800, 190);
    expect(surfaceValue.tourHidden).toBe(true);
    expect(slot("tour")).toHaveAttribute("inert");
    view.rerenderChrome({ modal: false });
    expect(surfaceValue.tourHidden).toBe(false);
  });

  it("lifts the start and end slots above the measure toolbar, but not the toolbar", () => {
    mount();
    resize(390, 800);
    act(() => {
      layoutValue.publishToolbarTop(700);
    });
    expect(cssVar(chromeVars.bottomLift)).toBe(`${700 - 12 - (800 - 12)}px`);
    expect(cssVar(chromeVars.bottomCentreLift)).toBe("0px");
    act(() => {
      layoutValue.publishToolbarTop(null);
    });
    expect(cssVar(chromeVars.bottomLift)).toBe("0px");
  });

  it("treats anything shown in bottom-centre as an obstruction", () => {
    mount();
    resize(390, 800);
    place("bottom-centre", 800 - 12 - 40, 40);
    act(() => {
      observers.trigger();
    });
    expect(cssVar(chromeVars.bottomLift)).toBe(`${800 - 12 - 40 - 12 - 788}px`);
  });

  it("moves bottom-start clear of the side panel", () => {
    mount();
    resize(1024, 768);
    act(() => {
      surfaceValue.publishPanelEdge(372);
    });
    expect(cssVar(chromeVars.bottomStartX)).toBe("372px");
    expect(cssVar(chromeVars.bottomLift)).toBe("0px");
  });

  it("tells the surfaces where the side panel ends", () => {
    mount();
    resize(1024, 768);
    expect(layoutValue.panelEdge).toBeNull();
    act(() => {
      surfaceValue.publishPanelEdge(372);
    });
    expect(layoutValue.panelEdge).toBe(372);
  });

  it("observes slots that appear later and re-measures when one goes", () => {
    const { rerenderChrome } = mount({ bottomCentre: undefined });
    resize(390, 800);
    rerenderChrome({ bottomCentre: <div>toolbar</div> });
    expect(observers.isObserved(slot("bottom-centre"))).toBe(true);
    place("bottom-centre", 800 - 12 - 40, 40);
    act(() => {
      observers.trigger();
    });
    expect(cssVar(chromeVars.bottomLift)).not.toBe("0px");
    rerenderChrome({ bottomCentre: undefined });
    expect(cssVar(chromeVars.bottomLift)).toBe("0px");
  });

  it("keeps each slot's ref stable across renders", () => {
    const { rerenderChrome } = mount();
    resize(390, 800);
    const before = slot("top-start");
    rerenderChrome({ modal: true });
    expect(slot("top-start")).toBe(before);
    expect(observers.isObserved(before)).toBe(true);
  });

  it("measures again once the grid changes for a new layout", () => {
    mount();
    resize(390, 800);
    // The grid moves the end stack up to the first row in the panel layout,
    // without the stack itself changing size.
    Object.defineProperty(slot("end-stack"), "offsetTop", {
      configurable: true,
      get: () => (root().dataset.layout === "panel" ? 12 : 72),
    });
    mockRect(root(), { left: 0, top: 0, width: 1024, height: 800 });
    act(() => {
      observers.trigger();
    });
    expect(root()).toHaveAttribute("data-layout", "panel");
    expect(surfaceValue.endStackMaxHeight).toBe(744 - 12 - 12);
  });

  it("keeps the narrow-screen default where ResizeObserver is missing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const onViewportChange = vi.fn();
    mount({ onViewportChange });
    expect(layoutValue.layout).toBe("sheet");
    expect(surfaceValue.endStackMaxHeight).toBeNull();
    expect(onViewportChange).not.toHaveBeenCalled();
    expect(cssVar(chromeVars.bottomLift)).toBe("");
  });

  it("stops observing when unmounted", () => {
    const { unmount } = mount();
    expect(observers.active).toBe(1);
    unmount();
    expect(observers.active).toBe(0);
  });
});

describe("MapChrome map key slot", () => {
  /** Lays the key slot out where the grid puts it: its bottom edge a gap above the bottom row. */
  function placeKey(height: number, bottom = 732) {
    place("map-key", bottom - height, height);
    act(() => {
      observers.trigger();
    });
  }

  it("sits between the map and the bottom row in reading order, and is inert while modal", () => {
    const { rerenderChrome } = mount({ mapKey: <div>key</div> });
    const key = slot("map-key");
    expect(key).toHaveTextContent("key");
    expect(
      screen.getByRole("main").compareDocumentPosition(key) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      key.compareDocumentPosition(slot("bottom-start")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(key).not.toHaveAttribute("inert");
    rerenderChrome({ modal: true });
    expect(key).toHaveAttribute("inert");
  });

  it("is left out when the host gives no key", () => {
    mount();
    expect(root().querySelector('[data-chrome="map-key"]')).toBeNull();
  });

  it("caps the key between the search pill and the bottom row", () => {
    mount({ mapKey: <div>key</div> });
    resize(390, 800);
    placeKey(200);
    // The pill ends at 60 and the bottom row starts at 744: a gap clear of each.
    expect(cssVar(chromeVars.mapKeyRoom)).toBe(`${744 - 12 - (60 + 12)}px`);
    expect(cssVar(chromeVars.mapKeyLift)).toBe("0px");
    expect(slot("map-key")).toHaveAttribute("data-crowded", "false");
    expect(slot("map-key")).not.toHaveAttribute("inert");
  });

  it("rides above the sheet with the bottom row, with less room", () => {
    mount({ mapKey: <div>key</div> });
    resize(390, 800);
    placeKey(60);
    const heights = computeDetentHeights({
      viewportHeight: 800,
      insetBottom: 0,
    });
    const lift = computeBottomSlotLayout({
      layout: "sheet",
      viewportWidth: 390,
      viewportHeight: 800,
      sheetTopEdge: 800 - heights.peek,
      sheetDetent: "peek",
      panelRightEdge: null,
      measureToolbarTop: null,
      inset: 12,
    }).bottomEndTranslateY;
    act(() => {
      layoutValue.publishSheetTop(800 - heights.peek);
      surfaceValue.publishSheetDetent("peek");
    });
    expect(lift).toBeLessThan(0);
    expect(cssVar(chromeVars.mapKeyLift)).toBe(`${lift}px`);
    expect(cssVar(chromeVars.mapKeyRoom)).toBe(`${744 + lift - 12 - 72}px`);
  });

  it("lifts it above a taller bottom row by the row's own position, not the row's lift twice", () => {
    mount({ mapKey: <div>key</div> });
    resize(390, 800);
    // A toolbar makes the row taller, so the key's natural bottom is already above it.
    place("bottom-centre", 700, 88);
    placeKey(60, 688);
    act(() => {
      layoutValue.publishToolbarTop(700);
    });
    const lift = 700 - 12 - (800 - 12);
    // Target bottom: the lifted scale bar's top (744 + lift) a gap above.
    expect(cssVar(chromeVars.mapKeyLift)).toBe(`${744 + lift - 12 - 688}px`);
  });

  it("hides while there is no room for the chip, and returns when there is", () => {
    mount({ mapKey: <div>key</div> });
    resize(320, 568);
    placeKey(60, 500);
    // A tall toolbar lifts the bottom row to 150, leaving 10 px under the pill.
    act(() => {
      layoutValue.publishToolbarTop(150);
    });
    expect(cssVar(chromeVars.mapKeyRoom)).toBe("48px");
    expect(slot("map-key")).toHaveAttribute("data-crowded", "true");
    expect(slot("map-key")).toHaveAttribute("inert");
    act(() => {
      layoutValue.publishToolbarTop(null);
    });
    expect(slot("map-key")).toHaveAttribute("data-crowded", "false");
    expect(slot("map-key")).not.toHaveAttribute("inert");
  });

  it("keeps clear of the tour card while it shows, and uses the room under the search pill once it goes", () => {
    const view = mount({ mapKey: <div>key</div>, tour: <div>tour</div> });
    resize(390, 800, 190);
    placeKey(60);
    // The card ends at 262, so the key may use 744 - 12 - (262 + 12).
    expect(cssVar(chromeVars.mapKeyRoom)).toBe(`${744 - 12 - (262 + 12)}px`);
    view.rerenderChrome({ tour: undefined });
    act(() => {
      observers.trigger();
    });
    expect(cssVar(chromeVars.mapKeyRoom)).toBe(`${744 - 12 - (60 + 12)}px`);
  });

  it("measures again once a slot has left the page, because the key's resting place moves with the row", () => {
    const view = mount({ mapKey: <div>key</div> });
    resize(390, 800);
    const centre = slot("bottom-centre");
    // A taller bottom row (the toolbar) has the key rest 72 px higher.
    Object.defineProperty(slot("map-key"), "offsetTop", {
      get: () => (root().contains(centre) ? 600 : 672),
      configurable: true,
    });
    Object.defineProperty(slot("map-key"), "offsetHeight", {
      value: 60,
      configurable: true,
    });
    act(() => {
      observers.trigger();
    });
    expect(cssVar(chromeVars.mapKeyLift)).toBe(`${744 - 12 - 660}px`);

    view.rerenderChrome({ bottomCentre: undefined });

    expect(cssVar(chromeVars.mapKeyLift)).toBe(`${744 - 12 - 732}px`);
  });

  it("sets nothing while the slot has no size, as when no layer has a key", () => {
    mount({ mapKey: <div>key</div> });
    resize(390, 800);
    placeKey(0);
    expect(cssVar(chromeVars.mapKeyRoom)).toBe("");
    expect(slot("map-key")).toHaveAttribute("data-crowded", "false");
  });
});

describe("chrome internals outside a MapChrome", () => {
  it("give harmless defaults and well-formed variable references", () => {
    render(<Probe />);
    expect(surfaceValue.endStackMaxHeight).toBeNull();
    expect(() => {
      surfaceValue.publishSheetDetent("full");
      surfaceValue.publishPanelEdge(10);
    }).not.toThrow();
    expect(chromeVar(chromeVars.width, "0px")).toBe("var(--chrome-width, 0px)");
  });
});

describe("MapChrome with a real Sheet", () => {
  function SheetHarness({ detent }: { detent: SheetDetent }) {
    return (
      <Sheet
        id="options"
        open
        title="Map options"
        detent={detent}
        onClose={() => {}}
        onDetentChange={() => {}}
      >
        content
      </Sheet>
    );
  }

  it("rides the bottom slots above the sheet it renders", () => {
    const { rerenderChrome } = mount({ sheet: <SheetHarness detent="half" /> });
    resize(390, 800);
    const heights = computeDetentHeights({
      viewportHeight: 800,
      insetBottom: 0,
    });
    expect(cssVar(chromeVars.bottomLift)).toBe(
      `${800 - heights.half - 12 - 788}px`,
    );
    rerenderChrome({ sheet: <SheetHarness detent="full" /> });
    expect(root()).toHaveAttribute("data-hide-bottom", "true");
    expect(screen.getByRole("dialog", { name: "Map options" })).toHaveAttribute(
      "data-chrome",
      "sheet",
    );
  });
});
