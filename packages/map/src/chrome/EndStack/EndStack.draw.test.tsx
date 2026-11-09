import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusRegistryProvider, useFocusReturn } from "../focusRegistry";
import {
  ChromeSurfaceContext,
  type ChromeSurfaceValue,
} from "../MapChrome/chromeSurface";
import { renderChrome } from "../MapChrome/chromeTestHarness";
import {
  EndStack,
  type EndStackProps,
  endStackMinHeightForZoom,
} from "./EndStack";
import { EndStackSkeleton } from "./EndStackSkeleton";

function props(overrides: Partial<EndStackProps> = {}): EndStackProps {
  return {
    bearing: 0,
    onResetBearing: vi.fn(),
    mapOptionsOpen: false,
    mapOptionsControls: "map-options-sheet",
    onMapOptions: vi.fn(),
    measuring: false,
    onMeasure: vi.fn(),
    locating: false,
    onLocate: vi.fn(),
    canZoomIn: true,
    canZoomOut: true,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    ...overrides,
  };
}

const surface: ChromeSurfaceValue = {
  publishSheetDetent: () => {},
  publishPanelEdge: () => {},
  endStackMaxHeight: null,
};

function Restorer() {
  const restore = useFocusReturn();
  return (
    <button type="button" onClick={() => restore("draw")}>
      back to draw
    </button>
  );
}

function stack(overrides: Partial<EndStackProps> = {}) {
  return (
    <ChromeSurfaceContext.Provider value={surface}>
      <FocusRegistryProvider focusMap={() => {}}>
        <EndStack {...props(overrides)} />
        <Restorer />
      </FocusRegistryProvider>
    </ChromeSurfaceContext.Provider>
  );
}

describe("EndStack with drawing", () => {
  it("has no Draw button unless the host offers drawing", () => {
    renderChrome(stack());
    expect(screen.queryByRole("button", { name: "Draw shapes" })).toBeNull();
  });

  it("puts Draw shapes between Measure and Locate me", () => {
    renderChrome(stack({ onDraw: vi.fn() }));
    const main = screen.getByRole("group", { name: "Map controls" });
    expect(
      within(main)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Map options",
      "Measure distance and area",
      "Draw shapes",
      "Locate me",
    ]);
  });

  it("is a toggle that calls back and shows when drawing is on", () => {
    const onDraw = vi.fn();
    const { rerenderChrome } = renderChrome(stack({ onDraw, drawing: false }));
    const button = screen.getByRole("button", { name: "Draw shapes" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onDraw).toHaveBeenCalledTimes(1);
    rerenderChrome(stack({ onDraw, drawing: true }));
    expect(screen.getByRole("button", { name: "Draw shapes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("is a focus target, so closing the tool puts focus back on it", () => {
    renderChrome(stack({ onDraw: vi.fn() }));
    fireEvent.click(screen.getByRole("button", { name: "back to draw" }));
    expect(screen.getByRole("button", { name: "Draw shapes" })).toHaveFocus();
  });

  it("needs room for the extra button before the zoom group shows", () => {
    const plain = endStackMinHeightForZoom(false);
    expect(endStackMinHeightForZoom(false, false, true)).toBe(plain + 48 + 1);
    expect(endStackMinHeightForZoom(false, true, true)).toBe(
      plain + 2 * (48 + 1),
    );
  });
});

describe("EndStackSkeleton with drawing", () => {
  it("draws the Draw shapes button only when asked, in the same place as the live stack", () => {
    const { container, rerenderChrome } = renderChrome(<EndStackSkeleton />);
    expect(
      container.querySelectorAll('[aria-label="Draw shapes"]'),
    ).toHaveLength(0);
    rerenderChrome(<EndStackSkeleton draw />);
    const labels = [
      ...container.querySelectorAll('[data-skeleton="controls"] button'),
    ].map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Map options",
      "Measure distance and area",
      "Draw shapes",
      "Locate me",
    ]);
  });
});
