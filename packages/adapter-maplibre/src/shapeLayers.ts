// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LineDash } from "@mapcairn/core";
import { toEngineZoom } from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import type { EngineValue, LookExpressions } from "./lookExpressions";
import { PATTERN_IMAGE_PREFIX } from "./patternImages";

/** One engine style layer, as the adapter hands it to `addLayer`. */
export type EngineLayer = { readonly id: string } & Readonly<
  Record<string, unknown>
>;

/** A visible range in engine zoom levels. */
export interface ZoomWindow {
  readonly minzoom?: number;
  readonly maxzoom?: number;
}

/** The highest zoom an engine layer's `maxzoom` can be. */
const ENGINE_MAX_ZOOM = 24;

/**
 * The engine zoom window the layer is visible in, from normalised zoom
 * windows: the narrowest overlap of them all. A normalised zoom is converted,
 * because the engine counts 512 px tiles, and kept inside the range the
 * engine accepts.
 */
export function engineWindow(
  ...windows: readonly {
    readonly minzoom?: number;
    readonly maxzoom?: number;
  }[]
): ZoomWindow {
  const mins = windows.flatMap(({ minzoom }) =>
    minzoom === undefined ? [] : [minzoom],
  );
  const maxs = windows.flatMap(({ maxzoom }) =>
    maxzoom === undefined ? [] : [maxzoom],
  );
  return {
    ...(mins.length > 0
      ? { minzoom: Math.max(0, toEngineZoom(Math.max(...mins))) }
      : {}),
    ...(maxs.length > 0
      ? {
          maxzoom: Math.min(ENGINE_MAX_ZOOM, toEngineZoom(Math.min(...maxs))),
        }
      : {}),
  };
}

/** The dash styles, and the `line-dasharray` each needs (in line widths). */
const DASH_ARRAYS: Readonly<Record<LineDash, readonly number[] | undefined>> = {
  solid: undefined,
  dashed: [3, 2],
  dotted: [1, 2],
};

const DASHES: readonly LineDash[] = ["solid", "dashed", "dotted"];

/** How much wider than the line a casing is, in CSS pixels. */
const CASING_EXTRA = 2 * tokenValues.dataMarker.haloWidth;

/** What every layer of one data source layer shares. */
export interface ShapeSource {
  /** Starts every engine layer id: `mapcairn:<id>:<prefix>`. */
  readonly prefix: string;
  /** The engine source's id. */
  readonly source: string;
  /** The layer inside a vector tile source. */
  readonly sourceLayer?: string;
  readonly zoom: ZoomWindow;
  /**
   * Draws only this kind of geometry. Needed for vector tiles, whose source
   * layers can mix kinds; the adapter's own GeoJSON holds one kind already.
   */
  readonly only?: "area" | "line";
}

const GEOMETRY_TYPES = {
  area: ["Polygon", "MultiPolygon"],
  line: ["LineString", "MultiLineString"],
} as const;

/** One layer's `filter`, or none when every condition is absent. */
function allOf(...filters: readonly (EngineValue | undefined)[]): unknown {
  const present = filters.filter((filter) => filter !== undefined);
  if (present.length === 0) {
    return undefined;
  }
  return present.length === 1 ? present[0] : ["all", ...present];
}

function layerOf(
  shape: ShapeSource,
  part: string,
  type: string,
  properties: Readonly<{
    filter?: unknown;
    paint?: Readonly<Record<string, unknown>>;
    layout?: Readonly<Record<string, unknown>>;
    zoom?: ZoomWindow;
  }>,
): EngineLayer {
  const { filter, paint, layout, zoom = shape.zoom } = properties;
  return {
    id: `${shape.prefix}${part}`,
    type,
    source: shape.source,
    ...(shape.sourceLayer === undefined
      ? {}
      : { "source-layer": shape.sourceLayer }),
    ...zoom,
    ...(filter === undefined ? {} : { filter }),
    ...(paint ? { paint } : {}),
    ...(layout ? { layout } : {}),
  };
}

function onlyFilter(shape: ShapeSource): unknown {
  return shape.only === undefined
    ? undefined
    : ["match", ["geometry-type"], GEOMETRY_TYPES[shape.only], true, false];
}

/** One line layer per dash style a look can have, each drawing the features of its style. */
function dashLayers(
  shape: ShapeSource,
  part: string,
  look: LookExpressions,
  paint: { colour: EngineValue; width: EngineValue },
): EngineLayer[] {
  const dashes = look.fixedDash ? [look.fixedDash] : DASHES;
  return dashes.map((dash) => {
    const dasharray = DASH_ARRAYS[dash];
    return layerOf(shape, `${part}-${dash}`, "line", {
      filter: allOf(
        onlyFilter(shape),
        look.fixedDash ? undefined : ["==", look.dash, dash],
      ),
      layout: { "line-join": "round" },
      paint: {
        "line-color": paint.colour,
        "line-width": paint.width,
        ...(dasharray ? { "line-dasharray": [...dasharray] } : {}),
      },
    });
  });
}

/**
 * The layers of polygons, bottom first: the translucent fill, a hatch over
 * it for the features with a pattern, and the outline in the palette's ink,
 * one layer per dash style because an engine takes a dash array as a literal.
 */
export function areaLayers(
  shape: ShapeSource,
  look: LookExpressions,
): EngineLayer[] {
  const layers: EngineLayer[] = [
    layerOf(shape, "fill", "fill", {
      filter: onlyFilter(shape),
      paint: { "fill-color": look.colour, "fill-opacity": look.fillOpacity },
    }),
  ];
  if (look.fixedPattern !== "solid") {
    layers.push(
      layerOf(shape, "pattern", "fill", {
        filter: allOf(
          onlyFilter(shape),
          look.fixedPattern ? undefined : ["!=", look.pattern, "solid"],
        ),
        paint: {
          "fill-pattern": look.fixedPattern
            ? `${PATTERN_IMAGE_PREFIX}${look.fixedPattern}`
            : ["concat", PATTERN_IMAGE_PREFIX, look.pattern],
        },
      }),
    );
  }
  layers.push(
    ...dashLayers(shape, "outline", look, {
      colour: tokenValues.dataMarker.edge,
      width: look.width,
    }),
  );
  return layers;
}

/**
 * The layers of lines, bottom first: a wider casing in the palette's halo
 * colour so the line reads on any basemap, then the coloured line. Each is
 * one layer per dash style.
 */
export function lineLayers(
  shape: ShapeSource,
  look: LookExpressions,
): EngineLayer[] {
  return [
    ...dashLayers(shape, "casing", look, {
      colour: tokenValues.dataMarker.halo,
      width: ["+", look.width, CASING_EXTRA],
    }),
    ...dashLayers(shape, "line", look, {
      colour: look.colour,
      width: look.width,
    }),
  ];
}

/** What a label layer needs besides its source. */
export interface LabelOptions {
  /** The engine expression for the text. */
  readonly text: EngineValue;
  /** A literal font stack the basemap's glyph server has. */
  readonly font: readonly string[];
  readonly zoom: ZoomWindow;
  /** Lines carry their label along them; polygons carry it at their centre. */
  readonly along: boolean;
  readonly filter?: unknown;
}

/** The text of a shape layer, in the palette's ink over a white halo. */
export function labelLayer(
  shape: ShapeSource,
  options: LabelOptions,
): EngineLayer {
  return layerOf(shape, "label", "symbol", {
    zoom: options.zoom,
    filter: allOf(onlyFilter(shape), options.filter),
    layout: {
      "text-field": options.text,
      "text-font": [...options.font],
      "text-size": 12,
      "text-max-width": 8,
      ...(options.along ? { "symbol-placement": "line" } : {}),
    },
    paint: {
      "text-color": tokenValues.dataMarker.edge,
      "text-halo-color": tokenValues.dataMarker.halo,
      "text-halo-width": tokenValues.dataMarker.haloWidth,
    },
  });
}
