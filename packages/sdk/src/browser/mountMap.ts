// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createMapLibreMapAdapter } from "@mapcairn/adapter-maplibre";
import { mount } from "./mount";
import type { MapHandle, MountMapOptions } from "./types";

/** The file the build copies the engine's worker to, beside the module. */
const WORKER_FILE = "browser-worker.js";

/**
 * Draws a map in `element` and returns the handle to move, change and remove
 * it. Every option is optional: `mountMap(element)` draws a world map on the
 * built-in basemap, in the device's colour scheme, with zoom, a compass, the
 * credits and the scale. The element needs a height in CSS.
 *
 * @throws MountMapError when called where there is no browser, when the
 *   element already holds a map, or when an option cannot be used. The message
 *   says what to change.
 * @example
 * ```ts
 * const map = mountMap(document.getElementById("map"));
 * map.on("viewchange", (view) => console.log(view.zoom));
 * map.destroy();
 * ```
 */
export function mountMap(
  element: HTMLElement,
  options: MountMapOptions = {},
): MapHandle {
  return mount(element, options, {
    createMapAdapter: (workerUrl) => () =>
      createMapLibreMapAdapter({
        loadWorkerUrl: () => Promise.resolve(workerUrl),
      }),
    defaultWorkerUrl: () => new URL(WORKER_FILE, import.meta.url).href,
  });
}
