// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { runMapAdapterContract } from "@mapcairn/core/contracts";
import { afterEach, beforeEach, vi } from "vitest";
import { MapLibreMapAdapter } from "./MapLibreMapAdapter";
import {
  canvasStub,
  describeDataLayers,
  FAKE_VIEWPORT_HEIGHT,
  FAKE_VIEWPORT_WIDTH,
  FakeGPUInitializationError,
  FakeMapLibreMap,
  rasterBasemap,
  simulateFeatureHits,
  vectorBasemap,
} from "./maplibreTestEngine";

// happy-dom has no WebGL, so the contract runs against the scripted engine.
// The same adapter is checked against real MapLibre in Playwright.
/** The adapter's wait before it calls a tile layer slow, short so the contract does not sleep for the real one. */
const SLOW_WAIT_MS = 20;

vi.mock("maplibre-gl", async () => ({
  Map: (await import("./maplibreTestEngine")).FakeMapLibreMap,
  GPUInitializationError: (await import("./maplibreTestEngine"))
    .FakeGPUInitializationError,
  LngLat: (await import("./maplibreTestEngine")).FakeLngLat,
  setWorkerUrl: () => {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "mock-maplibre-worker-url",
}));

let restoreCanvas = () => {};

beforeEach(() => {
  FakeMapLibreMap.reset();
  FakeMapLibreMap.autoLoad = true;
  restoreCanvas = canvasStub.install();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  restoreCanvas();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createHost(): HTMLDivElement {
  const host = document.createElement("div");
  host.tabIndex = 0;
  host.getBoundingClientRect = () =>
    DOMRect.fromRect({
      width: FAKE_VIEWPORT_WIDTH,
      height: FAKE_VIEWPORT_HEIGHT,
    });
  // The size an engine reads for the map: the layout size, whole pixels.
  Object.defineProperty(host, "clientWidth", { value: FAKE_VIEWPORT_WIDTH });
  Object.defineProperty(host, "clientHeight", { value: FAKE_VIEWPORT_HEIGHT });
  document.body.append(host);
  return host;
}

function latestMap(): FakeMapLibreMap {
  const map = FakeMapLibreMap.instances.at(-1);
  if (!map) {
    throw new Error("No map was constructed.");
  }
  return map;
}

/** Fires a MapLibre mouse or touch event at a position, the way the engine hands it to listeners. */
function firePointer(
  type:
    | "mousedown"
    | "mousemove"
    | "mouseup"
    | "touchstart"
    | "touchmove"
    | "touchend",
  latlng: { lat: number; lng: number },
): void {
  const map = latestMap();
  const point = map.project([latlng.lng, latlng.lat]);
  map.fire(type, {
    lngLat: latlng,
    point,
    points: type.startsWith("touch") ? [point] : [],
    preventDefault: () => {},
  });
}

for (const [name, basemap] of [
  ["MapLibre (vector style)", vectorBasemap],
  ["MapLibre (raster style)", rasterBasemap],
] as const) {
  runMapAdapterContract(name, () => {
    FakeMapLibreMap.styleSourceIds = ["openmaptiles"];
    return {
      // No grace period, so `settle` (one macrotask) sees the worker verdict.
      adapter: new MapLibreMapAdapter({
        workerFailureGraceMs: 0,
        imageTilesWaitMs: 20,
        tileLayerSlowMs: SLOW_WAIT_MS,
      }),
      controls: {
        host: createHost(),
        hostSize: { width: FAKE_VIEWPORT_WIDTH, height: FAKE_VIEWPORT_HEIGHT },
        basemap: basemap(),
        settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
        simulateClick: (latlng) => {
          const map = latestMap();
          map.fire("click", {
            lngLat: latlng,
            point: map.project([latlng.lng, latlng.lat]),
          });
        },
        simulateTileError: () => {
          // The engine tags a tile error with the source's own loaded state,
          // read from its tile manager; an errored tile leaves the source
          // loaded, so the failure does not put the map back to busy.
          latestMap().fire("error", {
            error: new Error("Tile failed"),
            tile: {},
            sourceId: "openmaptiles",
          });
        },
        simulateBasemapUnavailable: () => {
          const map = latestMap();
          map.fire("style.load");
          map.fire("error", {
            error: new Error("Tile failed"),
            tile: {},
            sourceId: "basemap",
          });
          map.fire("idle");
        },
        simulateTileLayerFailure: (layerId) => {
          const map = latestMap();
          map.fire("sourcedataloading", {
            sourceId: `mapcairn:${layerId}`,
            tile: {},
          });
          map.fire("idle");
        },
        simulateTileLayerSlow: async (layerId) => {
          latestMap().fire("sourcedataloading", {
            sourceId: `mapcairn:${layerId}`,
            tile: {},
          });
          await new Promise((resolve) => setTimeout(resolve, SLOW_WAIT_MS * 2));
        },
        simulateTileLayerRecovery: (layerId) => {
          latestMap().fire("sourcedata", {
            sourceId: `mapcairn:${layerId}`,
            tile: {},
          });
        },
        simulateLoading: (loading) => {
          // One of the basemap's own sources has a tile start or settle; the
          // adapter asks the engine whether the source is in.
          const map = latestMap();
          if (loading) {
            map.unloadedSources.add("openmaptiles");
          } else {
            map.unloadedSources.delete("openmaptiles");
          }
          map.fire(loading ? "sourcedataloading" : "sourcedata", {
            tile: {},
            sourceId: "openmaptiles",
          });
        },
        simulateUserZoom: (zoom) => {
          // MapLibre zooms by 512 px tiles: one level below the normalised zoom.
          latestMap().gesture({ zoom: zoom - 1 }, new WheelEvent("wheel"));
        },
        simulateFatalError: () => {
          // The exact event maplibre-gl 6.17 fires when a worker fails
          // (createActors in src/util/actor.ts): no tile and no source. A dead
          // worker leaves tiles loading, so the map never reports loaded.
          const map = latestMap();
          map.loadedState = false;
          map.fire("error", {
            error: new Error(
              "Worker failed to load. Check that the worker URL is correct.",
            ),
          });
        },
        simulateFeatureTap: (layerId, featureId) => {
          simulateFeatureHits(latestMap(), [{ layerId, featureId }]);
        },
        simulateFeatureHits: (hits) => {
          simulateFeatureHits(latestMap(), hits);
        },
        failNextImage: () => {
          canvasStub.failNext = true;
        },
        stallNextImageTiles: () => {
          FakeMapLibreMap.holdIdle = true;
        },
        pointerDown: (latlng, pointer = "mouse") =>
          firePointer(pointer === "touch" ? "touchstart" : "mousedown", latlng),
        pointerMove: (latlng, pointer = "mouse") =>
          firePointer(pointer === "touch" ? "touchmove" : "mousemove", latlng),
        pointerUp: (latlng, pointer = "mouse") =>
          firePointer(pointer === "touch" ? "touchend" : "mouseup", latlng),
        drawnLayers: () => describeDataLayers(latestMap()),
        createFailingMount: () => {
          FakeMapLibreMap.nextConstructError = new FakeGPUInitializationError();
          return new MapLibreMapAdapter();
        },
        failNextBasemap: () => {
          FakeMapLibreMap.nextStyleError = new Error("Style 404");
        },
      },
    };
  });
}
