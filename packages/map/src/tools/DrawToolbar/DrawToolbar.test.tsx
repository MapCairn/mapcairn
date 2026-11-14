// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeMapAdapter,
  FakeMapHost,
  type LatLng,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusRegistryProvider } from "../../chrome/focusRegistry";
import {
  ChromeLayoutProvider,
  type ChromeLayoutValue,
} from "../../chrome/layoutContext";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { DrawToolbar } from "./DrawToolbar";
import { type UseDraw, useDraw } from "./useDraw";

const CENTRE: LatLng = { lat: 48.8566, lng: 2.3522 };
const p = (lng: number, lat: number): LatLng => ({ lat, lng });

const OPTIONS = {
  basemap: {
    id: "x",
    name: "X",
    source: { kind: "vector", styleUrl: "https://x.test/style" },
    minZoom: 0,
    maxZoom: 20,
    thumbnail: "",
    attribution: [],
    appearance: "light",
  } as const,
  reducedMotion: true,
  view: { center: CENTRE, zoom: 14, bearing: 0 },
};

let drawApi: UseDraw;
let adapter: FakeMapAdapter;
const onDone = vi.fn();
const onOpenShapes = vi.fn();
const focusMap = vi.fn();

function Harness({ active = true }: { active?: boolean }) {
  const api = useDraw({
    units: "metric",
    active,
    getAdapter: () => adapter,
  });
  drawApi = api;
  return <DrawToolbar draw={api} onDone={onDone} onOpenShapes={onOpenShapes} />;
}

const layout: ChromeLayoutValue = {
  layout: "sheet",
  viewport: { width: 400, height: 800 },
  finePointer: true,
  panelEdge: null,
  publishSheetTop: () => undefined,
  publishToolbarTop: vi.fn(),
};

async function renderToolbar() {
  adapter = new FakeMapAdapter();
  await adapter.mount(new FakeMapHost(), OPTIONS);
  return render(
    <ServicesProvider services={createFakeServices()}>
      <LiveRegionProvider>
        <FocusRegistryProvider focusMap={focusMap}>
          <ChromeLayoutProvider value={layout}>
            <Harness />
          </ChromeLayoutProvider>
        </FocusRegistryProvider>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
}

function draw(...points: LatLng[]) {
  for (const point of points) {
    act(() => drawApi.addPoint(point));
  }
}

const TRIANGLE = [p(2.35, 48.85), p(2.36, 48.85), p(2.35, 48.86)];

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  onDone.mockReset();
  onOpenShapes.mockReset();
  focusMap.mockReset();
});

describe("DrawToolbar", () => {
  it("is a toolbar named Draw inside a landmark named Drawing, with focus on the shape type", async () => {
    await renderToolbar();
    expect(screen.getByRole("region", { name: "Drawing" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Draw" })).toBe(
      screen.getByTestId("draw-toolbar"),
    );
    expect(screen.getByRole("radio", { name: "Polygon" })).toHaveFocus();
    expect(
      screen.getByRole("radiogroup", { name: "Shape to draw" }),
    ).toBeInTheDocument();
  });

  it("publishes its top edge so the slots below it ride above", async () => {
    await renderToolbar();
    expect(layout.publishToolbarTop).toHaveBeenCalled();
  });

  it("changes what is drawn from the shape switch", async () => {
    await renderToolbar();
    fireEvent.click(screen.getByRole("radio", { name: "Circle" }));
    expect(drawApi.mode).toBe("circle");
    expect(screen.getByText(/set the radius/)).toBeInTheDocument();
  });

  it("shows the name and measures of the shape being drawn, with a hint", async () => {
    await renderToolbar();
    expect(screen.getByTestId("draw-status")).toHaveTextContent(
      "Nothing drawn yet",
    );
    expect(screen.queryByTestId("draw-measure")).toBeNull();
    draw(...TRIANGLE);
    expect(screen.getByTestId("draw-status")).toHaveTextContent(
      "Polygon 1, 3 points",
    );
    expect(screen.getByTestId("draw-measure").textContent).toMatch(/ha|m²/);
  });

  describe("the buttons", () => {
    it("adds a point at the map centre", async () => {
      await renderToolbar();
      fireEvent.click(button("Add point at map centre"));
      expect(drawApi.draft?.vertices).toHaveLength(1);
    });

    it("moves the selected point instead once one is selected", async () => {
      await renderToolbar();
      draw(...TRIANGLE);
      fireEvent.click(button("Finish"));
      fireEvent.click(button("Next point"));
      expect(button("Move point to map centre")).toBeInTheDocument();
      adapter.setView({ center: p(2.5, 48.9) });
      fireEvent.click(button("Move point to map centre"));
      expect(drawApi.shapes[0]?.vertices[0]?.lng).toBeCloseTo(2.5, 4);
    });

    it("undoes and redoes, disabled when there is nothing to do", async () => {
      await renderToolbar();
      expect(button("Undo")).toHaveAttribute("aria-disabled", "true");
      expect(button("Redo")).toHaveAttribute("aria-disabled", "true");
      draw(...TRIANGLE.slice(0, 2));
      fireEvent.click(button("Undo"));
      expect(drawApi.draft?.vertices).toHaveLength(1);
      fireEvent.click(button("Redo"));
      expect(drawApi.draft?.vertices).toHaveLength(2);
    });

    it("is one button for Finish and Done, so focus stays on it", async () => {
      await renderToolbar();
      const primary = screen.getByTestId("draw-done");
      expect(primary).toHaveTextContent("Done");
      fireEvent.click(primary);
      expect(onDone).toHaveBeenCalledTimes(1);
      draw(...TRIANGLE);
      expect(screen.getByTestId("draw-done")).toBe(primary);
      expect(primary).toHaveTextContent("Finish");
      fireEvent.click(primary);
      expect(drawApi.draft).toBeNull();
      expect(primary).toHaveTextContent("Done");
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("is one button for Cancel and Delete, disabled until there is a shape", async () => {
      await renderToolbar();
      const remove = screen.getByTestId("draw-remove");
      expect(remove).toHaveAttribute("aria-disabled", "true");
      draw(...TRIANGLE);
      expect(remove).toHaveAccessibleName("Cancel shape");
      fireEvent.click(remove);
      expect(drawApi.shapes).toEqual([]);
      draw(...TRIANGLE);
      fireEvent.click(button("Finish"));
      expect(remove).toHaveAccessibleName("Delete shape");
      fireEvent.click(remove);
      expect(drawApi.shapes).toEqual([]);
    });

    it("opens the list of shapes", async () => {
      await renderToolbar();
      fireEvent.click(button("Shapes and export"));
      expect(onOpenShapes).toHaveBeenCalledTimes(1);
    });
  });

  describe("the selected shape's group", () => {
    async function withTriangle() {
      await renderToolbar();
      draw(...TRIANGLE);
      fireEvent.click(button("Finish"));
    }

    it("appears for a finished line or polygon, named by the shape and its points", async () => {
      await withTriangle();
      const group = screen.getByTestId("draw-selected-group");
      expect(group.tagName.toLowerCase()).toBe("fieldset");
      expect(screen.getByRole("group", { name: /Polygon 1, 3 points/ })).toBe(
        group,
      );
      fireEvent.click(button("Next point"));
      expect(screen.getByTestId("draw-selected-label")).toHaveTextContent(
        "Polygon 1, point 1 of 3",
      );
    });

    it("steps back and forward through the points", async () => {
      await withTriangle();
      fireEvent.click(button("Previous point"));
      expect(drawApi.selection?.vertex).toBe(2);
      fireEvent.click(button("Next point"));
      expect(drawApi.selection?.vertex).toBe(0);
    });

    it("disables adding and removing a point until one is selected", async () => {
      await withTriangle();
      expect(button("Remove point")).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button("Next point"));
      expect(button("Remove point")).not.toHaveAttribute("aria-disabled");
    });

    it("inserts a point after the selected one at the map centre", async () => {
      await withTriangle();
      fireEvent.click(button("Next point"));
      fireEvent.click(button("Add point after this one at map centre"));
      expect(drawApi.shapes[0]?.vertices).toHaveLength(4);
    });

    it("moves the selected point with the arrow keys from inside the group", async () => {
      await withTriangle();
      fireEvent.click(button("Next point"));
      const before = adapter.project(drawApi.shapes[0]?.vertices[0] as LatLng);
      fireEvent.keyDown(button("Next point"), { key: "ArrowRight" });
      const after = adapter.project(drawApi.shapes[0]?.vertices[0] as LatLng);
      expect(after.x - before.x).toBeCloseTo(8, 3);
    });

    it("removes the selected point with Delete, and steps with the bracket keys", async () => {
      await renderToolbar();
      draw(p(2.35, 48.85), p(2.36, 48.85), p(2.36, 48.86), p(2.35, 48.86));
      fireEvent.click(button("Finish"));
      fireEvent.click(button("Next point"));
      fireEvent.keyDown(button("Next point"), { key: "]" });
      expect(drawApi.selection?.vertex).toBe(1);
      fireEvent.keyDown(button("Next point"), { key: "Delete" });
      expect(drawApi.shapes[0]?.vertices).toHaveLength(3);
    });

    it("leaves the arrow keys to the shape switch", async () => {
      await withTriangle();
      fireEvent.click(button("Next point"));
      const before = drawApi.shapes[0]?.vertices[0];
      fireEvent.keyDown(screen.getByRole("radio", { name: "Polygon" }), {
        key: "ArrowRight",
      });
      expect(drawApi.shapes[0]?.vertices[0]).toEqual(before);
    });

    it("shows a circle's radius buttons", async () => {
      await renderToolbar();
      fireEvent.click(screen.getByRole("radio", { name: "Circle" }));
      draw(p(2.3, 48.85), p(2.31, 48.85));
      const before = drawApi.shapes[0]?.radiusMetres ?? 0;
      fireEvent.click(button("Larger radius"));
      expect(drawApi.shapes[0]?.radiusMetres).toBeCloseTo(before * 1.1, 3);
      fireEvent.click(button("Smaller radius"));
      expect(drawApi.shapes[0]?.radiusMetres).toBeCloseTo(before, 3);
      adapter.setView({ center: p(2.35, 48.85) });
      fireEvent.click(button("Set radius to map centre"));
      expect(drawApi.shapes[0]?.radiusMetres).toBeGreaterThan(before * 3);
    });

    it("has no group for a point shape", async () => {
      await renderToolbar();
      fireEvent.click(screen.getByRole("radio", { name: "Point" }));
      draw(CENTRE);
      expect(screen.queryByTestId("draw-selected-group")).toBeNull();
      expect(button("Add point at map centre")).toBeInTheDocument();
      act(() => drawApi.select(drawApi.shapes[0]?.id ?? ""));
      expect(button("Move point to map centre")).toBeInTheDocument();
    });

    it("tells the person when an edit made the shape invalid", async () => {
      await renderToolbar();
      draw(p(0, 0), p(2, 0), p(2, 2), p(0, 2));
      fireEvent.click(button("Finish"));
      expect(screen.queryByTestId("draw-issue")).toBeNull();
      fireEvent.click(button("Next point"));
      fireEvent.click(button("Next point"));
      fireEvent.click(button("Next point"));
      act(() => drawApi.moveSelectedTo(p(-3, 1)));
      expect(screen.getByTestId("draw-issue")).toHaveTextContent("cross");
    });
  });

  describe("keys", () => {
    it("undoes with Control and Z from anywhere in the toolbar", async () => {
      await renderToolbar();
      draw(...TRIANGLE.slice(0, 2));
      const event = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        button("Add point at map centre").dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
      expect(drawApi.draft?.vertices).toHaveLength(1);
    });

    it("steps back with Escape, and leaves Escape alone when there is nothing to step back from", async () => {
      await renderToolbar();
      draw(...TRIANGLE.slice(0, 2));
      const first = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        button("Undo").dispatchEvent(first);
      });
      expect(first.defaultPrevented).toBe(true);
      expect(drawApi.draft).toBeNull();
      const second = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        button("Undo").dispatchEvent(second);
      });
      expect(second.defaultPrevented).toBe(false);
    });

    it("ignores a key a handler before it already took", async () => {
      await renderToolbar();
      draw(...TRIANGLE.slice(0, 2));
      const toolbar = screen.getByTestId("draw-toolbar");
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      event.preventDefault();
      act(() => {
        toolbar.dispatchEvent(event);
      });
      expect(drawApi.draft).not.toBeNull();
    });
  });

  describe("focus return", () => {
    it("registers its Shapes button for focus to come back to", async () => {
      await renderToolbar();
      expect(
        within(screen.getByTestId("draw-toolbar")).getByTestId("draw-shapes"),
      ).toHaveAttribute("data-focus-target", "draw-shapes");
    });
  });
});
