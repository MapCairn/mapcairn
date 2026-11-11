import { afterEach, describe, expect, it, vi } from "vitest";

/** The adapter module is large, so its first import can outlast the default test timeout. */
const ADAPTER_IMPORT_TIMEOUT_MS = 30_000;

const setWorkerUrl = vi.fn();
const engine = { failNext: false };

vi.mock("maplibre-gl", () => ({
  default: {},
  setWorkerUrl: (url: string) => {
    if (engine.failNext) {
      engine.failNext = false;
      throw new Error("chunk failed to load");
    }
    setWorkerUrl(url);
  },
  Map: class {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "/assets/maplibre-gl-worker-HASH.js",
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

afterEach(() => {
  setWorkerUrl.mockClear();
  engine.failNext = false;
  vi.resetModules();
});

/** Lets the dynamic imports and their `then` settle. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * The app asks for the engine while its chrome renders, so the download runs
 * alongside that work instead of starting once the map mounts after it.
 */
describe("MapLibre adapter factory", () => {
  it(
    "builds a fresh MapLibre adapter on every call",
    async () => {
      const { createMapLibreMapAdapterFactory, MapLibreMapAdapter } =
        await import("./MapLibreMapAdapter");
      const factory = createMapLibreMapAdapterFactory();

      const first = factory();

      expect(first).toBeInstanceOf(MapLibreMapAdapter);
      expect(factory()).not.toBe(first);
    },
    ADAPTER_IMPORT_TIMEOUT_MS,
  );

  it(
    "starts loading the engine on preload, and a mount reuses that load",
    async () => {
      const { createMapLibreMapAdapterFactory, loadEngine } = await import(
        "./MapLibreMapAdapter"
      );
      const factory = createMapLibreMapAdapterFactory({
        workerCacheKey: "1234abcd",
      });

      factory.preload?.();
      factory.preload?.();
      await settle();
      await loadEngine("1234abcd");

      expect(setWorkerUrl).toHaveBeenCalledOnce();
      expect(setWorkerUrl).toHaveBeenCalledWith(
        "/assets/maplibre-gl-worker-HASH.js?v=1234abcd",
      );
    },
    ADAPTER_IMPORT_TIMEOUT_MS,
  );

  it(
    "swallows a failed preload, so the mount loads the engine again",
    async () => {
      const { createMapLibreMapAdapterFactory, loadEngine } = await import(
        "./MapLibreMapAdapter"
      );
      const factory = createMapLibreMapAdapterFactory();
      engine.failNext = true;

      expect(factory.preload?.()).toBeUndefined();
      await settle();
      await loadEngine(undefined);

      expect(setWorkerUrl).toHaveBeenCalledOnce();
    },
    ADAPTER_IMPORT_TIMEOUT_MS,
  );
});
