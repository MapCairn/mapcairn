import type {
  BasemapDefinition,
  MapHeatmap,
  MapMountOptions,
  MapShapeLook,
  MapStyledShapes,
  MapVectorTiles,
} from "@mapcairn/core";
import {
  FAKE_HYBRID_BASEMAP,
  MapEngineError,
  metresPerPixel,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canvasStub,
  FAKE_VIEWPORT_HEIGHT,
  FAKE_VIEWPORT_WIDTH,
  FakeMapLibreMap,
  simulateFeatureHits,
} from "./maplibreTestEngine";

// happy-dom has no WebGL, so these tests drive a scripted engine and cover
// what the adapter owns: option mapping, zoom conversion, event mapping,
// error mapping and DOM clean-up.
const engine = vi.hoisted(() => ({
  setWorkerUrl: vi.fn(),
}));

vi.mock("maplibre-gl", async () => ({
  Map: (await import("./maplibreTestEngine")).FakeMapLibreMap,
  GPUInitializationError: (await import("./maplibreTestEngine"))
    .FakeGPUInitializationError,
  LngLat: (await import("./maplibreTestEngine")).FakeLngLat,
  setWorkerUrl: engine.setWorkerUrl,
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "mock-maplibre-worker-url",
}));

import {
  createMapLibreMapAdapter,
  IMAGE_WAIT_MS,
  MapLibreMapAdapter,
  WORKER_FAILURE_GRACE_MS,
} from "./MapLibreMapAdapter";
import { FakeGPUInitializationError } from "./maplibreTestEngine";

/** The exact error maplibre-gl 6.17 fires from `createActors` for any worker `error` event. */
function workerFailure(): Record<string, unknown> {
  return {
    error: new Error(
      "Worker failed to load. Check that the worker URL is correct.",
    ),
  };
}

type FakeMap = FakeMapLibreMap;

const POSITRON: BasemapDefinition = {
  id: "positron",
  name: "Positron",
  source: { kind: "vector", styleUrl: "https://tiles.example/positron" },
  minZoom: 0,
  maxZoom: 22,
  thumbnail: "/basemaps/positron.jpg",
  attribution: [{ text: "© OpenStreetMap contributors" }],
  appearance: "light",
};

const DARK: BasemapDefinition = {
  ...POSITRON,
  id: "dark",
  source: { kind: "vector", styleUrl: "https://tiles.example/dark" },
  minZoom: 2,
  maxZoom: 14,
  appearance: "dark",
};

const STREETS: BasemapDefinition = {
  ...POSITRON,
  id: "streets",
  source: {
    kind: "raster",
    tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
    tileSize: 256,
  },
  maxZoom: 19,
};

/** The inline style the adapter builds for {@link STREETS}. */
const STREETS_STYLE = {
  version: 8,
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://tiles.example/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
};

const MOUNT: MapMountOptions = {
  view: { center: { lat: -26.2, lng: 28.05 }, zoom: 10, bearing: 0 },
  basemap: POSITRON,
  reducedMotion: false,
};

function latestMap(): FakeMap {
  const map = FakeMapLibreMap.instances.at(-1);
  if (!map) {
    throw new Error("No map was constructed.");
  }
  return map;
}

function createHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.tabIndex = 0;
  document.body.append(host);
  return host;
}

async function mounted(
  options: Partial<MapMountOptions> = {},
  adapter = new MapLibreMapAdapter(),
) {
  const host = createHost();
  const before = FakeMapLibreMap.instances.length;
  const mounting = adapter.mount(host, { ...MOUNT, ...options });
  await vi.waitFor(() => {
    expect(FakeMapLibreMap.instances.length).toBe(before + 1);
  });
  const map = latestMap();
  map.fire("load");
  await mounting;
  return { adapter, host, map };
}

beforeEach(() => {
  FakeMapLibreMap.reset();
  engine.setWorkerUrl.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A basemap that names its relief layer as one to leave out in Save data mode. */
const WITH_RELIEF: BasemapDefinition = {
  ...DARK,
  id: "with-relief",
  saveDataOmitLayers: ["relief"],
};

/**
 * Gives the fake engine the style it "loaded": a relief raster layer that only
 * it uses, and a vector source two other layers share.
 */
function loadReliefStyle(map: FakeMap): void {
  map.styleLayers = [
    { id: "background" },
    { id: "relief", source: "relief-source" },
    { id: "roads", source: "planet" },
    { id: "water", source: "planet" },
  ];
  map.sources.clear();
  for (const id of ["relief-source", "planet", "spare"]) {
    map.sources.set(id, {});
  }
  map.fire("style.load");
}

const layerIds = (map: FakeMap) => map.styleLayers.map((layer) => layer.id);

describe("MapLibreMapAdapter", () => {
  it("is built fresh by the factory", () => {
    const adapter = createMapLibreMapAdapter();
    expect(adapter).toBeInstanceOf(MapLibreMapAdapter);
    expect(createMapLibreMapAdapter()).not.toBe(adapter);
  });

  describe("mount", () => {
    it("points MapLibre at the bundled worker before creating the map", async () => {
      await mounted();
      expect(engine.setWorkerUrl).toHaveBeenCalledWith(
        "mock-maplibre-worker-url",
      );
    });

    it("creates a flat map with no controls and MapLibre's keyboard handler off", async () => {
      const { map, host } = await mounted();
      expect(map.options).toMatchObject({
        container: host,
        style: "https://tiles.example/positron",
        attributionControl: false,
        maplibreLogo: false,
        keyboard: false,
        cooperativeGestures: false,
        maxPitch: 0,
        pitch: 0,
        pitchWithRotate: false,
        touchPitch: false,
        dragRotate: true,
        dragPan: true,
        touchZoomRotate: true,
        scrollZoom: true,
        doubleClickZoom: true,
        reduceMotion: false,
      });
    });

    it("converts the normalised view and limits to MapLibre's 512 px zoom", async () => {
      const { map } = await mounted({
        view: { center: { lat: 1, lng: 2 }, zoom: 10, bearing: 45 },
      });
      expect(map.options).toMatchObject({
        center: [2, 1],
        zoom: 9,
        bearing: 45,
        minZoom: -1,
        maxZoom: 21,
      });
    });

    it("clamps the starting zoom to the basemap's limits", async () => {
      const { map } = await mounted({
        basemap: DARK,
        view: { ...MOUNT.view, zoom: 20 },
      });
      expect(map.options.zoom).toBe(13);
    });

    it("turns engine motion off when mounted with reduced motion", async () => {
      const { map } = await mounted({ reducedMotion: true });
      expect(map.options).toMatchObject({
        reduceMotion: true,
        fadeDuration: 0,
      });
    });

    it("waits for the first load before resolving", async () => {
      const adapter = new MapLibreMapAdapter();
      const resolved = vi.fn();
      void adapter.mount(createHost(), MOUNT).then(resolved);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      await Promise.resolve();
      expect(resolved).not.toHaveBeenCalled();
      latestMap().fire("load");
      await vi.waitFor(() => {
        expect(resolved).toHaveBeenCalled();
      });
    });

    it("rejects with webgl-unavailable when MapLibre cannot create a GPU context", async () => {
      FakeMapLibreMap.nextConstructError = new FakeGPUInitializationError();
      const adapter = new MapLibreMapAdapter();
      const result = adapter.mount(createHost(), MOUNT);
      await expect(result).rejects.toBeInstanceOf(MapEngineError);
      await expect(result).rejects.toMatchObject({
        reason: "webgl-unavailable",
      });
    });

    it("recognises MapLibre's GPU error by its class, not by its name", async () => {
      const lookalike = new Error("WebGL2 is required");
      lookalike.name = "GPUInitializationError";
      FakeMapLibreMap.nextConstructError = lookalike;
      const adapter = new MapLibreMapAdapter();
      await expect(adapter.mount(createHost(), MOUNT)).rejects.toMatchObject({
        reason: "load-failed",
      });
    });

    it("rejects with load-failed when the map constructor fails for another reason", async () => {
      FakeMapLibreMap.nextConstructError = new Error("Invalid container");
      const adapter = new MapLibreMapAdapter();
      await expect(adapter.mount(createHost(), MOUNT)).rejects.toMatchObject({
        name: "MapEngineError",
        reason: "load-failed",
      });
    });

    it("rejects with load-failed when the engine module fails to load, and retries next time", async () => {
      // A fresh module, so the engine loader has not cached an earlier success.
      vi.resetModules();
      // The mocked engine module keeps its first instance, so the fake stays shared.
      const fresh = await import("./MapLibreMapAdapter");
      engine.setWorkerUrl.mockImplementationOnce(() => {
        throw new Error("chunk failed");
      });
      const failing = new fresh.MapLibreMapAdapter();
      await expect(failing.mount(createHost(), MOUNT)).rejects.toMatchObject({
        reason: "load-failed",
      });
      expect(FakeMapLibreMap.instances).toHaveLength(0);

      const retrying = new fresh.MapLibreMapAdapter().mount(
        createHost(),
        MOUNT,
      );
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      FakeMapLibreMap.instances[0]?.fire("load");
      await expect(retrying).resolves.toBeUndefined();
      expect(engine.setWorkerUrl).toHaveBeenCalledTimes(2);
    });

    it("rejects with load-failed and removes the map when the style fails before the first load", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new MapLibreMapAdapter();
      const host = createHost();
      const result = adapter.mount(host, MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      const map = latestMap();
      map.fire("error", { error: new Error("Style unreachable") });
      await expect(result).rejects.toMatchObject({ reason: "load-failed" });
      expect(map.removed).toBe(true);
      expect(map.listenerCount()).toBe(0);
    });

    it("keeps waiting when the sprite fails after the style document loaded", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new MapLibreMapAdapter();
      const tileError = vi.fn();
      adapter.on("tileError", tileError);
      const result = adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      const map = latestMap();
      map.fire("style.load");
      // Style._loadSprite fires an ErrorEvent with only the error: no tile, no source.
      map.fire("error", { error: new Error("Unable to load sprite") });
      expect(tileError).toHaveBeenCalledTimes(1);
      map.fire("load");
      await expect(result).resolves.toBeUndefined();
      expect(map.removed).toBe(false);
    });

    it("rejects the mount when a worker fails after the style document loaded", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new MapLibreMapAdapter();
      const fatalError = vi.fn();
      adapter.on("fatalError", fatalError);
      const result = adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      latestMap().fire("style.load");
      latestMap().fire("error", workerFailure());
      await expect(result).rejects.toMatchObject({ reason: "load-failed" });
      expect(fatalError).not.toHaveBeenCalled();
    });

    it("keeps waiting when only a tile fails before the first load", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new MapLibreMapAdapter();
      const tileError = vi.fn();
      adapter.on("tileError", tileError);
      const result = adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      const map = latestMap();
      map.fire("error", {
        error: new Error("tile 500"),
        tile: {},
        sourceId: "openmaptiles",
      });
      expect(tileError).toHaveBeenCalledTimes(1);
      map.fire("load");
      await expect(result).resolves.toBeUndefined();
      expect(map.removed).toBe(false);
    });

    it("draws a raster basemap as an inline style of 256 px tiles, up to the provider's deepest level", async () => {
      const { map, adapter } = await mounted({ basemap: STREETS });
      expect(map.options.style).toEqual(STREETS_STYLE);
      // The map's own limit is in MapLibre's 512 px zoom, one lower than the
      // tile level, which MapLibre requests at its zoom plus one for 256 px tiles.
      expect(map.options.maxZoom).toBe(18);
      expect(adapter.getMaxZoom()).toBe(19);
    });

    it("rejects a second mount", async () => {
      const { adapter } = await mounted();
      await expect(adapter.mount(createHost(), MOUNT)).rejects.toMatchObject({
        reason: "load-failed",
      });
    });

    it("removes a map built after destroy was called during loading", async () => {
      const adapter = new MapLibreMapAdapter();
      const result = adapter.mount(createHost(), MOUNT);
      adapter.destroy();
      await expect(result).resolves.toBeUndefined();
      for (const map of FakeMapLibreMap.instances) {
        expect(map.removed).toBe(true);
      }
    });

    it("settles the mount when destroyed while waiting for the first load", async () => {
      const adapter = new MapLibreMapAdapter();
      const result = adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      adapter.destroy();
      await expect(result).resolves.toBeUndefined();
      expect(latestMap().removed).toBe(true);
    });
  });

  describe("engine DOM accessibility", () => {
    it("leaves the host as the only focus stop and hides the canvas", async () => {
      const { map, host } = await mounted();
      expect(map.canvas.hasAttribute("role")).toBe(false);
      expect(map.canvas.hasAttribute("aria-label")).toBe(false);
      expect(map.canvas.hasAttribute("tabindex")).toBe(false);
      expect(map.canvas.getAttribute("aria-hidden")).toBe("true");
      expect(host.getAttribute("tabindex")).toBe("0");
      expect(host.querySelectorAll("[tabindex]")).toHaveLength(0);
    });

    it("moves focus to the host", async () => {
      const { adapter, host } = await mounted();
      adapter.focus();
      expect(document.activeElement).toBe(host);
    });
  });

  describe("view", () => {
    it("reports the normalised view with a bearing in [0, 360)", async () => {
      const { adapter, map } = await mounted();
      map.center = { lng: 18.4, lat: -33.9 };
      map.zoom = 11.5;
      map.bearing = -90;
      expect(adapter.getView()).toEqual({
        center: { lat: -33.9, lng: 18.4 },
        zoom: 12.5,
        bearing: 270,
      });
      map.bearing = 180;
      expect(adapter.getView().bearing).toBe(180);
      map.bearing = -0;
      expect(Object.is(adapter.getView().bearing, 0)).toBe(true);
    });

    it("returns the mount view before the engine exists", () => {
      const adapter = new MapLibreMapAdapter();
      void adapter.mount(createHost(), MOUNT);
      expect(adapter.getView()).toEqual(MOUNT.view);
    });

    it("animates setView with converted zoom by default", async () => {
      const { adapter, map } = await mounted();
      adapter.setView({ center: { lat: 3, lng: 4 }, zoom: 12, bearing: 30 });
      expect(map.callsOf("easeTo")).toEqual([
        {
          method: "easeTo",
          args: [{ center: [4, 3], zoom: 11, bearing: 30, essential: true }],
        },
      ]);
    });

    it("jumps when the caller asks for no animation", async () => {
      const { adapter, map } = await mounted();
      adapter.setView({ zoom: 5 }, { animate: false });
      expect(map.callsOf("jumpTo")).toEqual([
        { method: "jumpTo", args: [{ zoom: 4 }] },
      ]);
      expect(map.callsOf("easeTo")).toHaveLength(0);
    });

    it("clamps setView zoom to the basemap limits", async () => {
      const { adapter, map } = await mounted({ basemap: DARK });
      adapter.setView({ zoom: 1 }, { animate: false });
      expect(map.zoom).toBe(1);
      adapter.setView({ zoom: 30 }, { animate: false });
      expect(map.zoom).toBe(13);
    });

    it("zooms in and out by one level", async () => {
      const { adapter, map } = await mounted();
      adapter.zoomIn();
      adapter.zoomOut({ animate: false });
      expect(map.callsOf("zoomIn")[0]?.args).toEqual([{ essential: true }]);
      expect(map.callsOf("zoomOut")[0]?.args).toEqual([
        { animate: false, duration: 0 },
      ]);
    });

    it("pans by screen pixels", async () => {
      const { adapter, map } = await mounted();
      adapter.panBy(40, -20);
      expect(map.callsOf("panBy")[0]?.args).toEqual([
        [40, -20],
        { essential: true },
      ]);
    });

    it("rotates clockwise and normalises the result", async () => {
      const { adapter, map } = await mounted();
      map.bearing = 350;
      adapter.rotateBy(20, { animate: false });
      expect(adapter.getView().bearing).toBe(10);
      adapter.rotateBy(-30, { animate: false });
      expect(adapter.getView().bearing).toBe(340);
    });

    it("resets the bearing to north", async () => {
      const { adapter, map } = await mounted();
      map.bearing = 123;
      adapter.resetBearing();
      expect(map.callsOf("easeTo")[0]?.args).toEqual([
        { bearing: 0, essential: true },
      ]);
    });

    it("fits bounds with padding, a converted maximum zoom and the current bearing", async () => {
      const { adapter, map } = await mounted();
      map.bearing = 15;
      adapter.fitBounds(
        { south: -35, west: 16, north: -22, east: 33 },
        { padding: { top: 1, right: 2, bottom: 3, left: 4 }, maxZoom: 14 },
      );
      expect(map.callsOf("fitBounds")[0]?.args).toEqual([
        [
          [16, -35],
          [33, -22],
        ],
        {
          padding: { top: 1, right: 2, bottom: 3, left: 4 },
          maxZoom: 13,
          bearing: 15,
          essential: true,
        },
      ]);
    });

    it("reports normalised zoom limits", async () => {
      const { adapter } = await mounted({ basemap: DARK });
      expect(adapter.getMinZoom()).toBe(2);
      expect(adapter.getMaxZoom()).toBe(14);
    });

    it("projects and unprojects through the engine as plain objects", async () => {
      const { adapter, map } = await mounted();
      const centre = adapter.project(MOUNT.view.center);
      expect(centre).toEqual({
        x: FAKE_VIEWPORT_WIDTH / 2,
        y: FAKE_VIEWPORT_HEIGHT / 2,
      });
      expect(Object.keys(centre)).toEqual(["x", "y"]);
      const position = adapter.unproject({ x: 10, y: 20 });
      expect(Object.keys(position)).toEqual(["lat", "lng"]);
      expect(map.project([position.lng, position.lat]).x).toBeCloseTo(10, 6);
    });

    it("measures ground resolution with the shared normalised maths", async () => {
      const { adapter, map } = await mounted();
      map.zoom = 11;
      map.center = { lng: 28, lat: -26.2 };
      expect(adapter.metresPerPixel()).toBe(metresPerPixel(-26.2, 12));
      expect(adapter.metresPerPixel(60)).toBe(metresPerPixel(60, 12));
    });

    it("ignores camera calls before the engine exists", () => {
      const adapter = new MapLibreMapAdapter();
      expect(() => {
        adapter.setView({ zoom: 3 });
        adapter.zoomIn();
        adapter.zoomOut();
        adapter.panBy(1, 1);
        adapter.rotateBy(10);
        adapter.resetBearing();
        adapter.fitBounds({ south: 0, west: 0, north: 1, east: 1 });
        adapter.setAnimationEnabled(false);
        adapter.setKeyboardEnabled(true);
        adapter.focus();
      }).not.toThrow();
    });
  });

  describe("animation", () => {
    it("jumps instead of easing for every camera call once animation is off", async () => {
      const { adapter, map } = await mounted();
      adapter.setAnimationEnabled(false);
      adapter.setView({ zoom: 4 });
      adapter.rotateBy(10);
      adapter.zoomIn();
      adapter.panBy(1, 2);
      adapter.fitBounds({ south: 0, west: 0, north: 1, east: 1 });
      expect(map.callsOf("easeTo")).toHaveLength(0);
      expect(map.callsOf("jumpTo")).toHaveLength(2);
      expect(map.callsOf("zoomIn")[0]?.args).toEqual([
        { animate: false, duration: 0 },
      ]);
      expect(map.callsOf("panBy")[0]?.args[1]).toEqual({
        animate: false,
        duration: 0,
      });
      expect(map.callsOf("fitBounds")[0]?.args[1]).toMatchObject({
        animate: false,
        duration: 0,
      });
    });

    it("stops a running animation and pan inertia when animation is turned off", async () => {
      const { adapter, map } = await mounted();
      adapter.setAnimationEnabled(false);
      expect(map.callsOf("stop")).toHaveLength(1);
      expect(map.callsOf("dragPan.enable").at(-1)?.args).toEqual([
        { maxSpeed: 0 },
      ]);
      adapter.setAnimationEnabled(true);
      expect(map.callsOf("dragPan.enable").at(-1)?.args).toEqual([undefined]);
      adapter.setView({ zoom: 4 });
      expect(map.callsOf("easeTo")).toHaveLength(1);
    });

    it("starts without animation when mounted with reduced motion", async () => {
      const { adapter, map } = await mounted({ reducedMotion: true });
      adapter.setView({ zoom: 4 });
      expect(map.callsOf("easeTo")).toHaveLength(0);
      expect(map.callsOf("dragPan.enable").at(-1)?.args).toEqual([
        { maxSpeed: 0 },
      ]);
    });
  });

  describe("keyboard", () => {
    it("toggles MapLibre's own keyboard handler", async () => {
      const { adapter, map } = await mounted();
      adapter.setKeyboardEnabled(true);
      expect(map.callsOf("keyboard.enable")).toHaveLength(1);
      adapter.setKeyboardEnabled(false);
      expect(map.callsOf("keyboard.disable")).toHaveLength(1);
    });
  });

  describe("events", () => {
    it("emits the normalised view for move, moveEnd, zoom and rotate", async () => {
      const { adapter, map } = await mounted();
      const seen: Array<[string, unknown]> = [];
      for (const name of ["move", "moveEnd", "zoom", "rotate"] as const) {
        adapter.on(name, (view) => seen.push([name, view]));
      }
      map.zoom = 4;
      map.bearing = -10;
      map.fire("move");
      map.fire("moveend");
      map.fire("zoom");
      map.fire("rotate");
      const view = {
        center: MOUNT.view.center,
        zoom: 5,
        bearing: 350,
      };
      expect(seen).toEqual([
        ["move", view],
        ["moveEnd", view],
        ["zoom", view],
        ["rotate", view],
      ]);
    });

    it("emits clicks with plain property bags of the features under the pointer", async () => {
      const { adapter, map } = await mounted();
      const click = vi.fn();
      adapter.on("click", click);
      map.features = [
        {
          properties: { name: "Main Road", rank: 3, oneway: false, ref: null },
          geometry: { type: "Point", coordinates: [0, 0] },
          layer: { id: "roads" },
          nested: { engine: "object" },
        },
        { properties: { kind: "park", shape: { type: "Polygon" } } },
        { properties: undefined },
      ];
      map.fire("click", {
        lngLat: { lng: 3, lat: -2, wrap: () => null },
        point: { x: 30, y: 20, mag: () => 0 },
      });
      expect(map.callsOf("queryRenderedFeatures")[0]?.args).toEqual([[30, 20]]);
      const event = click.mock.calls[0]?.[0];
      expect(event).toEqual({
        latlng: { lat: -2, lng: 3 },
        point: { x: 30, y: 20 },
        features: [
          { name: "Main Road", rank: 3, oneway: false, ref: null },
          { kind: "park" },
          {},
        ],
      });
      expect(Object.getPrototypeOf(event.features[0])).toBe(Object.prototype);
    });

    describe("feature taps", () => {
      const point = {
        id: "a",
        position: { lat: 0, lng: 0 },
        colour: "#e69f00",
        radius: 6,
        shape: "square" as const,
      };

      async function withPoints() {
        const subject = await mounted();
        subject.map.fire("style.load");
        subject.adapter.setFeatureLayer("quakes", [point]);
        const taps = vi.fn();
        subject.adapter.on("featureTap", taps);
        return { ...subject, taps };
      }

      it("looks for points within a fingertip of the tap, in data layers only", async () => {
        const { map, taps } = await withPoints();
        map.features = [];
        map.fire("click", {
          lngLat: { lng: 0, lat: 0 },
          point: { x: 50, y: 40 },
        });
        expect(map.callsOf("queryRenderedFeatures")[0]?.args).toEqual([
          [
            [34, 24],
            [66, 56],
          ],
          { layers: ["mapcairn:quakes:points"] },
        ]);
        expect(taps).not.toHaveBeenCalled();
      });

      it("adds one marker image per shape, colour and radius", async () => {
        const { map } = await withPoints();
        expect([...map.images.keys()]).toEqual([
          "mapcairn-marker:square:#e69f00:6",
        ]);
      });

      it("reports no tap when the query fails", async () => {
        const { map, taps } = await withPoints();
        map.queryError = new Error("style not loaded");
        map.fire("click", {
          lngLat: { lng: 0, lat: 0 },
          point: { x: 1, y: 1 },
        });
        expect(taps).not.toHaveBeenCalled();
      });

      it("ignores a hit without the adapter's own ids", async () => {
        const { map, taps } = await withPoints();
        map.features = [
          { layer: { id: "mapcairn:quakes:points" }, properties: {} },
        ];
        map.fire("click", {
          lngLat: { lng: 0, lat: 0 },
          point: { x: 1, y: 1 },
        });
        expect(taps).not.toHaveBeenCalled();
      });

      it("draws shape lines two pixels wide unless the caller sets a width", async () => {
        const { adapter, map } = await mounted();
        map.fire("style.load");
        const geometries = [
          {
            type: "LineString" as const,
            coordinates: [[0, 0] as const, [1, 1] as const],
          },
        ];
        adapter.setShapeLayer("plain", { geometries, colour: "#0072b2" });
        adapter.setShapeLayer("wide", {
          geometries,
          colour: "#0072b2",
          lineWidth: 6,
        });
        const width = (id: string) =>
          ((map.getLayer(id)?.paint ?? {}) as Record<string, unknown>)[
            "line-width"
          ];
        expect(width("mapcairn:plain:line")).toBe(2);
        expect(width("mapcairn:wide:line")).toBe(6);
      });

      it("asks the engine for no tile outside the bounds a tile overlay names", async () => {
        const { adapter, map } = await mounted();
        map.fire("style.load");
        const overlay = {
          tiles: "https://t.test/{z}/{x}/{y}.png",
          tileSize: 256 as const,
          maxzoom: 9,
          opacity: 1,
        };
        adapter.setTileLayer("bounded", {
          ...overlay,
          bounds: [-180, -60, 180, 85],
        });
        adapter.setTileLayer("whole", overlay);
        expect(map.sources.get("mapcairn:bounded")).toMatchObject({
          bounds: [-180, -60, 180, 85],
        });
        expect(map.sources.get("mapcairn:whole")).not.toHaveProperty("bounds");
      });

      it("changes only the paint when a tile overlay's opacity changes", async () => {
        const { adapter, map } = await mounted();
        map.fire("style.load");
        const overlay = {
          tiles: "https://t.test/{z}/{x}/{y}.png",
          tileSize: 256 as const,
          maxzoom: 9,
          opacity: 1,
        };
        adapter.setTileLayer("imagery", overlay);
        adapter.setTileLayer("imagery", { ...overlay, opacity: 0.5 });
        expect(
          map.callsOf("setPaintProperty").map((call) => call.args),
        ).toEqual([["mapcairn:imagery:tiles", "raster-opacity", 0.5]]);
      });
    });

    it("emits an empty feature list when the query fails", async () => {
      const { adapter, map } = await mounted();
      const click = vi.fn();
      adapter.on("click", click);
      map.queryError = new Error("style not loaded");
      map.fire("click", { lngLat: { lng: 1, lat: 1 }, point: { x: 1, y: 1 } });
      expect(click.mock.calls[0]?.[0].features).toEqual([]);
    });

    it("emits load once per style and loading only on transitions", async () => {
      const adapter = new MapLibreMapAdapter();
      const load = vi.fn();
      const loading = vi.fn();
      adapter.on("load", load);
      adapter.on("loading", loading);
      const result = adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      const map = latestMap();
      map.fire("styledataloading");
      map.fire("dataloading");
      map.fire("dataloading");
      map.fire("load");
      await result;
      map.fire("idle");
      map.fire("idle");
      expect(load).toHaveBeenCalledTimes(1);
      expect(loading.mock.calls).toEqual([[true], [false]]);
    });

    it("reports loading from construction, because MapLibre starts the style fetch before listeners exist", async () => {
      const adapter = new MapLibreMapAdapter();
      const loading = vi.fn();
      adapter.on("loading", loading);
      void adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      expect(loading.mock.calls).toEqual([[true]]);
      latestMap().fire("idle");
      expect(loading.mock.calls).toEqual([[true], [false]]);
    });

    it("reports tile and style errors and logs them", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      const tileError = vi.fn();
      adapter.on("tileError", tileError);
      map.fire("error", { error: new Error("tile"), tile: {} });
      map.fire("error", { error: new Error("worker failed") });
      expect(tileError).toHaveBeenCalledTimes(2);
      expect(tileError).toHaveBeenCalledWith(undefined);
      expect(log).toHaveBeenCalledTimes(2);
    });

    describe("an unavailable basemap", () => {
      async function watched() {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const { adapter, map } = await mounted({ basemap: STREETS });
        const unavailable = vi.fn();
        adapter.on("basemapUnavailable", unavailable);
        map.fire("style.load");
        return { adapter, map, unavailable };
      }

      const tileFailed = (map: FakeMapLibreMap, sourceId = "basemap") =>
        map.fire("error", { error: new Error("tile"), tile: {}, sourceId });
      const tileLoaded = (map: FakeMapLibreMap, sourceId = "basemap") =>
        map.fire("sourcedata", { sourceId, tile: {}, isSourceLoaded: false });

      it("is reported with the basemap, even when the map loads and settles before the mount has resolved", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const adapter = new MapLibreMapAdapter();
        const unavailable = vi.fn();
        adapter.on("basemapUnavailable", unavailable);
        const mounting = adapter.mount(createHost(), {
          ...MOUNT,
          basemap: STREETS,
        });
        await vi.waitFor(() => {
          expect(FakeMapLibreMap.instances.length).toBe(1);
        });
        const map = latestMap();
        map.fire("style.load");
        tileFailed(map);
        // MapLibre fires `load` and the first `idle` in one render when
        // nothing is left to draw, before anyone awaiting the mount runs.
        map.fire("load");
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
        expect(unavailable).toHaveBeenCalledWith(STREETS);
        await mounting;
      });

      it("blames the basemap whose style loaded, not one asked for since", async () => {
        const { adapter, map, unavailable } = await watched();
        tileFailed(map);
        void adapter.setBasemap(DARK).catch(() => undefined);
        map.fire("idle");
        expect(unavailable).not.toHaveBeenCalled();
        map.fire("style.load");
        tileFailed(map);
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
        expect(unavailable).toHaveBeenCalledWith(DARK);
      });

      it("is reported once the map settles with every tile of the basemap failed", async () => {
        const { map, unavailable } = await watched();
        tileFailed(map);
        tileFailed(map);
        expect(unavailable).not.toHaveBeenCalled();
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
        expect(unavailable).toHaveBeenCalledWith(STREETS);
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
      });

      it("is not reported while some tile of the basemap loaded", async () => {
        const { map, unavailable } = await watched();
        tileFailed(map);
        tileLoaded(map);
        tileFailed(map);
        map.fire("idle");
        expect(unavailable).not.toHaveBeenCalled();
      });

      it("is not reported when nothing failed, and an idle with no tiles says nothing", async () => {
        const { map, unavailable } = await watched();
        map.fire("idle");
        tileLoaded(map);
        map.fire("idle");
        expect(unavailable).not.toHaveBeenCalled();
      });

      it("counts a vector basemap's own sources and never a data layer's", async () => {
        const { map, unavailable } = await watched();
        tileFailed(map, "mapcairn:earthquakes");
        tileLoaded(map, "mapcairn:earthquakes");
        map.fire("idle");
        expect(unavailable).not.toHaveBeenCalled();
        tileFailed(map, "openmaptiles");
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
      });

      it("starts counting again when the next basemap's style loads", async () => {
        const { map, unavailable } = await watched();
        tileFailed(map);
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
        map.fire("style.load");
        tileLoaded(map);
        tileFailed(map);
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(1);
        map.fire("style.load");
        tileFailed(map);
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledTimes(2);
      });
    });

    describe("a worker error after load", () => {
      async function watched() {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const subject = await mounted();
        vi.useFakeTimers();
        const tileError = vi.fn();
        const fatalError = vi.fn();
        subject.adapter.on("tileError", tileError);
        subject.adapter.on("fatalError", fatalError);
        return { ...subject, tileError, fatalError };
      }

      it("is fatal when nothing has loaded by the end of the grace period", async () => {
        const { map, tileError, fatalError } = await watched();
        map.loadedState = false;
        map.fire("error", workerFailure());
        vi.advanceTimersByTime(WORKER_FAILURE_GRACE_MS - 1);
        expect(fatalError).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(tileError).not.toHaveBeenCalled();
        expect(fatalError).toHaveBeenCalledTimes(1);
        expect(fatalError.mock.calls[0]?.[0]).toMatchObject({
          name: "MapEngineError",
          reason: "stopped",
        });
      });

      it("is not fatal when the map goes idle during the grace period", async () => {
        const { map, tileError, fatalError } = await watched();
        map.loadedState = false;
        map.fire("error", workerFailure());
        map.fire("idle");
        vi.advanceTimersByTime(WORKER_FAILURE_GRACE_MS);
        expect(fatalError).not.toHaveBeenCalled();
        expect(tileError).toHaveBeenCalledTimes(1);
      });

      it("is not fatal when the map has everything loaded at the end of the grace period", async () => {
        const { map, tileError, fatalError } = await watched();
        map.fire("error", workerFailure());
        vi.advanceTimersByTime(WORKER_FAILURE_GRACE_MS);
        expect(fatalError).not.toHaveBeenCalled();
        expect(tileError).toHaveBeenCalledTimes(1);
      });

      it("checks once for a burst of worker errors", async () => {
        const { map, fatalError } = await watched();
        map.loadedState = false;
        map.fire("error", workerFailure());
        map.fire("error", workerFailure());
        vi.advanceTimersByTime(WORKER_FAILURE_GRACE_MS);
        expect(fatalError).toHaveBeenCalledTimes(1);
      });

      it("stops checking when the adapter is destroyed", async () => {
        const { adapter, map } = await watched();
        map.fire("error", workerFailure());
        expect(vi.getTimerCount()).toBe(1);
        adapter.destroy();
        expect(vi.getTimerCount()).toBe(0);
      });

      it("waits for as long as the adapter was told to", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const { adapter, map } = await mounted(
          {},
          new MapLibreMapAdapter({ workerFailureGraceMs: 10 }),
        );
        vi.useFakeTimers();
        const fatalError = vi.fn();
        adapter.on("fatalError", fatalError);
        map.loadedState = false;
        map.fire("error", workerFailure());
        vi.advanceTimersByTime(10);
        expect(fatalError).toHaveBeenCalledTimes(1);
      });
    });

    it("keeps errors without a tile or source that leave the map working as tile errors", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      const tileError = vi.fn();
      const fatalError = vi.fn();
      adapter.on("tileError", tileError);
      adapter.on("fatalError", fatalError);
      map.fire("error", {
        error: new Error(
          'Source layer "roads" does not exist on source "openmaptiles" as specified by style layer "road".',
        ),
      });
      map.fire("error", { error: new Error("Unable to load sprite") });
      expect(tileError).toHaveBeenCalledTimes(2);
      expect(fatalError).not.toHaveBeenCalled();
    });

    it("rejects a mount when the worker fails while it loads, rather than reporting it as fatal", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new MapLibreMapAdapter();
      const fatalError = vi.fn();
      adapter.on("fatalError", fatalError);
      const result = adapter.mount(createHost(), MOUNT);
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances).toHaveLength(1);
      });
      latestMap().fire("error", {
        error: new Error(
          "Worker failed to load. Check that the worker URL is correct.",
        ),
      });
      await expect(result).rejects.toMatchObject({ reason: "load-failed" });
      expect(fatalError).not.toHaveBeenCalled();
    });

    it("reports a zoom that carries the person's input event as userZoom, and no other", async () => {
      const { adapter, map } = await mounted();
      const userZoom = vi.fn();
      const zoom = vi.fn();
      adapter.on("userZoom", userZoom);
      adapter.on("zoom", zoom);
      map.gesture({ zoom: 6 }, new WheelEvent("wheel"));
      expect(userZoom).toHaveBeenCalledTimes(1);
      expect(userZoom.mock.calls[0]?.[0]).toMatchObject({ zoom: 7 });
      expect(zoom).toHaveBeenCalledTimes(1);
      adapter.setView({ zoom: 9 }, { animate: false });
      adapter.zoomIn();
      expect(zoom).toHaveBeenCalledTimes(3);
      expect(userZoom).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes a handler", async () => {
      const { adapter, map } = await mounted();
      const move = vi.fn();
      const off = adapter.on("move", move);
      off();
      map.fire("move");
      expect(move).not.toHaveBeenCalled();
    });
  });

  describe("projection", () => {
    it("keeps the map flat by default, whatever a style asks for, on the first load and after every basemap swap", async () => {
      const { map } = await mounted();
      map.projection = { type: "globe" };
      map.fire("style.load");
      expect(map.projection).toEqual({ type: "mercator" });

      // A swap loads a style that asks for a globe again.
      map.projection = { type: "globe" };
      map.fire("style.load");
      expect(map.projection).toEqual({ type: "mercator" });
    });

    it("draws a globe when mounted with one, and again after every style load, whatever the style asks for", async () => {
      const { map } = await mounted({ projection: "globe" });
      map.fire("style.load");
      expect(map.projection).toEqual({ type: "globe" });

      map.projection = { type: "mercator" };
      map.fire("style.load");
      expect(map.projection).toEqual({ type: "globe" });
    });

    it("switches the engine when the shape changes, and back", async () => {
      const { adapter, map } = await mounted();
      map.fire("style.load");
      adapter.setProjection("globe");
      expect(map.projection).toEqual({ type: "globe" });
      adapter.setProjection("flat");
      expect(map.projection).toEqual({ type: "mercator" });
    });

    it("holds a shape chosen while a style is loading until the style has loaded", async () => {
      const { adapter, map } = await mounted();
      void adapter.setBasemap(DARK);
      map.callsOf("setProjection").length = 0;
      adapter.setProjection("globe");
      expect(map.callsOf("setProjection")).toHaveLength(0);
      map.fire("style.load");
      expect(map.projection).toEqual({ type: "globe" });
    });

    it("asks the engine's horizon test whether a place is visible, and only on a globe", async () => {
      const { adapter, map } = await mounted({ projection: "globe" });
      map.fire("style.load");
      const view = adapter.getView().center;
      expect(adapter.isVisible(view)).toBe(true);
      expect(adapter.isVisible({ lat: -view.lat, lng: view.lng + 180 })).toBe(
        false,
      );
      adapter.setProjection("flat");
      expect(adapter.isVisible({ lat: -view.lat, lng: view.lng + 180 })).toBe(
        true,
      );
    });
  });

  describe("Save data", () => {
    it("takes the basemap's omitted layers and the source only they use out of the style that loads, when mounted in Save data mode", async () => {
      const { map } = await mounted({ basemap: WITH_RELIEF, saveData: true });
      loadReliefStyle(map);
      expect(layerIds(map)).toEqual(["background", "roads", "water"]);
      // The source the other layers share, and one no layer used, stay.
      expect([...map.sources.keys()].sort()).toEqual(["planet", "spare"]);
      expect(map.callsOf("removeLayer").map((call) => call.args[0])).toEqual([
        "relief",
      ]);
      expect(map.callsOf("removeSource").map((call) => call.args[0])).toEqual([
        "relief-source",
      ]);
    });

    it("leaves a source that another layer still uses", async () => {
      const { map } = await mounted({
        basemap: { ...WITH_RELIEF, saveDataOmitLayers: ["roads"] },
        saveData: true,
      });
      loadReliefStyle(map);
      expect(layerIds(map)).toEqual(["background", "relief", "water"]);
      expect(map.callsOf("removeSource")).toEqual([]);
    });

    it("keeps every layer when Save data is off, and by default", async () => {
      for (const options of [
        { basemap: WITH_RELIEF },
        { basemap: WITH_RELIEF, saveData: false },
      ]) {
        const { map } = await mounted(options);
        loadReliefStyle(map);
        expect(layerIds(map)).toContain("relief");
        expect(map.callsOf("removeLayer")).toEqual([]);
      }
    });

    it("skips a listed layer the style does not have, and a basemap that lists none", async () => {
      const { map } = await mounted({
        basemap: { ...WITH_RELIEF, saveDataOmitLayers: ["no-such-layer"] },
        saveData: true,
      });
      loadReliefStyle(map);
      expect(layerIds(map)).toHaveLength(4);
      const plain = await mounted({ basemap: POSITRON, saveData: true });
      loadReliefStyle(plain.map);
      expect(layerIds(plain.map)).toHaveLength(4);
    });

    it("decides again on every swap, with the same setStyle call as before", async () => {
      const { adapter, map } = await mounted({
        basemap: WITH_RELIEF,
        saveData: true,
      });
      const toPositron = adapter.setBasemap(POSITRON, { saveData: true });
      expect(map.callsOf("setStyle")[0]?.args).toEqual([
        "https://tiles.example/positron",
        { diff: false },
      ]);
      loadReliefStyle(map);
      expect(layerIds(map)).toContain("relief");
      await toPositron;

      const back = adapter.setBasemap(WITH_RELIEF);
      loadReliefStyle(map);
      expect(layerIds(map)).toContain("relief");
      await back;

      const saving = adapter.setBasemap(WITH_RELIEF, { saveData: true });
      loadReliefStyle(map);
      expect(layerIds(map)).not.toContain("relief");
      await saving;
    });

    it("draws the data layers again on a swap that leaves layers out, so a Save data toggle keeps them", async () => {
      const { adapter, map } = await mounted({ basemap: WITH_RELIEF });
      map.fire("style.load");
      adapter.setFeatureLayer("quakes", [
        {
          id: "a",
          position: { lat: 0, lng: 0 },
          colour: "#e69f00",
          radius: 6,
          shape: "square" as const,
        },
      ]);
      adapter.setTileLayer("imagery", {
        tiles: "https://t.test/{z}/{x}/{y}.png",
        tileSize: 256,
        maxzoom: 9,
        opacity: 1,
      });
      const saving = adapter.setBasemap(WITH_RELIEF, { saveData: true });
      loadReliefStyle(map);
      await saving;
      expect(layerIds(map)).not.toContain("relief");
      expect(layerIds(map)).toEqual(
        expect.arrayContaining([
          "mapcairn:quakes:points",
          "mapcairn:imagery:tiles",
        ]),
      );
      const full = adapter.setBasemap(WITH_RELIEF, { saveData: false });
      loadReliefStyle(map);
      await full;
      expect(layerIds(map)).toContain("relief");
      expect(layerIds(map)).toEqual(
        expect.arrayContaining([
          "mapcairn:quakes:points",
          "mapcairn:imagery:tiles",
        ]),
      );
    });

    it("puts the last basemap back, still in Save data mode, when a swap fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted({
        basemap: WITH_RELIEF,
        saveData: true,
      });
      const failing = adapter.setBasemap(POSITRON, { saveData: true });
      map.fire("error", { error: new Error("style 404") });
      await expect(failing).rejects.toBeInstanceOf(MapEngineError);
      expect(map.callsOf("setStyle").at(-1)?.args).toEqual([
        "https://tiles.example/dark",
        { diff: false },
      ]);
      loadReliefStyle(map);
      expect(layerIds(map)).not.toContain("relief");
    });
  });

  describe("a hybrid basemap", () => {
    /**
     * Gives the fake engine the label style it "loaded": a background, a land
     * fill, a water fill and a road-area fill to leave out, roads and place
     * names to keep, ferry routes the basemap names to leave out, and a relief
     * raster drawn from a source of its own.
     */
    function loadLabelStyle(map: FakeMap): void {
      const planet = (id: string, type: string, sourceLayer: string) => ({
        id,
        type,
        source: "planet",
        "source-layer": sourceLayer,
      });
      map.basemapLayers = [];
      map.styleLayers = [
        { id: "background", type: "background" },
        planet("park", "fill", "park"),
        planet("water", "fill", "water"),
        { id: "relief", type: "raster", source: "relief-source" },
        planet("road-area", "fill", "transportation"),
        planet("roads", "line", "transportation"),
        planet("ferries", "line", "transportation"),
        planet("towns", "symbol", "place"),
      ];
      map.sources.clear();
      for (const id of ["planet", "relief-source"]) {
        map.sources.set(id, {});
      }
      map.fire("style.load");
    }

    it("loads the label style", async () => {
      const { map } = await mounted({ basemap: FAKE_HYBRID_BASEMAP });
      expect(map.options.style).toBe("https://tiles.example/labels.json");
    });

    it("keeps only the line and symbol layers of the label source layers, less those it names to leave out, and draws the imagery under them", async () => {
      const { map } = await mounted({ basemap: FAKE_HYBRID_BASEMAP });
      loadLabelStyle(map);
      // The road-area fill draws from a kept source layer, but would paint
      // pale patches over the imagery.
      expect(layerIds(map)).toEqual([
        "basemap-ground",
        "basemap-imagery",
        "roads",
        "towns",
      ]);
      expect(map.getLayer("basemap-imagery")).toMatchObject({
        type: "raster",
        source: "basemap-imagery",
      });
      expect(map.sources.get("basemap-imagery")).toEqual({
        type: "raster",
        tiles: ["https://imagery.example/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 14,
      });
      // The relief raster's own source goes with it; the shared one stays.
      expect([...map.sources.keys()].sort()).toEqual([
        "basemap-imagery",
        "planet",
      ]);
    });

    it("lays a plain ground in the basemap's swatch colour under the imagery, so a dark basemap is never pale before it draws", async () => {
      const { map } = await mounted({ basemap: FAKE_HYBRID_BASEMAP });
      loadLabelStyle(map);
      expect(map.getLayer("basemap-ground")).toMatchObject({
        type: "background",
        paint: { "background-color": "#203024" },
      });
    });

    it("lays no ground for a hybrid basemap with no swatch", async () => {
      const { swatch: _swatch, ...withoutSwatch } = FAKE_HYBRID_BASEMAP;
      const { map } = await mounted({ basemap: withoutSwatch });
      loadLabelStyle(map);
      expect(layerIds(map)[0]).toBe("basemap-imagery");
      expect(map.getLayer("basemap-ground")).toBeUndefined();
    });

    it("puts the last basemap back, and draws the data layers again on it, when the hybrid cannot be put together", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      map.fire("style.load");
      adapter.setFeatureLayer("quakes", [
        {
          id: "a",
          position: { lat: 0, lng: 0 },
          colour: "#e69f00",
          radius: 6,
          shape: "square" as const,
        },
      ]);
      const addSource = map.addSource.bind(map);
      const failing = vi.spyOn(map, "addSource").mockImplementationOnce(() => {
        throw new Error("The engine refused the source.");
      });
      const swapping = adapter.setBasemap(FAKE_HYBRID_BASEMAP);
      loadLabelStyle(map);
      await expect(swapping).rejects.toBeInstanceOf(MapEngineError);
      expect(map.callsOf("setStyle").at(-1)?.args).toEqual([
        "https://tiles.example/positron",
        { diff: false },
      ]);
      failing.mockImplementation(addSource);
      map.fire("style.load");
      expect(layerIds(map)).toContain("mapcairn:quakes:points");
      expect(layerIds(map)).not.toContain("basemap-imagery");
    });

    it("still draws the data layers when the hybrid cannot be put together with nothing pending", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted({ basemap: FAKE_HYBRID_BASEMAP });
      adapter.setFeatureLayer("quakes", [
        {
          id: "a",
          position: { lat: 0, lng: 0 },
          colour: "#e69f00",
          radius: 6,
          shape: "square" as const,
        },
      ]);
      vi.spyOn(map, "addSource").mockImplementationOnce(() => {
        throw new Error("The engine refused the source.");
      });
      loadLabelStyle(map);
      expect(log).toHaveBeenCalledWith(
        "The hybrid basemap could not be put together",
        expect.any(Error),
      );
      expect(layerIds(map)).toContain("mapcairn:quakes:points");
    });

    it("rejects the mount, rather than leaving it pending, when the hybrid cannot be put together", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const adapter = new MapLibreMapAdapter();
      const mounting = adapter.mount(createHost(), {
        ...MOUNT,
        basemap: FAKE_HYBRID_BASEMAP,
      });
      await vi.waitFor(() => {
        expect(FakeMapLibreMap.instances.length).toBe(1);
      });
      const map = latestMap();
      vi.spyOn(map, "addSource").mockImplementationOnce(() => {
        throw new Error("The engine refused the source.");
      });
      loadLabelStyle(map);
      await expect(mounting).rejects.toBeInstanceOf(MapEngineError);
    });

    it("lets the map zoom past the imagery's deepest level, for the labels", async () => {
      const { map } = await mounted({ basemap: FAKE_HYBRID_BASEMAP });
      // MapLibre counts 512 px tiles, one below the normalised zoom of 17.
      expect(map.options.maxZoom).toBe(16);
    });

    it("composes the imagery again after a swap to it, and leaves other basemaps alone", async () => {
      const { adapter, map } = await mounted();
      loadLabelStyle(map);
      expect(layerIds(map)).not.toContain("basemap-imagery");
      expect(layerIds(map)).toContain("background");
      const swapping = adapter.setBasemap(FAKE_HYBRID_BASEMAP);
      expect(map.callsOf("setStyle").at(-1)?.args).toEqual([
        "https://tiles.example/labels.json",
        { diff: false },
      ]);
      loadLabelStyle(map);
      await swapping;
      expect(layerIds(map).slice(0, 2)).toEqual([
        "basemap-ground",
        "basemap-imagery",
      ]);
    });

    it("draws data layers over the imagery", async () => {
      const { adapter, map } = await mounted({ basemap: FAKE_HYBRID_BASEMAP });
      adapter.setFeatureLayer("quakes", [
        {
          id: "a",
          position: { lat: 0, lng: 0 },
          colour: "#e69f00",
          radius: 6,
          shape: "square" as const,
        },
      ]);
      loadLabelStyle(map);
      expect(layerIds(map)[1]).toBe("basemap-imagery");
      expect(layerIds(map).at(-1)).toBe("mapcairn:quakes:points");
    });

    describe("availability", () => {
      async function watched() {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const { adapter, map } = await mounted({
          basemap: FAKE_HYBRID_BASEMAP,
        });
        const unavailable = vi.fn();
        adapter.on("basemapUnavailable", unavailable);
        loadLabelStyle(map);
        return { map, unavailable };
      }
      const tile = (map: FakeMap, sourceId: string, failed: boolean) =>
        failed
          ? map.fire("error", { error: new Error("tile"), tile: {}, sourceId })
          : map.fire("sourcedata", { sourceId, tile: {} });

      it("is reported when every imagery tile failed, even though the labels loaded", async () => {
        const { map, unavailable } = await watched();
        tile(map, "planet", false);
        tile(map, "basemap-imagery", true);
        map.fire("idle");
        expect(unavailable).toHaveBeenCalledWith(FAKE_HYBRID_BASEMAP);
      });

      it("is not reported while some imagery loaded, whatever the labels do", async () => {
        const { map, unavailable } = await watched();
        tile(map, "planet", true);
        tile(map, "basemap-imagery", true);
        tile(map, "basemap-imagery", false);
        map.fire("idle");
        expect(unavailable).not.toHaveBeenCalled();
      });
    });
  });

  describe("setBasemap", () => {
    it("swaps the style without diffing, keeps the view and updates zoom limits", async () => {
      const { adapter, map } = await mounted();
      const swapping = adapter.setBasemap(DARK);
      expect(map.callsOf("setStyle")[0]?.args).toEqual([
        "https://tiles.example/dark",
        { diff: false },
      ]);
      expect(map.minZoom).toBe(1);
      expect(map.maxZoom).toBe(13);
      expect(adapter.getMinZoom()).toBe(2);
      expect(adapter.getMaxZoom()).toBe(14);
      map.fire("style.load");
      await expect(swapping).resolves.toBeUndefined();
    });

    it("orders zoom limit updates so the engine never sees min above max", async () => {
      const { adapter, map } = await mounted({ basemap: DARK });
      const high: BasemapDefinition = { ...POSITRON, minZoom: 16, maxZoom: 22 };
      void adapter.setBasemap(high);
      expect(map.minZoom).toBe(15);
      expect(map.maxZoom).toBe(21);
      const low: BasemapDefinition = { ...POSITRON, minZoom: 0, maxZoom: 3 };
      void adapter.setBasemap(low);
      expect(map.minZoom).toBe(-1);
      expect(map.maxZoom).toBe(2);
    });

    it("emits load again on the first idle of the new style", async () => {
      const { adapter, map } = await mounted();
      const load = vi.fn();
      adapter.on("load", load);
      map.fire("idle");
      expect(load).not.toHaveBeenCalled();
      void adapter.setBasemap(DARK);
      map.fire("style.load");
      map.fire("idle");
      map.fire("idle");
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("rejects with load-failed when the new style fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      const swapping = adapter.setBasemap(DARK);
      const tileError = vi.fn();
      adapter.on("tileError", tileError);
      map.fire("error", { error: new Error("404 style") });
      await expect(swapping).rejects.toMatchObject({
        name: "MapEngineError",
        reason: "load-failed",
      });
      // Reported once, through the promise, not also as a tile error.
      expect(tileError).not.toHaveBeenCalled();
    });

    it("puts the previous basemap back when the new style fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      const load = vi.fn();
      adapter.on("load", load);
      const swapping = adapter.setBasemap(DARK);
      map.fire("error", { error: new Error("404 style") });
      await expect(swapping).rejects.toBeInstanceOf(MapEngineError);
      expect(adapter.getMinZoom()).toBe(0);
      expect(adapter.getMaxZoom()).toBe(22);
      expect(map.minZoom).toBe(-1);
      expect(map.maxZoom).toBe(21);
      expect(map.callsOf("setStyle").at(-1)?.args).toEqual([
        "https://tiles.example/positron",
        { diff: false },
      ]);
      // The restored style reports load like any other.
      map.fire("style.load");
      map.fire("idle");
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("puts back the last basemap that loaded, not one that was superseded", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      const first = adapter.setBasemap(DARK);
      map.fire("style.load");
      await expect(first).resolves.toBeUndefined();
      void adapter.setBasemap(POSITRON);
      const failing = adapter.setBasemap(STREETS);
      map.fire("error", { error: new Error("404 style") });
      await expect(failing).rejects.toBeInstanceOf(MapEngineError);
      expect(adapter.getMinZoom()).toBe(2);
      expect(adapter.getMaxZoom()).toBe(14);
      expect(map.callsOf("setStyle").at(-1)?.args).toEqual([
        "https://tiles.example/dark",
        { diff: false },
      ]);
    });

    it("treats a sprite failure after the new style loaded as a tile error", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { adapter, map } = await mounted();
      const tileError = vi.fn();
      adapter.on("tileError", tileError);
      const swapping = adapter.setBasemap(DARK);
      map.fire("style.load");
      map.fire("error", { error: new Error("Unable to load sprite") });
      await expect(swapping).resolves.toBeUndefined();
      expect(tileError).toHaveBeenCalledTimes(1);
      expect(adapter.getMaxZoom()).toBe(14);
    });

    it("swaps between a vector style and a raster style both ways", async () => {
      const { adapter, map } = await mounted();
      const toRaster = adapter.setBasemap(STREETS);
      expect(map.callsOf("setStyle")[0]?.args).toEqual([
        STREETS_STYLE,
        { diff: false },
      ]);
      expect(map.maxZoom).toBe(18);
      map.fire("style.load");
      await expect(toRaster).resolves.toBeUndefined();
      const toVector = adapter.setBasemap(DARK);
      expect(map.callsOf("setStyle")[1]?.args).toEqual([
        "https://tiles.example/dark",
        { diff: false },
      ]);
      map.fire("style.load");
      await expect(toVector).resolves.toBeUndefined();
    });

    it("rejects before mount", async () => {
      const adapter = new MapLibreMapAdapter();
      await expect(adapter.setBasemap(DARK)).rejects.toBeInstanceOf(
        MapEngineError,
      );
    });

    it("settles a superseded swap", async () => {
      const { adapter, map } = await mounted();
      const first = adapter.setBasemap(DARK);
      const second = adapter.setBasemap(POSITRON);
      await expect(first).resolves.toBeUndefined();
      map.fire("style.load");
      await expect(second).resolves.toBeUndefined();
    });
  });

  describe("edit handles", () => {
    const HANDLE = {
      id: "v0",
      position: { lat: -26.2, lng: 28.05 },
      kind: "vertex" as const,
    };

    function pointerEvent(
      map: FakeMap,
      position: { lat: number; lng: number },
      extra: Record<string, unknown> = {},
    ) {
      const point = map.project([position.lng, position.lat]);
      return {
        lngLat: position,
        point,
        points: [point],
        preventDefault: vi.fn(),
        ...extra,
      };
    }

    it("stops the engine panning for a mouse press on a handle, and only then", async () => {
      const { adapter, map } = await mounted();
      adapter.setEditHandles([HANDLE]);
      const onHandle = pointerEvent(map, HANDLE.position);
      map.fire("mousedown", onHandle);
      expect(onHandle.preventDefault).toHaveBeenCalledTimes(1);
      map.fire("mouseup", onHandle);

      const away = pointerEvent(map, { lat: -26.5, lng: 28.5 });
      map.fire("mousedown", away);
      expect(away.preventDefault).not.toHaveBeenCalled();
    });

    it("stops the engine panning for a one-finger press on a handle", async () => {
      const { adapter, map } = await mounted();
      adapter.setEditHandles([HANDLE]);
      const press = pointerEvent(map, HANDLE.position);
      map.fire("touchstart", press);
      expect(press.preventDefault).toHaveBeenCalledTimes(1);
    });

    it("leaves a two-finger press to the engine", async () => {
      const { adapter, map } = await mounted();
      adapter.setEditHandles([HANDLE]);
      const handlers = vi.fn();
      adapter.on("handleDrag", handlers);
      const point = map.project([HANDLE.position.lng, HANDLE.position.lat]);
      const pinch = {
        ...pointerEvent(map, HANDLE.position),
        points: [point, { x: point.x + 90, y: point.y }],
      };
      map.fire("touchstart", pinch);
      expect(pinch.preventDefault).not.toHaveBeenCalled();
      expect(handlers).not.toHaveBeenCalled();
    });

    it("ends a press when the touch is cancelled", async () => {
      const { adapter, map } = await mounted();
      adapter.setEditHandles([HANDLE]);
      const phases: string[] = [];
      adapter.on("handleDrag", (drag) => phases.push(drag.phase));
      map.fire("touchstart", pointerEvent(map, HANDLE.position));
      map.fire("touchcancel", pointerEvent(map, HANDLE.position));
      expect(phases).toEqual(["start", "end"]);
    });

    it("drops the click after a press on a handle but not a later one", async () => {
      const { adapter, map } = await mounted();
      adapter.setEditHandles([HANDLE]);
      const click = vi.fn();
      adapter.on("click", click);
      map.fire("mousedown", pointerEvent(map, HANDLE.position));
      map.fire("mouseup", pointerEvent(map, HANDLE.position));
      map.fire("click", pointerEvent(map, HANDLE.position));
      expect(click).not.toHaveBeenCalled();
      map.fire("mousedown", pointerEvent(map, { lat: -26.5, lng: 28.5 }));
      map.fire("click", pointerEvent(map, { lat: -26.5, lng: 28.5 }));
      expect(click).toHaveBeenCalledTimes(1);
    });

    it("does nothing with the mouse when no handles are set", async () => {
      const { adapter, map } = await mounted();
      const hover = vi.fn();
      adapter.on("handleHover", hover);
      map.fire("mousemove", pointerEvent(map, HANDLE.position));
      expect(hover).not.toHaveBeenCalled();
    });

    it("forgets a press in progress when the map is torn down", async () => {
      const { adapter, map } = await mounted();
      adapter.setEditHandles([HANDLE]);
      map.fire("mousedown", pointerEvent(map, HANDLE.position));
      adapter.destroy();
      expect(() => adapter.setEditHandles([])).not.toThrow();
    });
  });

  describe("destroy", () => {
    it("removes the map and every listener, and is safe to call twice", async () => {
      const { adapter, map } = await mounted();
      const move = vi.fn();
      adapter.on("move", move);
      adapter.destroy();
      adapter.destroy();
      expect(map.callsOf("remove")).toHaveLength(1);
      expect(map.listenerCount()).toBe(0);
      map.fire("move");
      expect(move).not.toHaveBeenCalled();
    });

    it("settles a pending basemap swap", async () => {
      const { adapter } = await mounted();
      const swapping = adapter.setBasemap(DARK);
      adapter.destroy();
      await expect(swapping).resolves.toBeUndefined();
    });

    it("refuses to mount after destroy", async () => {
      const adapter = new MapLibreMapAdapter();
      adapter.destroy();
      await expect(adapter.mount(createHost(), MOUNT)).rejects.toMatchObject({
        reason: "load-failed",
      });
    });
  });
});

const LOOK: MapShapeLook = {
  colour: "#0072b2",
  fillOpacity: 0.55,
  pattern: "solid",
  dash: "solid",
  width: 1.5,
};

const polygon = (west: number) => ({
  type: "Polygon" as const,
  coordinates: [
    [
      [west, 0],
      [west + 1, 0],
      [west + 1, 1],
      [west, 0],
    ],
  ] as const,
});

const STYLED_AREAS: MapStyledShapes = {
  geometry: "area",
  shapes: [
    {
      id: "north",
      geometry: polygon(2.3),
      look: { ...LOOK, pattern: "dots", dash: "dashed" },
      label: "North",
    },
    { id: "south", geometry: polygon(4), look: LOOK },
    {
      id: "route",
      geometry: {
        type: "LineString",
        coordinates: [
          [2, 48],
          [3, 49],
        ],
      },
      look: LOOK,
    },
  ],
  labelMinZoom: 5,
};

const STYLED_LINES: MapStyledShapes = {
  geometry: "line",
  shapes: [
    {
      id: "main",
      geometry: {
        type: "LineString",
        coordinates: [
          [2, 48],
          [3, 49],
        ],
      },
      look: { ...LOOK, dash: "dotted", width: 4 },
      label: "Main",
    },
    { id: "lake", geometry: polygon(1), look: LOOK },
  ],
};

const TILE_SOURCE = {
  tiles: "https://vector.test/{z}/{x}/{y}.pbf",
  minzoom: 0,
  maxzoom: 14,
} as const;

const VECTOR: MapVectorTiles = {
  source: TILE_SOURCE,
  minzoom: 3,
  maxzoom: 17,
  layers: [
    {
      sourceLayer: "areas",
      geometry: "area",
      rule: {
        kind: "category",
        field: "kind",
        cases: [{ value: "park", look: { ...LOOK, pattern: "stripes" } }],
        fallback: { ...LOOK, colour: "#e69f00" },
      },
      label: { field: "name", minzoom: 8 },
    },
    {
      sourceLayer: "borders",
      geometry: "line",
      minzoom: 5,
      rule: {
        kind: "steps",
        field: "rank",
        steps: [
          { min: 0, look: LOOK },
          { min: 5, look: { ...LOOK, width: 3, dash: "dashed" } },
        ],
      },
    },
  ],
};

const HEAT_STYLE = {
  radius: 20,
  intensity: 1.5,
  opacity: 0.8,
  ramp: ["#440154", "#21918c", "#fde725"],
} as const;

const HEAT_POINTS: MapHeatmap = {
  source: {
    kind: "points",
    points: [
      { position: { lat: 48.86, lng: 2.35 }, weight: 3 },
      { position: { lat: -1.29, lng: 36.82 } },
    ],
  },
  style: HEAT_STYLE,
};

const HEAT_VECTOR: MapHeatmap = {
  source: {
    kind: "vector",
    source: TILE_SOURCE,
    sourceLayer: "events",
    weightField: "size",
    minzoom: 6,
    maxzoom: 12,
  },
  style: HEAT_STYLE,
};

/** An engine spec or GeoJSON object the tests walk into; it is untyped JSON. */
// biome-ignore lint/suspicious/noExplicitAny: nested untyped JSON
type Spec = Record<string, any>;

describe("MapLibreMapAdapter data layers", () => {
  let restoreCanvas = () => {};

  beforeEach(() => {
    restoreCanvas = canvasStub.install();
  });

  afterEach(() => {
    restoreCanvas();
  });

  /** A mounted map with its first style loaded. */
  async function ready(basemap: BasemapDefinition = POSITRON) {
    const subject = await mounted({ basemap });
    subject.map.fire("style.load");
    return subject;
  }

  const spec = (map: FakeMap, id: string): Spec => {
    const found = map.getLayer(id);
    if (!found) {
      throw new Error(`No layer ${id}`);
    }
    return found as Spec;
  };

  const idsOf = (map: FakeMap, prefix: string) =>
    layerIds(map).filter((id) => String(id).startsWith(prefix));

  describe("styled shapes", () => {
    it("draws an area layer bottom to top: fill, pattern, then one outline per dash style", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      expect(layerIds(map)).toEqual([
        "mapcairn:regions:styled-fill",
        "mapcairn:regions:styled-pattern",
        "mapcairn:regions:styled-outline-solid",
        "mapcairn:regions:styled-outline-dashed",
        "mapcairn:regions:styled-outline-dotted",
      ]);
      expect(spec(map, "mapcairn:regions:styled-fill").paint).toEqual({
        "fill-color": ["get", "colour"],
        "fill-opacity": ["get", "fillOpacity"],
      });
    });

    it("puts the look on each shape as properties and leaves out the other geometry kind", async () => {
      const { adapter, map } = await ready();
      adapter.setStyledShapes("regions", STYLED_AREAS);
      const { data } = map.sources.get("mapcairn:regions") as Spec;
      expect(data.features.map((f: Spec) => f.properties)).toEqual([
        {
          "mapcairn:layer": "regions",
          "mapcairn:id": "north",
          colour: "#0072b2",
          fillOpacity: 0.55,
          pattern: "dots",
          dash: "dashed",
          width: 1.5,
          label: "North",
        },
        expect.objectContaining({ "mapcairn:id": "south", label: "" }),
      ]);
      adapter.setStyledShapes("routes", STYLED_LINES);
      const lines = map.sources.get("mapcairn:routes") as Spec;
      expect(lines.data.features).toHaveLength(1);
    });

    it("hatches only the shapes with a pattern, from named images", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      const pattern = spec(map, "mapcairn:regions:styled-pattern");
      expect(pattern.filter).toEqual(["!=", ["get", "pattern"], "solid"]);
      expect(pattern.paint).toEqual({
        "fill-pattern": ["concat", "mapcairn-pattern:", ["get", "pattern"]],
      });
    });

    it("adds each pattern image once, as a power of two at pixel ratio 2", async () => {
      const { adapter, map } = await ready();
      adapter.setStyledShapes("regions", STYLED_AREAS);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      expect([...map.images.keys()]).toEqual([
        "mapcairn-pattern:stripes",
        "mapcairn-pattern:dots",
        "mapcairn-pattern:crosshatch",
      ]);
      const { image, options } = map.images.get(
        "mapcairn-pattern:dots",
      ) as Spec;
      expect(options).toEqual({ pixelRatio: 2 });
      expect(image.width).toBe(16);
      expect(image.data).toHaveLength(16 * 16 * 4);
    });

    it("outlines polygons in the ink colour, with a literal dash array per style", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      const solid = spec(map, "mapcairn:regions:styled-outline-solid");
      const dashed = spec(map, "mapcairn:regions:styled-outline-dashed");
      const dotted = spec(map, "mapcairn:regions:styled-outline-dotted");
      expect(solid.filter).toEqual(["==", ["get", "dash"], "solid"]);
      expect(dashed.filter).toEqual(["==", ["get", "dash"], "dashed"]);
      expect(solid.paint).toEqual({
        "line-color": tokenValues.dataMarker.edge,
        "line-width": ["get", "width"],
      });
      expect(dashed.paint["line-dasharray"]).toEqual([3, 2]);
      expect(dotted.paint["line-dasharray"]).toEqual([1, 2]);
    });

    it("draws a line under a wider casing, one layer per dash style each", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("routes", STYLED_LINES);
      expect(layerIds(map)).toEqual([
        "mapcairn:routes:styled-casing-solid",
        "mapcairn:routes:styled-casing-dashed",
        "mapcairn:routes:styled-casing-dotted",
        "mapcairn:routes:styled-line-solid",
        "mapcairn:routes:styled-line-dashed",
        "mapcairn:routes:styled-line-dotted",
      ]);
      const casing = spec(map, "mapcairn:routes:styled-casing-dotted");
      expect(casing.paint["line-color"]).toBe(tokenValues.dataMarker.halo);
      expect(casing.paint["line-width"]).toEqual([
        "+",
        ["get", "width"],
        2 * tokenValues.dataMarker.haloWidth,
      ]);
      expect(casing.paint["line-dasharray"]).toEqual([1, 2]);
      expect(
        spec(map, "mapcairn:routes:styled-line-dotted").paint["line-color"],
      ).toEqual(["get", "colour"]);
    });

    describe("labels", () => {
      it("draws them with the basemap's own font when it has a glyph source", async () => {
        const { adapter, map } = await ready(POSITRON);
        adapter.setStyledShapes("regions", STYLED_AREAS);
        const label = spec(map, "mapcairn:regions:styled-label");
        expect(label.type).toBe("symbol");
        expect(label.layout).toMatchObject({
          "text-field": ["get", "label"],
          "text-font": ["Test Sans Regular"],
        });
        expect(label.layout["symbol-placement"]).toBeUndefined();
        expect(label.paint["text-halo-color"]).toBe(
          tokenValues.dataMarker.halo,
        );
        // Normalised zoom 5 is MapLibre zoom 4.
        expect(label.minzoom).toBe(4);
        expect(label.filter).toEqual(["!=", ["get", "label"], ""]);
      });

      it("places a line's label along the line", async () => {
        const { adapter, map } = await ready(POSITRON);
        adapter.setStyledShapes("routes", STYLED_LINES);
        const label = spec(map, "mapcairn:routes:styled-label");
        expect(label.layout["symbol-placement"]).toBe("line");
        expect(label.minzoom).toBeUndefined();
      });

      it("draws none on a raster basemap, which has no glyph source", async () => {
        const { adapter, map } = await ready(STREETS);
        adapter.setStyledShapes("regions", STYLED_AREAS);
        expect(map.glyphs).toBeUndefined();
        expect(idsOf(map, "mapcairn:regions:styled-label")).toEqual([]);
      });

      it("draws none when no symbol layer names a literal font", async () => {
        const { adapter, map } = await ready(POSITRON);
        map.basemapLayers = [
          {
            id: "labels",
            type: "symbol",
            layout: { "text-font": ["get", "font"] },
          },
        ];
        adapter.setStyledShapes("regions", STYLED_AREAS);
        expect(idsOf(map, "mapcairn:regions:styled-label")).toEqual([]);
      });

      it("reads a font given as a literal expression, skipping a layer without one", async () => {
        const { adapter, map } = await ready(POSITRON);
        map.basemapLayers = [
          { id: "road", type: "line" },
          { id: "plain", type: "symbol", layout: {} },
          {
            id: "names",
            type: "symbol",
            layout: { "text-font": ["literal", ["Test Bold"]] },
          },
        ];
        adapter.setStyledShapes("regions", STYLED_AREAS);
        expect(
          spec(map, "mapcairn:regions:styled-label").layout["text-font"],
        ).toEqual(["Test Bold"]);
      });

      it("draws none when no shape has a label", async () => {
        const { adapter, map } = await ready(POSITRON);
        adapter.setStyledShapes("regions", {
          ...STYLED_AREAS,
          shapes: [{ id: "south", geometry: polygon(4), look: LOOK }],
        });
        expect(idsOf(map, "mapcairn:regions:styled-label")).toEqual([]);
      });
    });
  });

  describe("vector tiles", () => {
    it("keeps the source's zoom limits as tile levels", async () => {
      const { adapter, map } = await ready();
      adapter.setVectorLayer("districts", VECTOR);
      expect(map.sources.get("mapcairn:districts")).toEqual({
        type: "vector",
        tiles: ["https://vector.test/{z}/{x}/{y}.pbf"],
        minzoom: 0,
        maxzoom: 14,
      });
    });

    it("converts the layer windows to engine zoom, using the narrower of each", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", VECTOR);
      // The whole layer shows from normalised zoom 3 to 17: engine 2 to 16.
      expect(spec(map, "mapcairn:districts:v0-fill")).toMatchObject({
        "source-layer": "areas",
        minzoom: 2,
        maxzoom: 16,
      });
      // The source layer's own minimum of 5 is narrower: engine 4.
      expect(spec(map, "mapcairn:districts:v1-line-solid")).toMatchObject({
        "source-layer": "borders",
        minzoom: 4,
        maxzoom: 16,
      });
    });

    it("compiles a category rule into a match with a fallback", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", VECTOR);
      expect(
        spec(map, "mapcairn:districts:v0-fill").paint["fill-color"],
      ).toEqual(["match", ["get", "kind"], "park", "#0072b2", "#e69f00"]);
    });

    it("compiles a steps rule into a step on the number, the first look below the second minimum", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", VECTOR);
      const line = spec(map, "mapcairn:districts:v1-line-solid");
      expect(line.paint["line-width"]).toEqual([
        "step",
        ["to-number", ["get", "rank"], 0],
        1.5,
        5,
        3,
      ]);
      expect(line.filter).toEqual([
        "all",
        [
          "match",
          ["geometry-type"],
          ["LineString", "MultiLineString"],
          true,
          false,
        ],
        [
          "==",
          ["step", ["to-number", ["get", "rank"], 0], "solid", 5, "dashed"],
          "solid",
        ],
      ]);
    });

    it("hatches by the compiled pattern and keeps solid features out of the pattern layer", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", VECTOR);
      const compiled = ["match", ["get", "kind"], "park", "stripes", "solid"];
      const pattern = spec(map, "mapcairn:districts:v0-pattern");
      expect(pattern.paint["fill-pattern"]).toEqual([
        "concat",
        "mapcairn-pattern:",
        compiled,
      ]);
      expect(pattern.filter).toEqual([
        "all",
        ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
        ["!=", compiled, "solid"],
      ]);
      expect(map.hasImage("mapcairn-pattern:stripes")).toBe(true);
    });

    it("skips the pattern and dash filters when a fixed look needs none", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", {
        source: TILE_SOURCE,
        layers: [
          {
            sourceLayer: "areas",
            geometry: "area",
            rule: { kind: "fixed", look: { ...LOOK, dash: "dotted" } },
          },
          {
            sourceLayer: "lines",
            geometry: "line",
            rule: {
              kind: "fixed",
              look: { ...LOOK, pattern: "crosshatch" },
            },
          },
        ],
      });
      expect(idsOf(map, "mapcairn:districts:v0-")).toEqual([
        "mapcairn:districts:v0-fill",
        "mapcairn:districts:v0-outline-dotted",
      ]);
      expect(spec(map, "mapcairn:districts:v0-fill").paint["fill-color"]).toBe(
        "#0072b2",
      );
      expect(idsOf(map, "mapcairn:districts:v1-")).toEqual([
        "mapcairn:districts:v1-casing-solid",
        "mapcairn:districts:v1-line-solid",
      ]);
      expect(spec(map, "mapcairn:districts:v0-fill").minzoom).toBeUndefined();
    });

    it("draws a pattern for a fixed look that has one, without a filter on it", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", {
        source: TILE_SOURCE,
        layers: [
          {
            sourceLayer: "areas",
            geometry: "area",
            rule: { kind: "fixed", look: { ...LOOK, pattern: "crosshatch" } },
          },
        ],
      });
      const pattern = spec(map, "mapcairn:districts:v0-pattern");
      expect(pattern.paint["fill-pattern"]).toBe("mapcairn-pattern:crosshatch");
      // No pattern condition, only the guard that keeps other geometry out.
      expect(pattern.filter).toEqual([
        "match",
        ["geometry-type"],
        ["Polygon", "MultiPolygon"],
        true,
        false,
      ]);
    });

    it("draws labels from a property on a vector basemap only", async () => {
      const vector = await ready(POSITRON);
      vector.adapter.setVectorLayer("districts", VECTOR);
      const label = spec(vector.map, "mapcairn:districts:v0-label");
      expect(label.layout["text-field"]).toEqual([
        "to-string",
        ["get", "name"],
      ]);
      // The label's own minimum of 8 beats the layer's 3: engine 7.
      expect(label.minzoom).toBe(7);
      expect(label.maxzoom).toBe(16);
      expect(idsOf(vector.map, "mapcairn:districts:v1-label")).toEqual([]);

      const raster = await ready(STREETS);
      raster.adapter.setVectorLayer("districts", VECTOR);
      expect(idsOf(raster.map, "mapcairn:districts:v0-label")).toEqual([]);
    });

    it("leaves out a source layer with a step rule that has no steps", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setVectorLayer("districts", {
        source: TILE_SOURCE,
        layers: [
          {
            sourceLayer: "empty",
            geometry: "area",
            rule: { kind: "steps", field: "rank", steps: [] },
          },
        ],
      });
      expect(layerIds(map)).toEqual([]);
      expect(map.sources.has("mapcairn:districts")).toBe(true);
    });

    it("is not tappable", async () => {
      const { adapter, map } = await ready();
      adapter.setVectorLayer("districts", VECTOR);
      expect(adapter.featuresAt({ x: 10, y: 10 })).toEqual([]);
      expect(map.callsOf("queryRenderedFeatures")).toEqual([]);
    });
  });

  describe("heatmaps", () => {
    it("draws loaded points as a weighted GeoJSON source", async () => {
      const { adapter, map } = await ready();
      adapter.setHeatmapLayer("density", HEAT_POINTS);
      const { data } = map.sources.get("mapcairn:density") as Spec;
      expect(data.features.map((f: Spec) => f.properties)).toEqual([
        { weight: 3 },
        { weight: 1 },
      ]);
      expect(data.features[0].geometry.coordinates).toEqual([2.35, 48.86]);
      const heat = spec(map, "mapcairn:density:heat");
      expect(heat.type).toBe("heatmap");
      expect(heat.paint).toMatchObject({
        "heatmap-weight": ["get", "weight"],
        "heatmap-radius": 20,
        "heatmap-intensity": 1.5,
        "heatmap-opacity": 0.8,
      });
    });

    it("ramps the colour from clear at no density to the last colour at full density", async () => {
      const { adapter, map } = await ready();
      adapter.setHeatmapLayer("density", HEAT_POINTS);
      expect(spec(map, "mapcairn:density:heat").paint["heatmap-color"]).toEqual(
        [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(68, 1, 84, 0)",
          1 / 3,
          "rgba(68, 1, 84, 1)",
          2 / 3,
          "rgba(33, 145, 140, 1)",
          1,
          "rgba(253, 231, 37, 1)",
        ],
      );
    });

    it("draws a vector source layer weighted by a field, with zoom windows converted", async () => {
      const { adapter, map } = await ready();
      adapter.setHeatmapLayer("events", HEAT_VECTOR);
      expect(map.sources.get("mapcairn:events")).toMatchObject({
        type: "vector",
        minzoom: 0,
        maxzoom: 14,
      });
      expect(spec(map, "mapcairn:events:heat")).toMatchObject({
        "source-layer": "events",
        minzoom: 5,
        maxzoom: 11,
      });
      expect(spec(map, "mapcairn:events:heat").paint["heatmap-weight"]).toEqual(
        ["to-number", ["get", "size"], 1],
      );
    });

    it("counts each vector point once without a weight field", async () => {
      const { adapter, map } = await ready();
      adapter.setHeatmapLayer("events", {
        ...HEAT_VECTOR,
        source: {
          kind: "vector",
          source: TILE_SOURCE,
          sourceLayer: "events",
        },
      });
      const heat = spec(map, "mapcairn:events:heat");
      expect(heat.paint["heatmap-weight"]).toBe(1);
      expect(heat.minzoom).toBeUndefined();
    });

    it("is not tappable", async () => {
      const { adapter, map } = await ready();
      adapter.setHeatmapLayer("density", HEAT_POINTS);
      expect(adapter.featuresAt({ x: 10, y: 10 })).toEqual([]);
      expect(map.callsOf("queryRenderedFeatures")).toEqual([]);
    });
  });

  describe("stacking and lifetime", () => {
    const point = {
      id: "a",
      position: { lat: 48.86, lng: 2.35 },
      colour: "#e69f00",
      radius: 6,
      shape: "circle" as const,
    };

    it("stacks tiles, vector, styled, shapes, heatmaps and points bottom to top", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setFeatureLayer("pts", [point]);
      adapter.setHeatmapLayer("heat", HEAT_POINTS);
      adapter.setShapeLayer("area", {
        geometries: [polygon(1)],
        colour: "#d55e00",
      });
      adapter.setStyledShapes("regions", STYLED_AREAS);
      adapter.setVectorLayer("districts", VECTOR);
      adapter.setTileLayer("imagery", {
        tiles: "https://t.test/{z}/{x}/{y}.png",
        tileSize: 256,
        maxzoom: 9,
        opacity: 1,
      });
      const order = layerIds(map).map((id) => String(id).split(":")[1]);
      const firstOf = (name: string) => order.indexOf(name);
      const lastOf = (name: string) => order.lastIndexOf(name);
      expect(lastOf("imagery")).toBeLessThan(firstOf("districts"));
      expect(lastOf("districts")).toBeLessThan(firstOf("regions"));
      expect(lastOf("regions")).toBeLessThan(firstOf("area"));
      expect(lastOf("area")).toBeLessThan(firstOf("heat"));
      expect(lastOf("heat")).toBeLessThan(firstOf("pts"));
    });

    it("removes every engine layer and the source of a layer that owns many", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      adapter.setStyledShapes("other", STYLED_AREAS);
      adapter.removeLayer("regions");
      expect(idsOf(map, "mapcairn:regions:")).toEqual([]);
      expect(map.sources.has("mapcairn:regions")).toBe(false);
      expect(idsOf(map, "mapcairn:other:")).toHaveLength(5);
    });

    it("replaces a layer with another kind under the same id", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("x", STYLED_AREAS);
      adapter.setHeatmapLayer("x", HEAT_POINTS);
      expect(layerIds(map)).toEqual(["mapcairn:x:heat"]);
    });

    it("draws layers set before mount once the first style loads", async () => {
      const adapter = new MapLibreMapAdapter();
      adapter.setStyledShapes("regions", STYLED_AREAS);
      adapter.setVectorLayer("districts", VECTOR);
      adapter.setHeatmapLayer("density", HEAT_POINTS);
      const { map } = await mounted({ basemap: POSITRON }, adapter);
      expect(layerIds(map)).toEqual([]);
      map.fire("style.load");
      expect(idsOf(map, "mapcairn:districts:").length).toBeGreaterThan(0);
      expect(idsOf(map, "mapcairn:regions:").length).toBeGreaterThan(0);
      expect(idsOf(map, "mapcairn:density:")).toEqual([
        "mapcairn:density:heat",
      ]);
    });

    it("draws them all again, images included, after a basemap swap", async () => {
      const { adapter, map } = await ready(STREETS);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      adapter.setVectorLayer("districts", VECTOR);
      adapter.setHeatmapLayer("density", HEAT_POINTS);
      const before = layerIds(map);
      void adapter.setBasemap(POSITRON);
      expect(layerIds(map)).toEqual([]);
      expect(map.images.size).toBe(0);
      map.fire("style.load");
      expect(map.hasImage("mapcairn-pattern:dots")).toBe(true);
      // The new basemap has glyphs, so the labels join the layers that were there.
      expect(layerIds(map)).toEqual(expect.arrayContaining(before as string[]));
      expect(idsOf(map, "mapcairn:regions:styled-label")).toHaveLength(1);
    });

    it("reads the label font again for the new style after a swap", async () => {
      const { adapter, map } = await ready(POSITRON);
      adapter.setStyledShapes("regions", STYLED_AREAS);
      expect(idsOf(map, "mapcairn:regions:styled-label")).toHaveLength(1);
      void adapter.setBasemap(STREETS);
      map.fire("style.load");
      expect(idsOf(map, "mapcairn:regions:styled-label")).toEqual([]);
    });
  });

  describe("tap hits", () => {
    const point = {
      id: "a",
      position: { lat: 48.86, lng: 2.35 },
      colour: "#e69f00",
      radius: 6,
      shape: "circle" as const,
    };

    async function withAll() {
      const subject = await ready(STREETS);
      subject.adapter.setFeatureLayer("pts", [point]);
      subject.adapter.setStyledShapes("regions", STYLED_AREAS);
      subject.adapter.setStyledShapes("routes", STYLED_LINES);
      subject.adapter.setVectorLayer("districts", VECTOR);
      return subject;
    }

    it("queries points and lines within a fingertip and polygons at the exact point, in that order", async () => {
      const { adapter, map } = await withAll();
      adapter.featuresAt({ x: 50, y: 40 });
      const box = [
        [34, 24],
        [66, 56],
      ];
      expect(
        map.callsOf("queryRenderedFeatures").map((call) => call.args),
      ).toEqual([
        [box, { layers: ["mapcairn:pts:points"] }],
        [
          box,
          {
            layers: [
              "mapcairn:routes:styled-line-solid",
              "mapcairn:routes:styled-line-dashed",
              "mapcairn:routes:styled-line-dotted",
            ],
          },
        ],
        [[50, 40], { layers: ["mapcairn:regions:styled-fill"] }],
      ]);
    });

    it("returns points, then lines, then polygons, each feature once", async () => {
      const { adapter, map } = await withAll();
      simulateFeatureHits(map, [
        { layerId: "regions", featureId: "north" },
        { layerId: "routes", featureId: "main" },
        { layerId: "pts", featureId: "a" },
        { layerId: "pts", featureId: "a" },
      ]);
      // A tile edge repeats a feature: the same hit twice in one query.
      const [first] = map.features as Spec[];
      map.features = [...map.features, { ...first }];
      expect(adapter.featuresAt({ x: 1, y: 1 })).toEqual([
        { layerId: "pts", featureId: "a" },
        { layerId: "routes", featureId: "main" },
        { layerId: "regions", featureId: "north" },
      ]);
    });

    it("tells the same feature id on two layers apart", async () => {
      const { adapter, map } = await withAll();
      adapter.setStyledShapes("others", STYLED_AREAS);
      simulateFeatureHits(map, [
        { layerId: "regions", featureId: "north" },
        { layerId: "others", featureId: "north" },
      ]);
      expect(adapter.featuresAt({ x: 1, y: 1 })).toEqual([
        { layerId: "regions", featureId: "north" },
        { layerId: "others", featureId: "north" },
      ]);
    });

    it("emits the topmost hit with the whole list on a tap, then the click", async () => {
      const { adapter, map } = await withAll();
      const order: string[] = [];
      const tap = vi.fn(() => order.push("featureTap"));
      adapter.on("featureTap", tap);
      adapter.on("click", () => order.push("click"));
      simulateFeatureHits(map, [
        { layerId: "pts", featureId: "a" },
        { layerId: "regions", featureId: "south" },
      ]);
      expect(tap).toHaveBeenCalledWith({
        layerId: "pts",
        featureId: "a",
        hits: [
          { layerId: "pts", featureId: "a" },
          { layerId: "regions", featureId: "south" },
        ],
      });
      expect(order).toEqual(["featureTap", "click"]);
    });

    it("finds nothing when the style is not ready or the query throws", async () => {
      const { adapter, map } = await withAll();
      map.queryError = new Error("style not loaded");
      expect(adapter.featuresAt({ x: 1, y: 1 })).toEqual([]);
      map.queryError = undefined;
      const unmounted = new MapLibreMapAdapter();
      expect(unmounted.featuresAt({ x: 1, y: 1 })).toEqual([]);
      void adapter.setBasemap(DARK);
      expect(adapter.featuresAt({ x: 1, y: 1 })).toEqual([]);
    });
  });

  describe("getBounds", () => {
    it("reports the box the engine shows", async () => {
      const { adapter } = await ready();
      const { west, south, east, north } = adapter.getBounds();
      expect(west).toBeLessThan(MOUNT.view.center.lng);
      expect(east).toBeGreaterThan(MOUNT.view.center.lng);
      expect(south).toBeLessThan(MOUNT.view.center.lat);
      expect(north).toBeGreaterThan(MOUNT.view.center.lat);
    });

    it("covers the whole world before the map is mounted", () => {
      const bounds = new MapLibreMapAdapter().getBounds();
      expect(bounds.west).toBe(-180);
      expect(bounds.east).toBe(180);
      expect(bounds.south).toBeLessThan(-80);
      expect(bounds.north).toBeGreaterThan(80);
    });
  });

  describe("toImage", () => {
    it("refuses while a basemap swap is still loading, and works again once it has loaded", async () => {
      const { adapter, map } = await ready();
      const swapping = adapter.setBasemap(DARK);
      await expect(adapter.toImage()).rejects.toMatchObject({
        reason: "export-failed",
      });
      map.fire("style.load");
      await swapping;
      const image = await adapter.toImage();
      expect(image.type).toBe("image/png");
    });

    it("refuses when a swap starts between the repaint and the render", async () => {
      const { adapter, map } = await ready();
      map.rendersOnRepaint = false;
      const image = adapter.toImage();
      await vi.waitFor(() => {
        expect(map.callsOf("triggerRepaint")).toHaveLength(1);
      });
      void adapter.setBasemap(DARK);
      const refused = expect(image).rejects.toMatchObject({
        reason: "export-failed",
      });
      map.fire("render");
      await refused;
      expect(canvasStub.contexts).toEqual([]);
    });

    it("never asks the engine to keep its drawing buffer", async () => {
      const { adapter, map } = await ready();
      await adapter.toImage();
      expect(map.options).not.toHaveProperty("preserveDrawingBuffer");
      expect(JSON.stringify(map.options)).not.toContain(
        "preserveDrawingBuffer",
      );
    });

    it("repaints, copies the canvas inside the render event, and encodes a PNG", async () => {
      const { adapter, map } = await ready();
      map.rendersOnRepaint = false;
      const image = adapter.toImage();
      await vi.waitFor(() => {
        expect(map.callsOf("triggerRepaint")).toHaveLength(1);
      });
      // Nothing is copied until the engine has drawn the frame.
      expect(canvasStub.contexts).toEqual([]);
      map.fire("render");
      expect(canvasStub.contexts).toHaveLength(1);
      expect(canvasStub.contexts[0]?.calls[0]).toMatchObject({
        method: "drawImage",
        args: [map.getCanvas(), 0, 0],
      });
      const blob = await image;
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBeGreaterThan(0);
    });

    it("copies at the map canvas's pixel size", async () => {
      const { adapter, map } = await ready();
      map.getCanvas().width = 1600;
      map.getCanvas().height = 1200;
      await adapter.toImage();
      const copy = canvasStub.contexts[0]?.canvas;
      expect([copy?.width, copy?.height]).toEqual([1600, 1200]);
    });

    it("draws the credit text on a strip along the bottom edge, scaled to the screen", async () => {
      const { adapter, map } = await ready();
      const canvas = map.getCanvas();
      canvas.width = 1600;
      canvas.height = 1200;
      Object.defineProperty(canvas, "clientWidth", { value: 800 });
      await adapter.toImage({ attribution: "© Example contributors" });
      const { calls } = canvasStub.contexts[0] as { calls: Spec[] };
      const strip = calls.find((call) => call.method === "fillRect");
      const [x, y, width, height] = (strip?.args ?? []) as [
        number,
        number,
        number,
        number,
      ];
      // The canvas has twice the CSS pixels: 22 px of text and 8 px of padding each side.
      expect([x, width, height]).toEqual([0, 1600, 38]);
      expect(y + height).toBe(1200);
      const text = calls.find((call) => call.method === "fillText");
      expect(text?.args[0]).toBe("© Example contributors");
      const context = canvasStub.contexts[0];
      expect(context?.font).toMatch(/^22px /);
    });

    it("draws the strip with tokens, and shrinks a word that does not fit", async () => {
      const { adapter, map } = await ready();
      map.getCanvas().width = 100;
      await adapter.toImage({ attribution: "Unbreakable-credit-word-indeed" });
      const context = canvasStub.contexts[0];
      expect(context?.fillStyle).toBe(tokenValues.dataMarker.edge);
      const size = Number.parseFloat(context?.font ?? "");
      expect(size).toBeLessThan(11);
    });

    it("wraps long credit text onto more lines and grows the strip to hold them", async () => {
      const { adapter, map } = await ready();
      // The stub measures 6 px a character, so 100 px holds about 15 characters.
      map.getCanvas().width = 100;
      await adapter.toImage({ attribution: "one two three four five six" });
      const { calls } = canvasStub.contexts[0] as { calls: Spec[] };
      const lines = calls
        .filter((call) => call.method === "fillText")
        .map((call) => call.args[0]);
      expect(lines).toEqual(["one two three", "four five six"]);
      const strip = calls.find((call) => call.method === "fillRect");
      const [, y, , height] = (strip?.args ?? []) as [
        number,
        number,
        number,
        number,
      ];
      // Two lines of 11 px text at 1.2 spacing, plus 4 px of padding each side.
      expect(height).toBeCloseTo(11 + 11 * 1.2 + 8);
      expect(y + height).toBe(map.getCanvas().height);
    });

    describe("drawing", () => {
      const DRAWING = {
        colour: "#1a73c8",
        halo: "#ffffff",
        marks: [
          {
            kind: "path" as const,
            positions: [
              { lat: -26.2, lng: 28.05 },
              { lat: -26.3, lng: 28.15 },
              { lat: -26.25, lng: 28.0 },
            ],
            closed: true,
            fill: true,
            dashed: false,
          },
          {
            kind: "path" as const,
            positions: [
              { lat: -26.2, lng: 28.05 },
              { lat: -26.1, lng: 28.1 },
            ],
            closed: false,
            fill: false,
            dashed: true,
          },
          { kind: "dot" as const, position: { lat: -26.15, lng: 28.07 } },
        ],
      };

      it("draws shapes over the map at the image's scale, before the credits", async () => {
        const { adapter, map } = await ready();
        const canvas = map.getCanvas();
        canvas.width = 1600;
        canvas.height = 1200;
        Object.defineProperty(canvas, "clientWidth", { value: 800 });
        await adapter.toImage({
          drawing: DRAWING,
          attribution: "Credit",
        });
        const { calls } = canvasStub.contexts[0] as { calls: Spec[] };
        const methods = calls.map((call) => call.method);
        expect(methods.filter((method) => method === "fill")).toHaveLength(2);
        expect(methods.filter((method) => method === "stroke")).toHaveLength(
          2 * 2 + 1,
        );
        expect(methods.indexOf("arc")).toBeGreaterThan(-1);
        expect(methods.lastIndexOf("stroke")).toBeLessThan(
          methods.indexOf("fillRect"),
        );
        const first = map.project([28.05, -26.2]);
        const moveTo = calls.find((call) => call.method === "moveTo");
        expect(moveTo?.args).toEqual([first.x * 2, first.y * 2]);
        const dashes = calls
          .filter((call) => call.method === "setLineDash")
          .map((call) => call.args[0]);
        expect(dashes).toContainEqual([16, 16]);
        expect(dashes.at(-1)).toEqual([]);
      });

      it("on a globe, bends a long line along its great circle and leaves out marks beyond the horizon", async () => {
        const { adapter } = await ready();
        adapter.setProjection("globe");
        const { center } = adapter.getView();
        const farSide = { lat: -center.lat, lng: center.lng - 180 };
        const distant = { lat: center.lat + 20, lng: center.lng + 40 };
        await adapter.toImage({
          drawing: {
            ...DRAWING,
            marks: [
              { kind: "dot", position: farSide },
              {
                kind: "path",
                positions: [center, distant],
                closed: false,
                fill: false,
                dashed: false,
              },
              {
                kind: "path",
                positions: [center, distant, farSide],
                closed: true,
                fill: true,
                dashed: false,
              },
            ],
          },
        });
        const { calls } = canvasStub.contexts[0] as { calls: Spec[] };
        const methods = calls.map((call) => call.method);
        expect(methods).not.toContain("arc");
        // The ring reaches over the horizon, so it has no fill.
        expect(methods).not.toContain("fill");
        // A straight segment would be one lineTo per stroke; the curve has many.
        const strokes = methods.filter((method) => method === "stroke").length;
        expect(
          methods.filter((method) => method === "lineTo").length,
        ).toBeGreaterThan(strokes * 4);
      });

      it("draws nothing for an empty drawing, one-position paths or no drawing", async () => {
        const { adapter } = await ready();
        await adapter.toImage({ drawing: { ...DRAWING, marks: [] } });
        await adapter.toImage({
          drawing: {
            ...DRAWING,
            marks: [
              {
                kind: "path",
                positions: [{ lat: 0, lng: 0 }],
                closed: false,
                fill: false,
                dashed: false,
              },
            ],
          },
        });
        await adapter.toImage();
        for (const { calls } of canvasStub.contexts) {
          expect(calls.map((call) => call.method)).not.toContain("stroke");
        }
      });
    });

    it("draws no strip without credit text", async () => {
      const { adapter } = await ready();
      await adapter.toImage();
      await adapter.toImage({ attribution: "   " });
      for (const { calls } of canvasStub.contexts) {
        expect(calls.map((call) => call.method)).toEqual(["drawImage"]);
      }
    });

    it("waits for the map to finish loading before it draws", async () => {
      const { adapter, map } = await ready();
      map.loadedState = false;
      const image = adapter.toImage();
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(map.callsOf("triggerRepaint")).toHaveLength(0);
      map.fire("idle");
      await image;
      expect(map.callsOf("triggerRepaint")).toHaveLength(1);
    });

    it("goes on with what is drawn after three seconds of loading", async () => {
      const { adapter, map } = await ready();
      vi.useFakeTimers();
      map.loadedState = false;
      const image = adapter.toImage();
      await vi.advanceTimersByTimeAsync(IMAGE_WAIT_MS);
      await expect(image).resolves.toBeInstanceOf(Blob);
      expect(map.listenerCount()).toBeGreaterThan(0);
    });

    it("gives up when the map never draws a frame", async () => {
      const { adapter, map } = await ready();
      vi.useFakeTimers();
      map.rendersOnRepaint = false;
      const image = adapter.toImage();
      const failed = expect(image).rejects.toMatchObject({
        name: "MapEngineError",
        reason: "export-failed",
      });
      await vi.advanceTimersByTimeAsync(IMAGE_WAIT_MS);
      await failed;
      // The render listener is gone, so a late frame does nothing.
      map.fire("render");
      expect(canvasStub.contexts).toEqual([]);
    });

    it("rejects with export-failed when the map is not mounted or was destroyed", async () => {
      await expect(new MapLibreMapAdapter().toImage()).rejects.toMatchObject({
        reason: "export-failed",
      });
      const { adapter } = await ready();
      adapter.destroy();
      await expect(adapter.toImage()).rejects.toMatchObject({
        reason: "export-failed",
      });
    });

    it("rejects with export-failed when the browser gives no image", async () => {
      const { adapter } = await ready();
      canvasStub.failNext = true;
      await expect(adapter.toImage()).rejects.toMatchObject({
        name: "MapEngineError",
        reason: "export-failed",
        message: expect.stringContaining("encode"),
      });
    });

    it("says the browser blocked reading the map when the canvas is tainted", async () => {
      const { adapter } = await ready();
      canvasStub.throwNext = new DOMException(
        "The canvas has been tainted",
        "SecurityError",
      );
      const error = await adapter.toImage().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(MapEngineError);
      expect(error).toMatchObject({
        reason: "export-failed",
        message: expect.stringContaining("browser blocked reading the map"),
      });
    });

    it("maps any other failure to export-failed, with its cause", async () => {
      const { adapter } = await ready();
      canvasStub.throwNext = new Error("out of memory");
      await expect(adapter.toImage()).rejects.toMatchObject({
        reason: "export-failed",
        message: expect.stringContaining("out of memory"),
      });
    });

    it("fails when the browser cannot make a canvas to copy onto", async () => {
      const { adapter } = await ready();
      restoreCanvas();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
      await expect(adapter.toImage()).rejects.toMatchObject({
        reason: "export-failed",
      });
    });

    it("waits for the page's fonts before it draws credit text", async () => {
      const { adapter } = await ready();
      let release = () => {};
      const fonts = {
        ready: new Promise<void>((resolve) => {
          release = resolve;
        }),
      };
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: fonts,
      });
      try {
        const image = adapter.toImage({ attribution: "Credit" });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const drawn = () =>
          canvasStub.contexts[0]?.calls.some(
            (call) => call.method === "fillText",
          );
        expect(drawn()).toBe(false);
        release();
        await image;
        expect(drawn()).toBe(true);
      } finally {
        Reflect.deleteProperty(document, "fonts");
      }
    });

    it("still draws when the font set fails", async () => {
      const { adapter } = await ready();
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: { ready: Promise.reject(new Error("no fonts")) },
      });
      try {
        await expect(
          adapter.toImage({ attribution: "Credit" }),
        ).resolves.toBeInstanceOf(Blob);
      } finally {
        Reflect.deleteProperty(document, "fonts");
      }
    });
  });
});
