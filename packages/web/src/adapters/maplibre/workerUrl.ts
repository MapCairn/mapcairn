// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { WORKER_CACHE_KEY, withCacheKey } from "../../constants/workerCacheKey";

/**
 * Resolves to the URL the reference host serves the MapLibre worker from.
 * @remarks MapLibre finds its worker from `import.meta.url`, which inside a
 *   bundle names the current chunk rather than the worker, so the adapter is
 *   told where it is (maplibre/maplibre-gl-js#8002). Vite's `?worker&url`
 *   builds the worker as a self-contained same-origin asset, so the production
 *   CSP's `worker-src 'self'` covers it, including on iOS. The import is
 *   dynamic: the build groups every `maplibre-gl` module into one vendor
 *   chunk, so a static import of the URL would load the whole engine with this
 *   module.
 *
 *   A worker script enforces the Content Security Policy of its own response,
 *   and the hashed worker file is cached as immutable, so a copy fetched
 *   before the policy changed would keep the old policy for a year.
 *   `WORKER_CACHE_KEY` is added to the URL so that a changed policy is a new
 *   address and every device fetches the worker again.
 */
export async function loadWorkerUrl(): Promise<string> {
  const worker = await import(
    "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
  );
  return withCacheKey(worker.default, WORKER_CACHE_KEY);
}
