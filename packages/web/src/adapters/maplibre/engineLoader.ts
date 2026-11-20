// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { withCacheKey } from "../../constants/workerCacheKey";

/** The `maplibre-gl` module, as `loadEngine` resolves it. */
export type MapLibreModule = typeof import("maplibre-gl");

let engineLoader: Promise<MapLibreModule> | undefined;

/**
 * Loads `maplibre-gl` and its stylesheet once, and points MapLibre at its
 * bundled worker before any map exists.
 * @remarks MapLibre finds its worker from `import.meta.url`, which inside a
 *   bundle names the current chunk rather than the worker, so without
 *   `setWorkerUrl` the worker never starts and the map stays blank
 *   (maplibre/maplibre-gl-js#8002). Vite's `?worker&url` builds the worker as
 *   a self-contained same-origin asset, so the production CSP's
 *   `worker-src 'self'` covers it, including on iOS. The worker URL is
 *   imported dynamically too: the build groups every `maplibre-gl` module
 *   into one vendor chunk, so a static import of the URL would load the whole
 *   engine with this module. A rejected load is not cached, so a chunk that
 *   failed to download (for example offline) is fetched again on the next
 *   mount.
 * @remarks A worker script enforces the Content Security Policy of its own
 *   response, and the hashed worker file is cached as immutable, so a copy
 *   fetched before the policy changed would keep the old policy for a year.
 *   `workerCacheKey` is added to the worker URL so that a changed policy is a
 *   new address and every device fetches the worker again.
 * @param workerCacheKey - Names the policy the worker is served with; the
 *   worker URL is left as it is when this is absent.
 */
export function loadEngine(workerCacheKey?: string): Promise<MapLibreModule> {
  engineLoader ??= Promise.all([
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ])
    .then(([maplibre, worker]) => {
      maplibre.setWorkerUrl(
        workerCacheKey === undefined
          ? worker.default
          : withCacheKey(worker.default, workerCacheKey),
      );
      return maplibre;
    })
    .catch((error: unknown) => {
      engineLoader = undefined;
      throw error;
    });
  return engineLoader;
}
