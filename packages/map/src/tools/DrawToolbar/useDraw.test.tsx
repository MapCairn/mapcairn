// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  decodeShapes,
  encodeShapes,
  FakeMapAdapter,
  FakeMapHost,
  type FakeServices,
  type LatLng,
  type UnitSystem,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import { DRAW_ANNOUNCE_DELAY_MS, type UseDraw, useDraw } from "./useDraw";

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

interface Rig {
  readonly result: { current: UseDraw };
  readonly services: FakeServices;
  readonly adapter: FakeMapAdapter;
}

async function setup(
  options: {
    units?: UnitSystem;
    active?: boolean;
    services?: FakeServices;
  } = {},
): Promise<Rig> {
  const services = options.services ?? createFakeServices();
  const adapter = new FakeMapAdapter();
  await adapter.mount(new FakeMapHost(), OPTIONS);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{children}</LiveRegionProvider>
    </ServicesProvider>
  );
  const view = renderHook(
    () =>
      useDraw({
        units: options.units ?? "metric",
        active: options.active ?? true,
        getAdapter: () => adapter,
      }),
    { wrapper },
  );
  return { result: view.result, services, adapter };
}

const polite = () => screen.getByTestId("live-region-polite").textContent;

function expectNear(actual: LatLng | undefined, expected: LatLng) {
  expect(actual?.lat).toBeCloseTo(expected.lat, 6);
  expect(actual?.lng).toBeCloseTo(expected.lng, 6);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function addAll(rig: Rig, points: readonly LatLng[]) {
  for (const point of points) {
    act(() => rig.result.current.addPoint(point));
  }
}

const TRIANGLE = [p(2.35, 48.85), p(2.36, 48.85), p(2.35, 48.86)];

describe("useDraw", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("drawing", () => {
    it("starts empty in polygon mode", async () => {
      const { result } = await setup();
      expect(result.current.shapes).toEqual([]);
      expect(result.current.mode).toBe("polygon");
      expect(result.current.draft).toBeNull();
      expect(result.current.canUndo).toBe(false);
      expect(result.current.handles).toEqual([]);
    });

    it("draws a polygon, shows a live measure and finishes it", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      expect(rig.result.current.draft?.vertices).toHaveLength(3);
      expect(rig.result.current.status).toBe("Polygon 1, 3 points");
      expect(rig.result.current.measure).toMatch(/ha|m²|km²/);
      act(() => rig.result.current.finish());
      expect(rig.result.current.draft).toBeNull();
      expect(rig.result.current.shapes[0]?.done).toBe(true);
      expect(rig.result.current.status).toBe("Polygon 1");
    });

    it("adds a point at the map centre, and moves the selected vertex there", async () => {
      const rig = await setup();
      act(() => rig.result.current.placeAtCentre());
      expectNear(rig.result.current.draft?.vertices[0], CENTRE);
      addAll(rig, [p(2.36, 48.85), p(2.35, 48.86)]);
      act(() => rig.result.current.finish());
      const id = rig.result.current.shapes[0]?.id ?? "";
      act(() => rig.result.current.select(id, 1));
      rig.adapter.setView({ center: p(2.5, 48.9) });
      act(() => rig.result.current.placeAtCentre());
      expect(rig.result.current.shapes[0]?.vertices[1]?.lng).toBeCloseTo(
        2.5,
        4,
      );
    });

    it("changes mode", async () => {
      const rig = await setup();
      act(() => rig.result.current.setMode("circle"));
      expect(rig.result.current.mode).toBe("circle");
    });

    it("sets a circle's radius from the second point and reads it back", async () => {
      const rig = await setup();
      act(() => rig.result.current.setMode("circle"));
      addAll(rig, [CENTRE, p(2.3622, 48.8566)]);
      expect(rig.result.current.shapes[0]?.radiusMetres).toBeGreaterThan(500);
      expect(rig.result.current.measure).toContain("radius");
    });
  });

  describe("undo and redo", () => {
    it("steps back and forward, and reports what is possible", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE.slice(0, 2));
      expect(rig.result.current.canUndo).toBe(true);
      act(() => rig.result.current.undo());
      expect(rig.result.current.draft?.vertices).toHaveLength(1);
      expect(rig.result.current.canRedo).toBe(true);
      act(() => rig.result.current.redo());
      expect(rig.result.current.draft?.vertices).toHaveLength(2);
    });
  });

  describe("editing with the keyboard", () => {
    async function withSelectedVertex() {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      const id = rig.result.current.shapes[0]?.id ?? "";
      act(() => rig.result.current.select(id, 0));
      return { rig, id };
    }

    it("nudges the selected vertex by screen pixels, in one undo step", async () => {
      const { rig } = await withSelectedVertex();
      const before = rig.adapter.project(
        rig.result.current.shapes[0]?.vertices[0] as LatLng,
      );
      act(() => rig.result.current.nudge(8, 0));
      act(() => rig.result.current.nudge(8, 0));
      const after = rig.adapter.project(
        rig.result.current.shapes[0]?.vertices[0] as LatLng,
      );
      expect(after.x - before.x).toBeCloseTo(16, 1);
      expect(after.y - before.y).toBeCloseTo(0, 1);
      act(() => rig.result.current.undo());
      const undone = rig.adapter.project(
        rig.result.current.shapes[0]?.vertices[0] as LatLng,
      );
      expect(undone.x - before.x).toBeCloseTo(0, 1);
    });

    it("does nothing when no vertex is selected", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      act(() => rig.result.current.nudge(8, 0));
      expect(rig.result.current.shapes[0]?.vertices[0]).toEqual(TRIANGLE[0]);
    });

    it("steps through vertices, removes one and inserts one at the map centre", async () => {
      const { rig } = await withSelectedVertex();
      act(() => rig.result.current.stepVertex(1));
      expect(rig.result.current.selection?.vertex).toBe(1);
      act(() => rig.result.current.insertAtCentre());
      expect(rig.result.current.shapes[0]?.vertices).toHaveLength(4);
      expectNear(rig.result.current.shapes[0]?.vertices[2], CENTRE);
      act(() => rig.result.current.removeVertex());
      expect(rig.result.current.shapes[0]?.vertices).toHaveLength(3);
    });

    it("handles key commands: Enter finishes, arrows nudge, Delete removes", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      const key = (name: string) =>
        ({
          key: name,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
        }) as const;
      let consumed = false;
      act(() => {
        consumed = rig.result.current.keyCommand(key("Enter"));
      });
      expect(consumed).toBe(true);
      expect(rig.result.current.draft).toBeNull();
      act(() =>
        rig.result.current.select(rig.result.current.shapes[0]?.id ?? "", 1),
      );
      act(() => {
        consumed = rig.result.current.keyCommand(key("ArrowRight"));
      });
      expect(consumed).toBe(true);
      act(() => {
        consumed = rig.result.current.keyCommand(key("q"));
      });
      expect(consumed).toBe(false);
    });

    it("ignores key commands when the tool is not active", async () => {
      const rig = await setup({ active: false });
      let consumed = true;
      act(() => {
        consumed = rig.result.current.keyCommand({
          key: "Enter",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
        });
      });
      expect(consumed).toBe(false);
    });

    it("places the key command Space at the map centre", async () => {
      const rig = await setup();
      act(() => {
        rig.result.current.keyCommand({
          key: " ",
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
        });
      });
      expectNear(rig.result.current.draft?.vertices[0], CENTRE);
    });
  });

  describe("pointer", () => {
    it("starts a shape on a click, and adds to it on the next", async () => {
      const rig = await setup();
      const click = (latlng: LatLng) =>
        act(() =>
          rig.result.current.onMapClick({
            latlng,
            point: rig.adapter.project(latlng),
          }),
        );
      click(TRIANGLE[0] as LatLng);
      click(TRIANGLE[1] as LatLng);
      expect(rig.result.current.draft?.vertices).toHaveLength(2);
    });

    it("selects a finished shape by its edge but starts a new one inside it", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      act(() => rig.result.current.deselect());
      const click = (latlng: LatLng) =>
        act(() =>
          rig.result.current.onMapClick({
            latlng,
            point: rig.adapter.project(latlng),
          }),
        );
      click(p(2.355, 48.85));
      expect(rig.result.current.selection?.shapeId).toBe(
        rig.result.current.shapes[0]?.id,
      );
      expect(rig.result.current.shapes).toHaveLength(1);
      act(() => rig.result.current.deselect());
      click(p(2.3535, 48.8535));
      expect(rig.result.current.shapes).toHaveLength(2);
    });

    it("ignores clicks when the tool is not active", async () => {
      const rig = await setup({ active: false });
      act(() =>
        rig.result.current.onMapClick({
          latlng: CENTRE,
          point: rig.adapter.project(CENTRE),
        }),
      );
      expect(rig.result.current.shapes).toEqual([]);
    });

    describe("dragging handles", () => {
      async function withPolygon() {
        const rig = await setup();
        addAll(rig, TRIANGLE);
        act(() => rig.result.current.finish());
        const id = rig.result.current.shapes[0]?.id ?? "";
        return { rig, id };
      }

      const drag = (
        rig: Rig,
        id: string,
        phase: "start" | "move" | "end",
        latlng: LatLng,
        moved: boolean,
      ) =>
        act(() =>
          rig.result.current.onHandleDrag({ id, phase, latlng, moved }),
        );

      it("moves a vertex while it is dragged, as one undo step, and selects it", async () => {
        const { rig, id } = await withPolygon();
        const before = rig.result.current.canUndo;
        expect(before).toBe(true);
        const depth = rig.result.current.state.past.length;
        drag(rig, `${id}:v:1`, "start", TRIANGLE[1] as LatLng, false);
        expect(rig.result.current.selection).toEqual({
          shapeId: id,
          vertex: 1,
        });
        drag(rig, `${id}:v:1`, "move", p(2.37, 48.85), true);
        drag(rig, `${id}:v:1`, "move", p(2.38, 48.85), true);
        drag(rig, `${id}:v:1`, "end", p(2.38, 48.85), true);
        expect(rig.result.current.shapes[0]?.vertices[1]).toEqual(
          p(2.38, 48.85),
        );
        expect(rig.result.current.state.past.length).toBe(depth + 1);
      });

      it("inserts a vertex when a midpoint is dragged, and keeps dragging it", async () => {
        const { rig, id } = await withPolygon();
        const depth = rig.result.current.state.past.length;
        drag(rig, `${id}:m:1`, "start", p(2.355, 48.85), false);
        drag(rig, `${id}:m:1`, "move", p(2.355, 48.84), true);
        drag(rig, `${id}:m:1`, "move", p(2.355, 48.83), true);
        drag(rig, `${id}:m:1`, "end", p(2.355, 48.83), true);
        const vertices = rig.result.current.shapes[0]?.vertices ?? [];
        expect(vertices).toHaveLength(4);
        expect(vertices[1]).toEqual(p(2.355, 48.83));
        expect(rig.result.current.state.past.length).toBe(depth + 1);
      });

      it("inserts a vertex at the midpoint on a tap", async () => {
        const { rig, id } = await withPolygon();
        const midpoint = rig.result.current.handles.find(
          (h) => h.id === `${id}:m:1`,
        );
        drag(rig, `${id}:m:1`, "start", midpoint?.position as LatLng, false);
        drag(rig, `${id}:m:1`, "end", midpoint?.position as LatLng, false);
        expect(rig.result.current.shapes[0]?.vertices).toHaveLength(4);
        expect(rig.result.current.selection?.vertex).toBe(1);
      });

      it("changes a circle's radius when its handle is dragged", async () => {
        const rig = await setup();
        act(() => rig.result.current.setMode("circle"));
        addAll(rig, [CENTRE, p(2.3622, 48.8566)]);
        const id = rig.result.current.shapes[0]?.id ?? "";
        const before = rig.result.current.shapes[0]?.radiusMetres ?? 0;
        drag(rig, `${id}:r`, "start", p(2.3622, 48.8566), false);
        drag(rig, `${id}:r`, "move", p(2.3822, 48.8566), true);
        drag(rig, `${id}:r`, "end", p(2.3822, 48.8566), true);
        expect(rig.result.current.shapes[0]?.radiusMetres).toBeGreaterThan(
          before * 1.5,
        );
      });

      it("ignores handle ids it does not know and moves with no press", async () => {
        const { rig } = await withPolygon();
        const shapes = rig.result.current.shapes;
        drag(rig, "nonsense", "start", CENTRE, false);
        drag(rig, "nonsense", "move", CENTRE, true);
        drag(rig, "x:v:0", "move", CENTRE, true);
        expect(rig.result.current.shapes).toBe(shapes);
      });

      it("tracks which handle the mouse is over", async () => {
        const rig = await setup();
        act(() => rig.result.current.onHandleHover("a:v:0"));
        expect(rig.result.current.hoveredHandle).toBe("a:v:0");
        act(() => rig.result.current.onHandleHover(null));
        expect(rig.result.current.hoveredHandle).toBeNull();
      });
    });
  });

  describe("circles by radius from the map centre", () => {
    it("sets the radius to the distance to the map centre, and scales it", async () => {
      const rig = await setup();
      act(() => rig.result.current.setMode("circle"));
      addAll(rig, [p(2.3, 48.85), p(2.31, 48.85)]);
      const id = rig.result.current.shapes[0]?.id ?? "";
      act(() => rig.result.current.select(id));
      act(() => rig.result.current.setRadiusToCentre());
      const radius = rig.result.current.shapes[0]?.radiusMetres ?? 0;
      expect(radius).toBeGreaterThan(3000);
      act(() => rig.result.current.scaleRadius(1.1));
      expect(rig.result.current.shapes[0]?.radiusMetres).toBeCloseTo(
        radius * 1.1,
        3,
      );
      act(() => rig.result.current.scaleRadius(1 / 1.1));
      expect(rig.result.current.shapes[0]?.radiusMetres).toBeCloseTo(radius, 3);
    });
  });

  describe("shapes", () => {
    it("deletes a shape, deletes the selected one and clears all", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      act(() => rig.result.current.setMode("point"));
      addAll(rig, [CENTRE]);
      expect(rig.result.current.shapes).toHaveLength(2);
      act(() => rig.result.current.deleteSelected());
      expect(rig.result.current.shapes).toHaveLength(1);
      act(() =>
        rig.result.current.deleteShape(rig.result.current.shapes[0]?.id ?? ""),
      );
      expect(rig.result.current.shapes).toEqual([]);
      act(() => rig.result.current.undo());
      act(() => rig.result.current.clear());
      expect(rig.result.current.shapes).toEqual([]);
    });

    it("discards an unfinished shape", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.discardDraft());
      expect(rig.result.current.shapes).toEqual([]);
      act(() => rig.result.current.discardDraft());
      expect(rig.result.current.shapes).toEqual([]);
    });

    it("warns when an edit left a polygon with crossing edges", async () => {
      const rig = await setup();
      addAll(rig, [p(0, 0), p(2, 0), p(2, 2), p(0, 2)]);
      act(() => rig.result.current.finish());
      expect(rig.result.current.issue).toBeNull();
      act(() =>
        rig.result.current.select(rig.result.current.shapes[0]?.id ?? "", 2),
      );
      act(() => rig.result.current.moveSelectedTo(p(-3, 1)));
      expect(rig.result.current.issue).toBe("self-intersecting");
      expect(rig.result.current.issueMessage).toContain("cross");
    });
  });

  describe("announcements", () => {
    it("announces points added with the measure, after the first event", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(polite()).toMatch(/^Point 3 added to Polygon 1\. Area /);
    });

    it("announces a refusal assertively", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE.slice(0, 2));
      act(() => rig.result.current.finish());
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(screen.getByTestId("live-region-assertive").textContent).toContain(
        "Not enough points",
      );
    });

    it("announces a moved vertex once, after the drag settles", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      const id = rig.result.current.shapes[0]?.id ?? "";
      for (const lng of [2.351, 2.352, 2.353]) {
        act(() => rig.result.current.select(id, 0));
        act(() => rig.result.current.moveSelectedTo(p(lng, 48.85)));
      }
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(polite()).toMatch(/^Point 1 of Polygon 1 moved\./);
    });

    it("says nothing for a mode change", async () => {
      const rig = await setup();
      act(() => rig.result.current.setMode("line"));
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe("");
    });
  });

  describe("export", () => {
    const rigWithTriangle = async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      return rig;
    };

    it("saves GeoJSON through the file saver and says so", async () => {
      const rig = await rigWithTriangle();
      await act(async () => {
        await rig.result.current.exportGeoJson();
      });
      const file = rig.services.fakes.fileSaver.saved[0];
      expect(file?.filename).toBe("mapcairn-shapes.geojson");
      expect(file?.mimeType).toBe("application/geo+json");
      expect(JSON.parse(file?.content ?? "{}").features).toHaveLength(1);
      expect(rig.result.current.feedback).toEqual({
        kind: "success",
        text: "Saved 1 shape as mapcairn-shapes.geojson.",
      });
    });

    it("saves CSV", async () => {
      const rig = await rigWithTriangle();
      await act(async () => {
        await rig.result.current.exportCsv();
      });
      const file = rig.services.fakes.fileSaver.saved[0];
      expect(file?.filename).toBe("mapcairn-shapes.csv");
      expect(file?.mimeType).toBe("text/csv;charset=utf-8");
      expect(
        file?.content.startsWith("id,type,area_m2,length_m,geometry"),
      ).toBe(true);
    });

    it("saves WKT, one geometry to a line", async () => {
      const rig = await rigWithTriangle();
      await act(async () => {
        await rig.result.current.exportWkt();
      });
      const file = rig.services.fakes.fileSaver.saved[0];
      expect(file?.filename).toBe("mapcairn-shapes.wkt");
      expect(file?.mimeType).toBe("text/plain;charset=utf-8");
      expect(file?.content.startsWith("POLYGON ((")).toBe(true);
      expect(rig.result.current.feedback).toEqual({
        kind: "success",
        text: "Saved 1 shape as mapcairn-shapes.wkt.",
      });
    });

    it("reports a failed save and nothing to export", async () => {
      const rig = await rigWithTriangle();
      rig.services.fakes.fileSaver.failWith("failed");
      await act(async () => {
        await rig.result.current.exportGeoJson();
      });
      expect(rig.result.current.feedback?.kind).toBe("error");
      const empty = await setup();
      await act(async () => {
        await empty.result.current.exportCsv();
      });
      expect(empty.result.current.feedback).toEqual({
        kind: "error",
        text: "Nothing to export yet. Finish a shape first.",
      });
    });

    it("clears the feedback when the shapes change", async () => {
      const rig = await rigWithTriangle();
      await act(async () => {
        await rig.result.current.exportGeoJson();
      });
      expect(rig.result.current.feedback).not.toBeNull();
      act(() => rig.result.current.clear());
      expect(rig.result.current.feedback).toBeNull();
    });
  });

  describe("import", () => {
    const FILE = {
      name: "shapes.geojson",
      text: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [2.35, 48.85] },
          },
          {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[2.35, 48.85]] },
          },
        ],
      }),
    };

    /** Starts an import, lets the person choose `file`, and returns what it gave. */
    async function importFile(
      rig: Rig,
      file: { name: string; text: string } | null,
    ) {
      let done: Promise<unknown> = Promise.resolve();
      act(() => {
        done = rig.result.current.importFile();
      });
      await act(async () => {
        if (file) {
          rig.services.fakes.fileOpener.choose(file);
        } else {
          rig.services.fakes.fileOpener.cancel();
        }
        await done;
      });
      return done;
    }

    const assertive = () =>
      screen.getByTestId("live-region-assertive").textContent;

    it("opens the picker for GeoJSON, CSV and WKT within the size cap, and does nothing when cancelled", async () => {
      const rig = await setup();
      expect(await importFile(rig, null)).toBeNull();
      const [options] = rig.services.fakes.fileOpener.opens;
      expect(options?.accept).toEqual(
        expect.arrayContaining([".geojson", ".json", ".csv", ".wkt"]),
      );
      expect(options?.maxBytes).toBe(1_000_000);
      expect(rig.result.current.shapes).toEqual([]);
      expect(rig.result.current.importFeedback).toBeNull();
    });

    it("adds the shapes, selects the first, says what the file held and gives their bounds", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      const bounds = await importFile(rig, FILE);
      expect(bounds).toEqual({
        south: 48.85,
        west: 2.35,
        north: 48.85,
        east: 2.35,
      });
      expect(rig.result.current.shapes.map((shape) => shape.label)).toEqual([
        "Polygon 1",
        "Point 1",
      ]);
      expect(rig.result.current.selected?.label).toBe("Point 1");
      expect(rig.result.current.importFeedback).toEqual({
        kind: "success",
        text: "1 shape imported. 1 skipped: 1 with too few points.",
      });
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe(
        "1 shape imported. 1 skipped: 1 with too few points.",
      );
      act(() => rig.result.current.undo());
      expect(rig.result.current.shapes).toHaveLength(1);
    });

    it("adds the shapes of a WKT file and says what it held", async () => {
      const rig = await setup();
      const bounds = await importFile(rig, {
        name: "shapes.wkt",
        text: "POINT (2.35 48.85)\nLINESTRING (1 1)",
      });
      expect(bounds).toEqual({
        south: 48.85,
        west: 2.35,
        north: 48.85,
        east: 2.35,
      });
      expect(rig.result.current.importFeedback).toEqual({
        kind: "success",
        text: "1 shape imported. 1 skipped: 1 with too few points.",
      });
    });

    it("says that none of a WKT file was read when one line cannot be, and imports nothing", async () => {
      const rig = await setup();
      expect(
        await importFile(rig, {
          name: "shapes.wkt",
          text: "POINT (2.35 48.85)\nPOINT M (1 2 3)",
        }),
      ).toBeNull();
      expect(rig.result.current.shapes).toEqual([]);
      expect(rig.result.current.importFeedback).toEqual({
        kind: "error",
        text: "The WKT could not be read, so none of the file was imported. Coordinates with a measure (M) are not supported.",
      });
    });

    it("keeps the result through its own change of shapes, and clears it on the next", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      await act(async () => {
        await rig.result.current.exportCsv();
      });
      await importFile(rig, FILE);
      expect(rig.result.current.importFeedback).not.toBeNull();
      expect(rig.result.current.feedback).toBeNull();
      act(() => rig.result.current.clear());
      expect(rig.result.current.importFeedback).toBeNull();
    });

    it("says why a file gave no shapes, assertively", async () => {
      const rig = await setup();
      expect(
        await importFile(rig, { name: "a.txt", text: "hello" }),
      ).toBeNull();
      expect(rig.result.current.importFeedback).toEqual({
        kind: "error",
        text: "This is not GeoJSON, WKT or a CSV of shapes from this map. Choose a .geojson, .json, .wkt, .txt or .csv file.",
      });
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(assertive()).toContain("This is not GeoJSON");
      await importFile(rig, {
        name: "a.geojson",
        text: '{"type":"FeatureCollection","features":[]}',
      });
      expect(rig.result.current.importFeedback?.text).toBe(
        "The file holds no shapes.",
      );
    });

    it("says when a file is too large, cannot be read, or cannot be opened at all", async () => {
      const rig = await setup();
      await importFile(rig, { name: "big.csv", text: "x".repeat(1_000_001) });
      expect(rig.result.current.importFeedback?.text).toBe(
        "The file is larger than 1 MB. Split it into smaller files.",
      );
      rig.services.fakes.fileOpener.failWith("unreadable");
      await importFile(rig, FILE);
      expect(rig.result.current.importFeedback).toEqual({
        kind: "error",
        text: "The file could not be read. Choose it again, or another file.",
      });
      rig.services.fakes.fileOpener.failWith("unsupported");
      await act(async () => {
        await rig.result.current.importFile();
      });
      expect(rig.result.current.importFeedback?.text).toBe(
        "This browser cannot open files here.",
      );
    });

    it("treats an opener that breaks its contract as a file that cannot be read", async () => {
      const services = createFakeServices({
        fileOpener: { open: () => Promise.reject(new Error("Broken.")) },
      });
      const rig = await setup({ services });
      await act(async () => {
        await rig.result.current.importFile();
      });
      expect(rig.result.current.importFeedback?.text).toBe(
        "The file could not be read. Choose it again, or another file.",
      );
    });

    it("refuses, whole, an import that would pass 1,000 shapes", async () => {
      const rig = await setup();
      const points = (count: number) => ({
        name: "points.geojson",
        text: JSON.stringify({
          type: "MultiPoint",
          coordinates: Array.from({ length: count }, (_, index) => [
            index / 1000,
            1,
          ]),
        }),
      });
      await importFile(rig, points(500));
      await importFile(rig, points(500));
      expect(rig.result.current.shapes).toHaveLength(1000);
      expect(await importFile(rig, points(1))).toBeNull();
      expect(rig.result.current.shapes).toHaveLength(1000);
      expect(rig.result.current.importFeedback).toEqual({
        kind: "error",
        text: "That would make more than 1,000 shapes. Delete some shapes first, or import a smaller file.",
      });
    });

    it("does nothing without a file opener", async () => {
      const rig = await setup({
        services: createFakeServices({ fileOpener: undefined }),
      });
      let bounds: unknown;
      await act(async () => {
        bounds = await rig.result.current.importFile();
      });
      expect(bounds).toBeNull();
      expect(rig.result.current.importFeedback).toBeNull();
    });

    it("notes that a link carries at most 50 shapes", async () => {
      const rig = await setup();
      const coordinates = Array.from({ length: 51 }, (_, index) => [
        index / 1000,
        1,
      ]);
      await importFile(rig, {
        name: "points.geojson",
        text: JSON.stringify({ type: "MultiPoint", coordinates }),
      });
      expect(rig.result.current.importFeedback?.text).toBe(
        "51 shapes imported. A link carries at most 50 shapes, so download a file to share them all.",
      );
    });

    it("cancels a waiting import when another starts", async () => {
      const rig = await setup();
      let first: Promise<unknown> = Promise.resolve();
      act(() => {
        first = rig.result.current.importFile();
      });
      const second = await importFile(rig, FILE);
      expect(await first).toBeNull();
      expect(second).not.toBeNull();
      expect(rig.result.current.shapes).toHaveLength(1);
    });
  });

  describe("sharing", () => {
    it("copies a link that carries the shapes and the current address state", async () => {
      const services = createFakeServices();
      services.fakes.url.write({ basemapId: "positron" });
      const rig = await setup({ services });
      addAll(rig, TRIANGLE);
      act(() => rig.result.current.finish());
      await act(async () => {
        await rig.result.current.copyLink();
      });
      const link = services.fakes.clipboard.written[0] ?? "";
      expect(link).toContain("#basemap=positron&shapes=");
      const shapes = new URL(link).hash.split("shapes=")[1] ?? "";
      expect(decodeShapes(shapes)?.[0]?.kind).toBe("polygon");
      expect(rig.result.current.feedback).toEqual({
        kind: "success",
        text: "Link with shapes copied.",
      });
      // The address bar itself is never written.
      expect(services.fakes.url.read().shapes).toBeUndefined();
    });

    it("says when there is nothing to share, when it is too big and when the copy fails", async () => {
      const empty = await setup();
      await act(async () => {
        await empty.result.current.copyLink();
      });
      expect(empty.result.current.feedback?.text).toBe(
        "Nothing to share yet. Finish a shape first.",
      );

      const big = await setup();
      for (let index = 0; index < 51; index += 1) {
        act(() => big.result.current.setMode("point"));
        act(() => big.result.current.addPoint(p(index * 0.001, 1)));
      }
      await act(async () => {
        await big.result.current.copyLink();
      });
      expect(big.result.current.feedback?.text).toContain("Too many shapes");

      const services = createFakeServices();
      services.fakes.clipboard.failWith("denied");
      const failing = await setup({ services });
      addAll(failing, TRIANGLE);
      act(() => failing.result.current.finish());
      await act(async () => {
        await failing.result.current.copyLink();
      });
      expect(failing.result.current.feedback?.kind).toBe("error");
    });

    describe("a circle under a metre", () => {
      /** Draws a circle with a radius of about 70 cm, the least a tap can give being 0.5 m. */
      function drawTinyCircle(rig: Rig) {
        act(() => rig.result.current.setMode("circle"));
        addAll(rig, [CENTRE, p(CENTRE.lng + 0.0000095, CENTRE.lat)]);
      }

      it("is left out of the link and the person is told, with the rest copied", async () => {
        const services = createFakeServices();
        const rig = await setup({ services });
        act(() => rig.result.current.setMode("polygon"));
        addAll(rig, TRIANGLE);
        act(() => rig.result.current.finish());
        drawTinyCircle(rig);
        expect(rig.result.current.shapes).toHaveLength(2);
        await act(async () => {
          await rig.result.current.copyLink();
        });
        const link = services.fakes.clipboard.written[0] ?? "";
        const shapes = new URL(link).hash.split("shapes=")[1] ?? "";
        expect(decodeShapes(shapes)?.map((shape) => shape.kind)).toEqual([
          "polygon",
        ]);
        expect(rig.result.current.feedback).toEqual({
          kind: "success",
          text: "Link with shapes copied. 1 shape is too small to carry in a link and was left out. Export a file to keep it.",
        });
      });

      it("copies nothing and says why when every shape is too small", async () => {
        const services = createFakeServices();
        const rig = await setup({ services });
        drawTinyCircle(rig);
        await act(async () => {
          await rig.result.current.copyLink();
        });
        expect(services.fakes.clipboard.written).toEqual([]);
        expect(rig.result.current.feedback).toEqual({
          kind: "error",
          text: "Nothing to copy: 1 shape is too small to carry in a link. Export a file instead.",
        });
        drawTinyCircle(rig);
        await act(async () => {
          await rig.result.current.copyLink();
        });
        expect(rig.result.current.feedback?.text).toBe(
          "Nothing to copy: 2 shapes are too small to carry in a link. Export a file instead.",
        );
      });
    });

    it("loads shapes from a link and announces how many", async () => {
      const encoded = encodeShapes([
        {
          id: "a",
          kind: "polygon",
          label: "x",
          done: true,
          vertices: TRIANGLE,
        },
      ]);
      const services = createFakeServices();
      services.fakes.url.write({ shapes: encoded ?? "" });
      const rig = await setup({ services });
      expect(rig.result.current.shapes).toHaveLength(1);
      await advance(DRAW_ANNOUNCE_DELAY_MS);
      expect(polite()).toBe("1 shape loaded from the link.");
    });

    it("ignores a shapes value that cannot be read", async () => {
      const services = createFakeServices();
      services.fakes.url.write({ shapes: "zzzz" });
      const rig = await setup({ services });
      expect(rig.result.current.shapes).toEqual([]);
    });
  });

  describe("handles for the map", () => {
    it("has handles for the selected shape only while the tool is active", async () => {
      const rig = await setup();
      addAll(rig, TRIANGLE);
      expect(rig.result.current.handles).toHaveLength(3);
      const inactive = await setup({ active: false });
      addAll(inactive, TRIANGLE);
      expect(inactive.result.current.handles).toEqual([]);
    });

    it("puts a midpoint on the great circle on a globe, and a tap there adds the vertex on the curve", async () => {
      const services = createFakeServices();
      services.fakes.settings.set({ projection: "globe" });
      const rig = await setup({ services });
      act(() => rig.result.current.setMode("line"));
      addAll(rig, [p(-0.1, 51.5), p(-74, 40.7)]);
      act(() => rig.result.current.finish());
      const id = rig.result.current.shapes[0]?.id ?? "";
      const midpoint = rig.result.current.handles.find(
        (h) => h.id === `${id}:m:1`,
      );
      // London to New York bows north to 52.36 N, not the 46.1 N average.
      expectNear(midpoint?.position, { lat: 52.362_546, lng: -41.275_707 });
      const at = midpoint?.position as LatLng;
      for (const phase of ["start", "end"] as const) {
        act(() =>
          rig.result.current.onHandleDrag({
            id: `${id}:m:1`,
            phase,
            latlng: at,
            moved: false,
          }),
        );
      }
      expectNear(rig.result.current.shapes[0]?.vertices[1], at);
    });
  });
});
