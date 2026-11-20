// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import { WORKER_CACHE_KEY } from "../../constants/workerCacheKey";
import { loadWorkerUrl } from "./workerUrl";

vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "/assets/maplibre-gl-worker-HASH.js",
}));

/**
 * A worker script takes its Content Security Policy from its own response
 * headers, and an immutable cached copy keeps the policy of the day it was
 * fetched. A new URL is the only way a changed policy reaches a device that
 * already has the file.
 */
describe("loadWorkerUrl", () => {
  it("resolves to the bundled worker's URL with the policy's cache key added", async () => {
    await expect(loadWorkerUrl()).resolves.toBe(
      `/assets/maplibre-gl-worker-HASH.js?v=${WORKER_CACHE_KEY}`,
    );
  });
});
