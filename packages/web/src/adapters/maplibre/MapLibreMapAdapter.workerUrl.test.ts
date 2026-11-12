// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";

/** The adapter module is large, so its first import can outlast the default test timeout. */
const ADAPTER_IMPORT_TIMEOUT_MS = 30_000;

const setWorkerUrl = vi.fn();

vi.mock("maplibre-gl", () => ({
  default: {},
  setWorkerUrl,
  Map: class {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "/assets/maplibre-gl-worker-HASH.js",
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

afterEach(() => {
  setWorkerUrl.mockClear();
  vi.resetModules();
});

/**
 * A worker script takes its Content Security Policy from its own response
 * headers, and an immutable cached copy keeps the policy of the day it was
 * fetched. A new URL is the only way a changed policy reaches a device that
 * already has the file.
 */
describe("MapLibre worker URL", () => {
  it(
    "tells the engine the worker URL with the cache key added",
    async () => {
      const { loadEngine } = await import("./MapLibreMapAdapter");

      await loadEngine("1234abcd");

      expect(setWorkerUrl).toHaveBeenCalledWith(
        "/assets/maplibre-gl-worker-HASH.js?v=1234abcd",
      );
    },
    ADAPTER_IMPORT_TIMEOUT_MS,
  );

  it(
    "leaves the worker URL as it is when no cache key is given",
    async () => {
      const { loadEngine } = await import("./MapLibreMapAdapter");

      await loadEngine(undefined);

      expect(setWorkerUrl).toHaveBeenCalledWith(
        "/assets/maplibre-gl-worker-HASH.js",
      );
    },
    ADAPTER_IMPORT_TIMEOUT_MS,
  );
});
