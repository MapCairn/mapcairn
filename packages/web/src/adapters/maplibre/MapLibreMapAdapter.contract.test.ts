import { runMapAdapterContract } from "@karta/core/contracts";
import { afterEach, beforeEach, vi } from "vitest";
import { dataLayerEngineIds, MapLibreMapAdapter } from "./MapLibreMapAdapter";
import {
  describeDataLayers,
  type EngineFeature,
  FAKE_VIEWPORT_HEIGHT,
  FAKE_VIEWPORT_WIDTH,
  FakeGPUInitializationError,
  FakeMapLibreMap,
  rasterBasemap,
  vectorBasemap,
} from "./maplibreTestEngine";

// happy-dom has no WebGL, so the contract runs against the scripted engine.
// The same adapter is checked against real MapLibre in Playwright.
vi.mock("maplibre-gl", async () => ({
  Map: (await import("./maplibreTestEngine")).FakeMapLibreMap,
  GPUInitializationError: (await import("./maplibreTestEngine"))
    .FakeGPUInitializationError,
  setWorkerUrl: () => {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "mock-maplibre-worker-url",
}));

beforeEach(() => {
  FakeMapLibreMap.reset();
  FakeMapLibreMap.autoLoad = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
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

for (const [name, basemap] of [
  ["MapLibre (vector style)", vectorBasemap],
  ["MapLibre (raster style)", rasterBasemap],
] as const) {
  runMapAdapterContract(name, () => ({
    // No grace period, so `settle` (one macrotask) sees the worker verdict.
    adapter: new MapLibreMapAdapter({ workerFailureGraceMs: 0 }),
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
        latestMap().fire("error", {
          error: new Error("Tile failed"),
          tile: {},
          sourceId: "openmaptiles",
        });
      },
      simulateLoading: (loading) => {
        latestMap().fire(loading ? "dataloading" : "idle");
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
        const map = latestMap();
        const ids = dataLayerEngineIds(layerId);
        const source = map.sources.get(ids.source);
        const features = map.getLayer(ids.points)
          ? ((source?.data as { features?: EngineFeature[] })?.features ?? [])
          : [];
        const hit = features.find(
          (feature) => feature.properties["karta:id"] === featureId,
        );
        map.features = hit ? [{ layer: { id: ids.points }, ...hit }] : [];
        const [lng, lat] = hit?.geometry.coordinates ?? [0, 0];
        map.fire("click", {
          lngLat: { lng, lat },
          point: map.project([lng, lat]),
        });
      },
      drawnLayers: () => describeDataLayers(latestMap()),
      createFailingMount: () => {
        FakeMapLibreMap.nextConstructError = new FakeGPUInitializationError();
        return new MapLibreMapAdapter();
      },
      failNextBasemap: () => {
        FakeMapLibreMap.nextStyleError = new Error("Style 404");
      },
    },
  }));
}
