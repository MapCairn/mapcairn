// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The `maplibre-gl` module, as `loadEngine` resolves it. */
export type MapLibreModule = typeof import("maplibre-gl");

let engineLoader: Promise<MapLibreModule> | undefined;

/**
 * Loads `maplibre-gl` and its stylesheet once, and points MapLibre at the
 * worker the host serves before any map exists.
 * @remarks MapLibre finds its worker from `import.meta.url`, which inside a
 *   bundle names the current chunk rather than the worker, so without
 *   `setWorkerUrl` the worker never starts and the map stays blank
 *   (maplibre/maplibre-gl-js#8002). Where the worker is and how it is cached
 *   is the host's business, so the adapter only asks for its URL. A rejected
 *   load, or a rejected `loadWorkerUrl`, is not cached, so a chunk that
 *   failed to download (for example offline) is fetched again on the next
 *   mount. Only the first caller's `loadWorkerUrl` is used: the engine and its
 *   worker URL are shared by every adapter in the page.
 * @param loadWorkerUrl - Resolves to the URL of the engine's worker.
 */
export function loadEngine(
  loadWorkerUrl: () => Promise<string>,
): Promise<MapLibreModule> {
  engineLoader ??= Promise.all([
    import("maplibre-gl"),
    loadWorkerUrl(),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ])
    .then(([maplibre, workerUrl]) => {
      maplibre.setWorkerUrl(workerUrl);
      return maplibre;
    })
    .catch((error: unknown) => {
      engineLoader = undefined;
      throw error;
    });
  return engineLoader;
}
