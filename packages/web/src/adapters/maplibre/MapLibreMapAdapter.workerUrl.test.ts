// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, describe, expect, it, vi } from "vitest";

/** The engine loader pulls in the engine's stylesheet, so its first import can outlast the default test timeout. */
const LOADER_IMPORT_TIMEOUT_MS = 30_000;

const setWorkerUrl = vi.fn();

vi.mock("maplibre-gl", () => ({
  default: {},
  setWorkerUrl,
  Map: class {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

afterEach(() => {
  setWorkerUrl.mockReset();
  vi.resetModules();
});

/**
 * The host knows where it serves the engine's worker from, and how to keep a
 * cached copy from outliving the policy it was fetched under, so the adapter
 * only passes on the address it is given.
 */
describe("the engine's worker URL", () => {
  it(
    "tells the engine the URL the host's loader resolves to",
    async () => {
      const { loadEngine } = await import("./engineLoader");

      await loadEngine(async () => "/assets/worker.js?v=1234abcd");

      expect(setWorkerUrl).toHaveBeenCalledExactlyOnceWith(
        "/assets/worker.js?v=1234abcd",
      );
    },
    LOADER_IMPORT_TIMEOUT_MS,
  );

  it(
    "tells the engine before it hands the engine back, so no map can exist without it",
    async () => {
      const { loadEngine } = await import("./engineLoader");
      const order: string[] = [];
      setWorkerUrl.mockImplementation(() => {
        order.push("setWorkerUrl");
      });

      await loadEngine(async () => "/worker.js");
      order.push("loaded");

      expect(order).toEqual(["setWorkerUrl", "loaded"]);
    },
    LOADER_IMPORT_TIMEOUT_MS,
  );

  it(
    "loads the engine once however many callers ask",
    async () => {
      const { loadEngine } = await import("./engineLoader");
      const loadWorkerUrl = vi.fn(async () => "/worker.js");

      const [first, second] = await Promise.all([
        loadEngine(loadWorkerUrl),
        loadEngine(loadWorkerUrl),
      ]);

      expect(first).toBe(second);
      expect(loadWorkerUrl).toHaveBeenCalledOnce();
      expect(setWorkerUrl).toHaveBeenCalledOnce();
    },
    LOADER_IMPORT_TIMEOUT_MS,
  );

  it(
    "rejects when the loader rejects, sets no URL, and asks the loader again next time",
    async () => {
      const { loadEngine } = await import("./engineLoader");
      const loadWorkerUrl = vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("worker chunk failed"))
        .mockResolvedValueOnce("/worker.js");

      await expect(loadEngine(loadWorkerUrl)).rejects.toThrow(
        "worker chunk failed",
      );
      expect(setWorkerUrl).not.toHaveBeenCalled();

      await loadEngine(loadWorkerUrl);

      expect(loadWorkerUrl).toHaveBeenCalledTimes(2);
      expect(setWorkerUrl).toHaveBeenCalledExactlyOnceWith("/worker.js");
    },
    LOADER_IMPORT_TIMEOUT_MS,
  );
});
