// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type BasemapDefinition, toEngineZoom } from "@mapcairn/core";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/** The id of the source and layer of an inline raster style. */
const RASTER_ID = "basemap";

/** The id of the image source and layer under a hybrid basemap's labels. */
export const IMAGERY_ID = "basemap-imagery";

/** The id of the plain ground a hybrid basemap lays under its imagery. */
const GROUND_ID = "basemap-ground";

/** The kinds of layer a hybrid basemap keeps from its label style: lines and labels, never areas. */
const LABEL_LAYER_TYPES: ReadonlySet<string> = new Set(["line", "symbol"]);

/** The parts of a style layer the hybrid basemap reads. */
interface StyleLayerLike {
  readonly id: string;
  readonly type?: string;
  readonly source?: string;
  readonly "source-layer"?: string;
}

/**
 * Removes style layers, and any source only they drew from. A layer the
 * style does not have is skipped.
 * @returns The layers left in the style, bottom first.
 */
function removeStyleLayers(
  map: MapLibreMap,
  ids: readonly string[],
): readonly StyleLayerLike[] {
  const sources = new Set<string>();
  for (const id of ids) {
    const layer = map.getLayer(id);
    if (layer) {
      if (layer.source !== undefined) {
        sources.add(layer.source);
      }
      map.removeLayer(id);
    }
  }
  const remaining = map.getStyle().layers as StyleLayerLike[];
  for (const { source } of remaining) {
    if (source !== undefined) {
      sources.delete(source);
    }
  }
  for (const source of sources) {
    if (map.getSource(source)) {
      map.removeSource(source);
    }
  }
  return remaining;
}

/**
 * Turns the label style a hybrid basemap loaded into the hybrid. It keeps only
 * the line and symbol layers that draw from the basemap's `labelSourceLayers`,
 * less any named in `labelOmitLayers`, so no area of the style (land, water,
 * buildings, road areas) covers the imagery. It then adds the imagery as a
 * raster source and layer under them, and under that a plain ground in the
 * basemap's `swatch` colour, if it has one, so a dark map is not pale before
 * its imagery draws. The imagery's `maxzoom` is the deepest tile level with
 * real detail, so MapLibre enlarges those tiles further in and requests
 * nothing deeper. Does nothing for another basemap.
 */
export function composeHybrid(
  map: MapLibreMap,
  basemap: BasemapDefinition | undefined,
): void {
  const source = basemap?.source;
  if (source?.kind !== "hybrid") {
    return;
  }
  const keep = new Set(source.labelSourceLayers);
  const omit = new Set(source.labelOmitLayers);
  const kept = (layer: StyleLayerLike) =>
    LABEL_LAYER_TYPES.has(layer.type ?? "") &&
    keep.has(layer["source-layer"] ?? "") &&
    !omit.has(layer.id);
  const remaining = removeStyleLayers(
    map,
    (map.getStyle().layers as StyleLayerLike[])
      .filter((layer) => !kept(layer))
      .map((layer) => layer.id),
  );
  const lowest = remaining[0]?.id;
  map.addSource(IMAGERY_ID, {
    type: "raster",
    tiles: [source.tileUrl],
    tileSize: source.tileSize,
    maxzoom: source.maxTileZoom,
  });
  map.addLayer({ id: IMAGERY_ID, type: "raster", source: IMAGERY_ID }, lowest);
  if (basemap?.swatch !== undefined) {
    map.addLayer(
      {
        id: GROUND_ID,
        type: "background",
        paint: { "background-color": basemap.swatch },
      },
      IMAGERY_ID,
    );
  }
}

/**
 * What MapLibre draws for a basemap: a vector basemap's style URL, an
 * imagery basemap's label style URL (`composeHybrid` adds the imagery once
 * it loads), or an inline style with one raster source and layer for a
 * raster basemap.
 * @remarks `tileSize` must be passed: MapLibre assumes 512 px raster tiles
 *   otherwise and would request the wrong level. The source `maxzoom` is a
 *   tile level, which for 256 px tiles is the normalised zoom, so it is the
 *   basemap's `maxZoom` unconverted; MapLibre overzooms nothing beyond it.
 *   Credits are shown by the ui, so the source carries no attribution.
 */
export function styleFor(
  basemap: BasemapDefinition,
): string | StyleSpecification {
  const { source } = basemap;
  if (source.kind === "vector") {
    return source.styleUrl;
  }
  if (source.kind === "hybrid") {
    return source.labelStyleUrl;
  }
  return {
    version: 8,
    sources: {
      [RASTER_ID]: {
        type: "raster",
        tiles: [source.tileUrl],
        tileSize: source.tileSize,
        maxzoom: basemap.maxZoom,
      },
    },
    layers: [{ id: RASTER_ID, type: "raster", source: RASTER_ID }],
  };
}

/**
 * Sets a basemap's zoom limits on the engine, in the order MapLibre accepts.
 * @remarks MapLibre throws if a new minimum passes the current maximum, or the
 *   reverse, so whichever limit moves away from the other goes first.
 */
export function applyZoomLimits(
  map: MapLibreMap,
  basemap: BasemapDefinition,
): void {
  const minZoom = toEngineZoom(basemap.minZoom);
  const maxZoom = toEngineZoom(basemap.maxZoom);
  if (minZoom > map.getMaxZoom()) {
    map.setMaxZoom(maxZoom);
    map.setMinZoom(minZoom);
  } else {
    map.setMinZoom(minZoom);
    map.setMaxZoom(maxZoom);
  }
}
