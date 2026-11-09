import { runMapAdapterContract } from "@karta/core/contracts";
import { afterEach, beforeEach, vi } from "vitest";
import { MapLibreMapAdapter } from "./MapLibreMapAdapter";
import {
  FAKE_VIEWPORT_HEIGHT,
  FAKE_VIEWPORT_WIDTH,
  FakeMapLibreMap,
  vectorBasemap,
} from "./maplibreTestEngine";

// happy-dom has no WebGL, so the contract runs against the scripted engine.
// The same adapter is checked against real MapLibre in Playwright.
vi.mock("maplibre-gl", async () => ({
  Map: (await import("./maplibreTestEngine")).FakeMapLibreMap,
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

runMapAdapterContract("MapLibre", () => ({
  adapter: new MapLibreMapAdapter(),
  controls: {
    host: createHost(),
    hostSize: { width: FAKE_VIEWPORT_WIDTH, height: FAKE_VIEWPORT_HEIGHT },
    basemap: vectorBasemap(),
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
    createFailingMount: () => {
      const error = new Error("WebGL2 is required");
      error.name = "GPUInitializationError";
      FakeMapLibreMap.nextConstructError = error;
      return new MapLibreMapAdapter();
    },
  },
}));
