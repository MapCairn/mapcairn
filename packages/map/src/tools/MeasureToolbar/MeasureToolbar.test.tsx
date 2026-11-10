import type { LatLng, UnitSystem } from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChromeLayoutProvider,
  type ChromeLayoutValue,
} from "../../chrome/layoutContext";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { MeasureToolbar } from "./MeasureToolbar";
import { type UseMeasure, useMeasure } from "./useMeasure";

const ORIGIN: LatLng = { lat: 0, lng: 0 };
const ONE_DEGREE_EAST: LatLng = { lat: 0, lng: 1 };

let measureApi: UseMeasure;

interface HarnessProps {
  readonly units?: UnitSystem;
  readonly onDone?: () => void;
  readonly onAddPointAtCentre?: () => void;
}

function Harness({
  units = "metric",
  onDone = () => undefined,
  onAddPointAtCentre = () => undefined,
}: HarnessProps) {
  const measure = useMeasure(units);
  measureApi = measure;
  return (
    <MeasureToolbar
      measure={measure}
      onAddPointAtCentre={onAddPointAtCentre}
      onDone={onDone}
    />
  );
}

function layout(
  publishToolbarTop: (px: number | null) => void,
  size = { width: 400, height: 800 },
): ChromeLayoutValue {
  return {
    layout: "sheet",
    viewport: size,
    finePointer: true,
    panelEdge: null,
    bottomReserve: 0,
    publishSheetTop: () => undefined,
    publishToolbarTop,
  };
}

function renderToolbar(props: HarnessProps = {}) {
  const publish = vi.fn<(px: number | null) => void>();
  const tree = (value: ChromeLayoutValue) => (
    <LiveRegionProvider>
      <ChromeLayoutProvider value={value}>
        <Harness {...props} />
      </ChromeLayoutProvider>
    </LiveRegionProvider>
  );
  const view = render(tree(layout(publish)));
  return {
    ...view,
    publish,
    rerenderWithLayout: (value: ChromeLayoutValue) =>
      view.rerender(tree(value)),
  };
}

let top = 480;
let observerCallbacks: (() => void)[] = [];

class FakeResizeObserver {
  readonly disconnect = vi.fn();
  readonly observe = vi.fn();
  constructor(callback: () => void) {
    observerCallbacks.push(callback);
  }
}

describe("MeasureToolbar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    top = 480;
    observerCallbacks = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top }) as DOMRect,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("structure", () => {
    it("is a toolbar named Measure", () => {
      renderToolbar();
      const toolbar = screen.getByRole("toolbar", { name: "Measure" });
      expect(toolbar).toBe(screen.getByTestId("measure-toolbar"));
      expect(
        toolbar.closest("[data-chrome]")?.getAttribute("data-chrome"),
      ).toBe("measure-toolbar");
    });

    it("sits in a landmark named Measurement, so it is inside a landmark wherever it is placed", () => {
      renderToolbar();
      const region = screen.getByRole("region", { name: "Measurement" });
      expect(region.tagName).toBe("SECTION");
      expect(region).toHaveAttribute("data-chrome", "measure-toolbar");
      expect(region).toContainElement(
        screen.getByRole("toolbar", { name: "Measure" }),
      );
    });

    it("has a Distance and Area switch, with Distance chosen first", () => {
      renderToolbar();
      const group = screen.getByRole("radiogroup", { name: "Measure" });
      expect(within(group).getAllByRole("radio")).toHaveLength(2);
      expect(within(group).getByRole("radio", { name: "Area" })).toBeTruthy();
      expect(
        within(group)
          .getByRole("radio", { name: "Distance" })
          .getAttribute("aria-checked"),
      ).toBe("true");
    });

    it("has the add point, undo, clear and Done controls and the hint", () => {
      renderToolbar();
      for (const name of [
        "Add point at map centre",
        "Undo last point",
        "Clear points",
        "Done",
      ]) {
        expect(screen.getByRole("button", { name })).toBeTruthy();
      }
      expect(
        screen.getByText(
          "Tap the map to add points, or use Add point at map centre.",
        ),
      ).toBeTruthy();
    });

    it("shows the readout as plain text, labelled for a screen reader", () => {
      renderToolbar();
      const readout = screen.getByTestId("measure-readout");
      expect(readout.textContent).toBe("0 m");
      expect(readout.closest("p")?.textContent).toBe("Total 0 m");
      expect(readout.closest("[aria-live], [role=status], [role=alert]")).toBe(
        null,
      );
    });

    it("has no live region of its own and no inline styles", () => {
      const { container } = renderToolbar();
      const toolbar = screen.getByTestId("measure-toolbar");
      expect(toolbar.querySelector("[aria-live]")).toBeNull();
      expect(toolbar.querySelector("[role=status], [role=alert]")).toBeNull();
      // Radix puts a style on the mode switch's group (outline: none); that is
      // the primitive's own, set through the CSSOM, not this component's.
      const styled = [...container.querySelectorAll("[style]")].filter(
        (element) => element.getAttribute("role") !== "radiogroup",
      );
      expect(styled).toHaveLength(0);
    });
  });

  describe("focus", () => {
    it("moves focus to its first button on mount", () => {
      renderToolbar();
      const first = screen
        .getByRole("toolbar", { name: "Measure" })
        .querySelector("button");
      expect(first).not.toBeNull();
      expect(document.activeElement).toBe(first);
    });
  });

  describe("actions", () => {
    it("calls onAddPointAtCentre from the button", () => {
      const onAddPointAtCentre = vi.fn();
      renderToolbar({ onAddPointAtCentre });
      fireEvent.click(
        screen.getByRole("button", { name: "Add point at map centre" }),
      );
      expect(onAddPointAtCentre).toHaveBeenCalledTimes(1);
    });

    it("calls onDone from Done", () => {
      const onDone = vi.fn();
      renderToolbar({ onDone });
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("disables undo and clear until there is a point", () => {
      renderToolbar();
      const undo = screen.getByRole("button", { name: "Undo last point" });
      const clear = screen.getByRole("button", { name: "Clear points" });
      expect(undo.getAttribute("aria-disabled")).toBe("true");
      expect(clear.getAttribute("aria-disabled")).toBe("true");
      act(() => measureApi.addPoint(ORIGIN));
      expect(undo.getAttribute("aria-disabled")).toBeNull();
      expect(clear.getAttribute("aria-disabled")).toBeNull();
    });

    it("undoes the last point", () => {
      renderToolbar();
      act(() => measureApi.addPoint(ORIGIN));
      act(() => measureApi.addPoint(ONE_DEGREE_EAST));
      fireEvent.click(screen.getByRole("button", { name: "Undo last point" }));
      expect(measureApi.points).toEqual([ORIGIN]);
    });

    it("clears every point", () => {
      renderToolbar();
      act(() => measureApi.addPoint(ORIGIN));
      act(() => measureApi.addPoint(ONE_DEGREE_EAST));
      fireEvent.click(screen.getByRole("button", { name: "Clear points" }));
      expect(measureApi.points).toEqual([]);
    });

    it("shows the running total", () => {
      renderToolbar();
      act(() => measureApi.addPoint(ORIGIN));
      act(() => measureApi.addPoint(ONE_DEGREE_EAST));
      expect(screen.getByTestId("measure-readout").textContent).toBe("111 km");
    });

    it("shows the total in imperial units", () => {
      renderToolbar({ units: "imperial" });
      act(() => measureApi.addPoint(ORIGIN));
      act(() => measureApi.addPoint(ONE_DEGREE_EAST));
      expect(screen.getByTestId("measure-readout").textContent).toBe("69.1 mi");
    });

    it("switches to area from the segmented control", () => {
      renderToolbar();
      fireEvent.click(screen.getByRole("radio", { name: "Area" }));
      expect(measureApi.mode).toBe("area");
      expect(screen.getByTestId("measure-readout").textContent).toBe("0 m²");
      fireEvent.click(screen.getByRole("radio", { name: "Distance" }));
      expect(measureApi.mode).toBe("distance");
    });
  });

  describe("publishing its top edge", () => {
    it("publishes the top edge on mount", () => {
      const { publish } = renderToolbar();
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenLastCalledWith(480);
    });

    it("publishes again when the toolbar changes size and its top moves", () => {
      const { publish } = renderToolbar();
      top = 412.4;
      act(() => {
        for (const callback of observerCallbacks) {
          callback();
        }
      });
      expect(publish).toHaveBeenCalledTimes(2);
      expect(publish).toHaveBeenLastCalledWith(412);
    });

    it("does not publish an edge that has not moved", () => {
      const { publish } = renderToolbar();
      act(() => {
        for (const callback of observerCallbacks) {
          callback();
        }
      });
      expect(publish).toHaveBeenCalledTimes(1);
    });

    it("re-measures when the chrome container is resized", () => {
      const { publish, rerenderWithLayout } = renderToolbar();
      top = 300;
      rerenderWithLayout(layout(publish, { width: 400, height: 600 }));
      expect(publish).toHaveBeenLastCalledWith(300);
    });

    it("publishes null when it unmounts, and stops observing", () => {
      const { publish, unmount } = renderToolbar();
      unmount();
      expect(publish).toHaveBeenLastCalledWith(null);
    });

    it("publishes only once when ResizeObserver is unavailable", () => {
      vi.stubGlobal("ResizeObserver", undefined);
      const { publish, unmount } = renderToolbar();
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenLastCalledWith(480);
      unmount();
      expect(publish).toHaveBeenLastCalledWith(null);
    });

    it("works with the default layout outside a MapChrome", () => {
      render(
        <LiveRegionProvider>
          <Harness />
        </LiveRegionProvider>,
      );
      expect(screen.getByRole("toolbar", { name: "Measure" })).toBeTruthy();
    });
  });
});
