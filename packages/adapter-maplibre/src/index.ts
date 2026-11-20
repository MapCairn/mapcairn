// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The MapLibre GL JS adapter for MapCairn's `MapAdapter` port, and the
 * styles that fit the engine into the map region. The package makes no
 * request until a map mounts, and the engine itself is a peer dependency the
 * host installs.
 * @packageDocumentation
 */

export type { MapLibreMapAdapterOptions } from "./MapLibreMapAdapter";
export {
  createMapLibreMapAdapter,
  TILE_LAYER_SLOW_MS,
} from "./MapLibreMapAdapter";
