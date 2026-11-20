// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The MapLibre GL JS adapter for MapCairn's `MapAdapter` port, and the
 * styles that fit the engine into the map region. The package makes no
 * request until a map mounts, and the engine itself is a peer dependency the
 * host installs.
 * @packageDocumentation
 */

// The engine styles have no exports. Importing them here puts them in the
// package's stylesheet (`@mapcairn/adapter-maplibre/styles.css`), and in the
// page of a host that resolves the package's source.
import "./styles.css";

export type { MapLibreMapAdapterOptions } from "./MapLibreMapAdapter";
export {
  createMapLibreMapAdapter,
  TILE_LAYER_SLOW_MS,
} from "./MapLibreMapAdapter";
