// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { BasemapDefinition, MapFeature, MapHeatmap } from "@mapcairn/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canvasStub,
  FakeLngLat,
  FakeMapLibreMap,
  simulateFeatureHits,
  TEST_ADAPTER_OPTIONS,
} from "./maplibreTestEngine";

// Characterises what the adapter does with its data layers over time: which
// engine calls it makes and in what order, what it keeps across a style swap,
// and what it forgets. The same expectations held before the store moved out
// of the adapter, so they pin that nothing changed.
vi.mock("maplibre-gl", async () => ({
  Map: (await import("./maplibreTestEngine")).FakeMapLibreMap,
  GPUInitializationError: (await import("./maplibreTestEngine"))
    .FakeGPUInitializationError,
  LngLat: FakeLngLat,
  setWorkerUrl: vi.fn(),
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "mock-maplibre-worker-url",
}));

import { MapLibreMapAdapter } from "./MapLibreMapAdapter";

const STREETS: BasemapDefinition = {
  id: "streets",
  name: "Streets",
  source: {
    kind: "raster",
    tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
    tileSize: 256,
  },
  minZoom: 0,
  maxZoom: 19,
  thumbnail: "/basemaps/streets.jpg",
  attribution: [{ text: "© OpenStreetMap contributors" }],
  appearance: "light",
};

const OTHER: BasemapDefinition = { ...STREETS, id: "other", name: "Other" };

const POINT: MapFeature = {
  id: "a",
  position: { lat: 48.86, lng: 2.35 },
  colour: "#e69f00",
  radius: 6,
  shape: "circle",
};

const SHAPES = {
  geometries: [
    {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ] as const,
    },
  ],
  colour: "#d55e00",
};

const OVERLAY = {
  tiles: "https://t.test/{z}/{x}/{y}.png",
  tileSize: 256 as const,
  maxzoom: 9,
  opacity: 1,
};

const HEAT_STYLE: MapHeatmap["style"] = {
  ramp: ["#fee8c8", "#e34a33"],
  radius: 20,
  intensity: 1,
  opacity: 0.8,
};

const ENGINE_METHODS = [
  "addImage",
  "addSource",
  "addLayer",
  "moveLayer",
  "removeLayer",
  "removeSource",
  "setPaintProperty",
] as const;

let restoreCanvas = () => {};

beforeEach(() => {
  FakeMapLibreMap.reset();
  restoreCanvas = canvasStub.install();
});

afterEach(() => {
  vi.useRealTimers();
  restoreCanvas();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A mounted map, with every engine call that changes the style written to one list. */
async function mountedWithLog(
  adapter = new MapLibreMapAdapter(TEST_ADAPTER_OPTIONS),
) {
  const host = document.createElement("div");
  document.body.append(host);
  const mounting = adapter.mount(host, {
    view: { center: { lat: 0, lng: 0 }, zoom: 3, bearing: 0 },
    basemap: STREETS,
    reducedMotion: false,
  });
  await vi.waitFor(() => {
    expect(FakeMapLibreMap.instances.length).toBe(1);
  });
  const map = FakeMapLibreMap.instances[0] as FakeMapLibreMap;
  const log: string[] = [];
  const addLayer = map.addLayer.bind(map);
  for (const method of ENGINE_METHODS) {
    const original = map[method].bind(map) as (...args: unknown[]) => unknown;
    vi.spyOn(map, method).mockImplementation(((...args: unknown[]) => {
      log.push(
        method === "setPaintProperty" || method === "addImage"
          ? `${method} ${String(args[0])}`
          : `${method} ${describe_(args[0])}`,
      );
      return original(...args);
    }) as never);
  }
  map.fire("load");
  await mounting;
  return { adapter, map, log, addLayer };
}

function describe_(argument: unknown): string {
  return typeof argument === "string"
    ? argument
    : String((argument as { id: string }).id);
}

describe("MapLibreMapAdapter data layer store", () => {
  describe("request referrer", () => {
    type Transform = (
      url: string,
      type: string,
    ) => { url: string; referrerPolicy?: string };

    const transformOf = (map: FakeMapLibreMap) =>
      map.options.transformRequest as Transform;

    it("sends no referrer with the tiles of a raster data layer, and the basemap keeps its own policy", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setTileLayer("imagery", OVERLAY);
      const transform = transformOf(map);
      expect(transform("https://t.test/3/2/5.png", "Tile")).toEqual({
        url: "https://t.test/3/2/5.png",
        referrerPolicy: "no-referrer",
      });
      expect(transform("https://tiles.example/3/2/5.png", "Tile")).toEqual({
        url: "https://tiles.example/3/2/5.png",
      });
    });

    it("sends no referrer with the tiles of a vector data layer", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setVectorLayer("regions", {
        source: {
          tiles: "https://v.test/{z}/{x}/{y}.pbf",
          minzoom: 0,
          maxzoom: 9,
        },
        layers: [
          {
            sourceLayer: "area",
            geometry: "area",
            rule: {
              kind: "fixed",
              look: {
                colour: "#d55e00",
                fillOpacity: 0.5,
                pattern: "solid",
                dash: "solid",
                width: 1,
              },
            },
          },
        ],
      });
      expect(transformOf(map)("https://v.test/3/2/5.pbf", "Tile")).toEqual({
        url: "https://v.test/3/2/5.pbf",
        referrerPolicy: "no-referrer",
      });
    });

    it("stops applying it when the layer is removed", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setTileLayer("imagery", OVERLAY);
      adapter.removeLayer("imagery");
      expect(transformOf(map)("https://t.test/3/2/5.png", "Tile")).toEqual({
        url: "https://t.test/3/2/5.png",
      });
    });
  });

  describe("drawing and erasing", () => {
    it("draws a layer as its source, then its layers bottom first, then orders", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("area", SHAPES);
      const layers = map.styleLayers.map((layer) => String(layer.id));
      expect(log).toEqual([
        "addSource mapcairn:area",
        ...layers.map((id) => `addLayer ${id}`),
        ...layers.map((id) => `moveLayer ${id}`),
      ]);
    });

    it("erases a layer's own layers, then its source, before it draws it again", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("area", SHAPES);
      const layers = map.styleLayers.map((layer) => String(layer.id));
      log.length = 0;
      adapter.setShapeLayer("area", SHAPES);
      expect(log).toEqual([
        ...layers.map((id) => `removeLayer ${id}`),
        "removeSource mapcairn:area",
        "addSource mapcairn:area",
        ...layers.map((id) => `addLayer ${id}`),
        ...layers.map((id) => `moveLayer ${id}`),
      ]);
    });

    it("adds the marker image of a point once, before its source", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setFeatureLayer("pts", [POINT, { ...POINT, id: "b" }]);
      const images = log.filter((entry) => entry.startsWith("addImage"));
      expect(images).toHaveLength(1);
      expect(log.indexOf(images[0] as string)).toBeLessThan(
        log.indexOf("addSource mapcairn:pts"),
      );
    });

    it("moves the layers of lower kinds first, whatever order they were set in", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setFeatureLayer("pts", [POINT]);
      adapter.setShapeLayer("area", SHAPES);
      adapter.setTileLayer("imagery", OVERLAY);
      log.length = 0;
      adapter.setShapeLayer("area", SHAPES);
      const moved = log
        .filter((entry) => entry.startsWith("moveLayer"))
        .map((entry) => entry.split(":")[1]);
      expect(moved[0]).toBe("imagery");
      expect(moved.at(-1)).toBe("pts");
      expect(moved.indexOf("area")).toBeGreaterThan(moved.indexOf("imagery"));
      expect(moved.indexOf("area")).toBeLessThan(moved.indexOf("pts"));
    });

    it("keeps the order layers were set in within one kind", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("first", SHAPES);
      adapter.setShapeLayer("second", SHAPES);
      adapter.setShapeLayer("first", SHAPES);
      const order = map.styleLayers.map((layer) => String(layer.id));
      expect(
        order.findIndex((id) => id.startsWith("mapcairn:first")),
      ).toBeLessThan(order.findIndex((id) => id.startsWith("mapcairn:second")));
    });

    it("changes only the opacity of a tile layer whose tiles are the same", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setTileLayer("imagery", OVERLAY);
      log.length = 0;
      adapter.setTileLayer("imagery", { ...OVERLAY, opacity: 0.4 });
      expect(log).toEqual(["setPaintProperty mapcairn:imagery:tiles"]);
      expect(map.callsOf("setPaintProperty").at(-1)?.args).toEqual([
        "mapcairn:imagery:tiles",
        "raster-opacity",
        0.4,
      ]);
    });

    it("draws a tile layer again when its tile size, zoom or tiles change", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setTileLayer("imagery", OVERLAY);
      for (const next of [
        { ...OVERLAY, tileSize: 512 as const },
        { ...OVERLAY, maxzoom: 10 },
        { ...OVERLAY, tiles: "https://t.test/2/{z}/{x}/{y}.png" },
      ]) {
        log.length = 0;
        adapter.setTileLayer("imagery", next);
        expect(log).toContain("removeSource mapcairn:imagery");
        expect(log).toContain("addSource mapcairn:imagery");
      }
    });

    it("draws a tile layer afresh when the previous one under its id was another kind", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setHeatmapLayer("x", {
        source: { kind: "points", points: [{ position: POINT.position }] },
        style: HEAT_STYLE,
      });
      log.length = 0;
      adapter.setTileLayer("x", OVERLAY);
      expect(log[0]).toMatch(/^removeLayer mapcairn:x:/);
      expect(log).toContain("addSource mapcairn:x");
    });

    it("removes a layer's engine layers and source, and ignores an id it does not hold", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("area", SHAPES);
      const layers = map.styleLayers.map((layer) => String(layer.id));
      log.length = 0;
      adapter.removeLayer("nothing");
      expect(log).toEqual([]);
      adapter.removeLayer("area");
      expect(log).toEqual([
        ...layers.map((id) => `removeLayer ${id}`),
        "removeSource mapcairn:area",
      ]);
      log.length = 0;
      adapter.removeLayer("area");
      expect(log).toEqual([]);
    });

    it("erases only the layers the engine still has", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("area", SHAPES);
      map.styleLayers = [];
      map.sources.clear();
      adapter.removeLayer("area");
      expect(map.callsOf("removeLayer")).toEqual([]);
      expect(map.callsOf("removeSource")).toEqual([]);
    });
  });

  describe("before the style is ready", () => {
    it("keeps a layer set before the style loads and draws it from style.load, with one ordering pass after every layer", async () => {
      const { adapter, map, log } = await mountedWithLog();
      adapter.setShapeLayer("area", SHAPES);
      adapter.setFeatureLayer("pts", [POINT]);
      expect(log).toEqual([]);
      map.fire("style.load");
      const firstMove = log.findIndex((entry) => entry.startsWith("moveLayer"));
      const lastAdd = log.reduce(
        (last, entry, index) => (entry.startsWith("add") ? index : last),
        -1,
      );
      expect(firstMove).toBeGreaterThan(lastAdd);
      expect(log.indexOf("addSource mapcairn:area")).toBeLessThan(
        log.indexOf("addSource mapcairn:pts"),
      );
    });

    it("forgets a layer removed before the style loads", async () => {
      const { adapter, map, log } = await mountedWithLog();
      adapter.setShapeLayer("area", SHAPES);
      adapter.removeLayer("area");
      map.fire("style.load");
      expect(log).toEqual([]);
    });

    it("does not touch the engine while a basemap swap has no style yet", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      void adapter.setBasemap(OTHER).catch(() => undefined);
      log.length = 0;
      adapter.setShapeLayer("area", SHAPES);
      adapter.removeLayer("area");
      adapter.setTileLayer("imagery", OVERLAY);
      expect(log).toEqual([]);
      map.fire("style.load");
      expect(log).toContain("addSource mapcairn:imagery");
      expect(log).not.toContain("addSource mapcairn:area");
    });

    it("draws a kept layer again on each new style, in the order it was set", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("a", SHAPES);
      adapter.setShapeLayer("b", SHAPES);
      void adapter.setBasemap(OTHER).catch(() => undefined);
      map.styleLayers = [];
      map.sources.clear();
      log.length = 0;
      map.fire("style.load");
      const sources = log.filter((entry) => entry.startsWith("addSource"));
      expect(sources).toEqual(["addSource mapcairn:a", "addSource mapcairn:b"]);
      expect(log.some((entry) => entry.startsWith("removeLayer"))).toBe(false);
    });
  });

  describe("failures", () => {
    it("logs a layer that cannot be drawn again after a style swap, and keeps the basemap", async () => {
      const { adapter, map } = await mountedWithLog();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      map.fire("style.load");
      adapter.setShapeLayer("area", SHAPES);
      void adapter.setBasemap(OTHER).catch(() => undefined);
      vi.spyOn(map, "addSource").mockImplementation(() => {
        throw new Error("no source");
      });
      expect(() => map.fire("style.load")).not.toThrow();
      expect(error).toHaveBeenCalledWith(
        "Data layers could not be drawn again",
        expect.any(Error),
      );
    });

    it("erases what a draw that failed part way left, the next time the layer is drawn", async () => {
      const { adapter, map, addLayer: original } = await mountedWithLog();
      map.fire("style.load");
      let calls = 0;
      vi.spyOn(map, "addLayer").mockImplementation(((
        ...args: Parameters<typeof original>
      ) => {
        calls += 1;
        if (calls === 2) {
          throw new Error("no layer");
        }
        return original(...args);
      }) as never);
      expect(() => adapter.setShapeLayer("area", SHAPES)).toThrow("no layer");
      expect(map.sources.has("mapcairn:area")).toBe(true);
      adapter.setShapeLayer("area", SHAPES);
      expect(
        map.styleLayers.filter((layer) =>
          String(layer.id).startsWith("mapcairn:area:"),
        ),
      ).toHaveLength(
        map.styleLayers.filter((layer) => layer.source === "mapcairn:area")
          .length,
      );
      expect(
        [...map.sources.keys()].filter((id) => id === "mapcairn:area"),
      ).toHaveLength(1);
    });
  });

  describe("tile traffic", () => {
    const requested = (map: FakeMapLibreMap) =>
      map.fire("sourcedataloading", { sourceId: "mapcairn:imagery", tile: {} });

    it("stops watching a tile layer that is replaced by another kind", async () => {
      vi.useFakeTimers();
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      const unavailable = vi.fn();
      adapter.on("tileLayerUnavailable", unavailable);
      adapter.setTileLayer("imagery", OVERLAY);
      requested(map);
      adapter.setShapeLayer("imagery", SHAPES);
      map.fire("idle");
      expect(unavailable).not.toHaveBeenCalled();
    });

    it("tells a tile layer's source from any other on a tile error", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const tileError = vi.fn();
      adapter.on("tileError", tileError);
      adapter.setTileLayer("imagery", OVERLAY);
      adapter.setShapeLayer("area", SHAPES);
      map.fire("error", {
        error: new Error("tile"),
        tile: {},
        sourceId: "mapcairn:imagery",
      });
      expect(tileError).not.toHaveBeenCalled();
      map.fire("error", {
        error: new Error("tile"),
        tile: {},
        sourceId: "mapcairn:area",
      });
      expect(tileError).toHaveBeenCalledTimes(1);
    });

    it("keeps a slow report across a draw of the same tiles that has loaded none, so its first tile recovers it", async () => {
      vi.useFakeTimers();
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      const slow = vi.fn();
      const recovered = vi.fn();
      adapter.on("tileLayerSlow", slow);
      adapter.on("tileLayerRecovered", recovered);
      adapter.setTileLayer("imagery", OVERLAY);
      requested(map);
      vi.advanceTimersByTime(10_000);
      expect(slow).toHaveBeenCalledTimes(1);
      adapter.setTileLayer("imagery", { ...OVERLAY, maxzoom: 10 });
      map.fire("sourcedata", {
        sourceId: "mapcairn:imagery",
        tile: {},
        isSourceLoaded: false,
      });
      expect(recovered).toHaveBeenCalledTimes(1);
    });
  });

  describe("tap hits", () => {
    it("asks only for layers the style still has, and not at all when it has none", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setFeatureLayer("pts", [POINT]);
      adapter.setShapeLayer("area", SHAPES);
      adapter.featuresAt({ x: 10, y: 10 });
      const asked = map
        .callsOf("queryRenderedFeatures")
        .map((call) => call.args);
      expect(asked.length).toBeGreaterThan(0);
      for (const [, options] of asked) {
        for (const layer of (options as { layers: string[] }).layers) {
          expect(map.getLayer(layer)).toBeDefined();
        }
      }
      map.styleLayers = [];
      map.calls.length = 0;
      adapter.featuresAt({ x: 10, y: 10 });
      expect(map.callsOf("queryRenderedFeatures")).toEqual([]);
    });

    it("emits a feature tap before the click, and none after the layer is removed", async () => {
      const { adapter, map } = await mountedWithLog();
      map.fire("style.load");
      adapter.setFeatureLayer("pts", [POINT]);
      const order: string[] = [];
      adapter.on("featureTap", () => order.push("featureTap"));
      adapter.on("click", () => order.push("click"));
      simulateFeatureHits(map, [{ layerId: "pts", featureId: "a" }]);
      expect(order).toEqual(["featureTap", "click"]);
      adapter.removeLayer("pts");
      order.length = 0;
      map.fire("click", {
        point: { x: 5, y: 5 },
        lngLat: { lng: 0, lat: 0 },
      });
      expect(order).toEqual(["click"]);
    });
  });

  describe("destroy", () => {
    it("leaves the engine's layers to the engine, draws nothing more and ignores later calls", async () => {
      const { adapter, map, log } = await mountedWithLog();
      map.fire("style.load");
      adapter.setShapeLayer("area", SHAPES);
      adapter.destroy();
      log.length = 0;
      adapter.setShapeLayer("late", SHAPES);
      adapter.removeLayer("area");
      adapter.removeLayer("late");
      expect(log).toEqual([]);
      expect(adapter.featuresAt({ x: 1, y: 1 })).toEqual([]);
    });
  });
});
