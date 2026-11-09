import type { BasemapDefinition, MapMountOptions } from "@karta/core";
import { MapEngineError, metresPerPixel } from "@karta/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_VIEWPORT_HEIGHT,
  FAKE_VIEWPORT_WIDTH,
  FakeMapLibreMap,
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
  setWorkerUrl: engine.setWorkerUrl,
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "mock-maplibre-worker-url",
}));

import {
  createMapLibreMapAdapter,
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
          { layers: ["karta:quakes:points"] },
        ]);
        expect(taps).not.toHaveBeenCalled();
      });

      it("adds one marker image per shape, colour and radius", async () => {
        const { map } = await withPoints();
        expect([...map.images.keys()]).toEqual([
          "karta-marker:square:#e69f00:6",
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
          { layer: { id: "karta:quakes:points" }, properties: {} },
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
            coordinates: [
              [0, 0],
              [1, 1],
            ],
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
        expect(width("karta:plain:line")).toBe(2);
        expect(width("karta:wide:line")).toBe(6);
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
        ).toEqual([["karta:imagery:tiles", "raster-opacity", 0.5]]);
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
        expect.arrayContaining(["karta:quakes:points", "karta:imagery:tiles"]),
      );
      const full = adapter.setBasemap(WITH_RELIEF, { saveData: false });
      loadReliefStyle(map);
      await full;
      expect(layerIds(map)).toContain("relief");
      expect(layerIds(map)).toEqual(
        expect.arrayContaining(["karta:quakes:points", "karta:imagery:tiles"]),
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
