// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  isQueryLayer,
  isVectorTileLayer,
  type LayerDefinition,
} from "./definition";

/** Whether a layer's definition has a zoom window, so the map's zoom is worth reporting to it. */
export function hasZoomWindow(definition: LayerDefinition): boolean {
  const { minzoom, maxzoom } = zoomWindow(definition);
  return minzoom !== undefined || maxzoom !== undefined;
}

/**
 * Which way to zoom for a layer to show, and to which normalised zoom level.
 * `zoom-in` means the view is wider than the layer's minimum, and `zoom-out`
 * that it is closer than the layer's maximum.
 */
export type ZoomLimit =
  | { readonly kind: "zoom-in"; readonly level: number }
  | { readonly kind: "zoom-out"; readonly level: number };

/**
 * The zoom a layer's own definition asks for: a query layer's
 * `source.minzoom`, and a vector tile layer's `minzoom` and `maxzoom`. Both
 * are normalised levels, so they compare with the map's zoom as they stand.
 * A raster tile source's `maxzoom` is not one: it is the deepest tile level
 * the service has, and the engine scales beyond it.
 */
function zoomWindow(definition: LayerDefinition): {
  readonly minzoom?: number;
  readonly maxzoom?: number;
} {
  if (isQueryLayer(definition)) {
    return { minzoom: definition.source.minzoom };
  }
  if (isVectorTileLayer(definition)) {
    return { minzoom: definition.minzoom, maxzoom: definition.maxzoom };
  }
  return {};
}

/**
 * Which way to zoom for a layer to show at a normalised `zoom`, or null when
 * the zoom is inside its window or it has none. Built from the definition
 * alone, so it names no layer.
 */
export function layerZoomLimit(
  definition: LayerDefinition,
  zoom: number,
): ZoomLimit | null {
  const { minzoom, maxzoom } = zoomWindow(definition);
  if (minzoom !== undefined && zoom < minzoom) {
    return { kind: "zoom-in", level: minzoom };
  }
  if (maxzoom !== undefined && zoom >= maxzoom) {
    return { kind: "zoom-out", level: maxzoom };
  }
  return null;
}
