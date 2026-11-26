// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapFeature,
  MapHeatmap,
  MapShapes,
  MapStyledShapes,
  MapTileOverlay,
  MapVectorTiles,
} from "@mapcairn/core";
import type {
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import { heatmapLayer } from "./heatmapLayer";
import { propertyLook, ruleLook } from "./lookExpressions";
import { markerImageName } from "./markerImages";
import {
  areaLayers,
  type EngineLayer,
  engineWindow,
  labelLayer,
  lineLayers,
  type ShapeSource,
} from "./shapeLayers";

/** The start of every engine id the adapter makes for a data layer. */
export const ENGINE_ID_PREFIX = "mapcairn:";

/**
 * The engine ids for one data layer: its source and the style layers drawn
 * from it. All start with `mapcairn:` so they never meet a basemap's own ids.
 * Styled shapes, vector tiles and heatmaps own several style layers each
 * (their ids are `mapcairn:<id>:<part>`, and the part never has a colon), which
 * the adapter lists as it draws them.
 */
export function dataLayerEngineIds(id: string) {
  return {
    source: `${ENGINE_ID_PREFIX}${id}`,
    points: `${ENGINE_ID_PREFIX}${id}:points`,
    tiles: `${ENGINE_ID_PREFIX}${id}:tiles`,
    fill: `${ENGINE_ID_PREFIX}${id}:fill`,
    line: `${ENGINE_ID_PREFIX}${id}:line`,
    heat: `${ENGINE_ID_PREFIX}${id}:heat`,
  } as const;
}

/** A data layer the adapter keeps, so it can draw it again after a basemap swap. */
export type DataLayer =
  | { readonly kind: "features"; readonly features: readonly MapFeature[] }
  | { readonly kind: "tiles"; readonly overlay: MapTileOverlay }
  | { readonly kind: "shapes"; readonly shapes: MapShapes }
  | { readonly kind: "styled"; readonly layer: MapStyledShapes }
  | { readonly kind: "vector"; readonly tiles: MapVectorTiles }
  | { readonly kind: "heatmap"; readonly heatmap: MapHeatmap };

/** The translucent fill of a shape layer, so the map under it stays readable. */
const SHAPE_FILL_OPACITY = 0.18;

/** The width of a shape layer's lines, in CSS pixels, unless the caller sets one. */
const SHAPE_LINE_WIDTH = 2;

/** What a data layer needs to be drawn, before any engine call. */
export interface DrawPlan {
  readonly source: Record<string, unknown>;
  readonly layers: readonly EngineLayer[];
  readonly points?: readonly string[];
  readonly lines?: readonly string[];
  readonly polygons?: readonly string[];
}

/**
 * The tile URL template a plan's engine source requests tiles from, or
 * undefined for a source that holds its data (points, shapes, a heatmap of
 * points) and requests none.
 */
export function tileTemplateOf(source: DrawPlan["source"]): string | undefined {
  const { tiles } = source;
  return Array.isArray(tiles) && typeof tiles[0] === "string"
    ? tiles[0]
    : undefined;
}

/** The GeoJSON geometry types each kind of styled shape layer draws. */
const STYLED_GEOMETRY_TYPES = {
  area: ["Polygon", "MultiPolygon"],
  line: ["LineString", "MultiLineString"],
} as const;

/**
 * A literal font stack from a style layer's `text-font`, or undefined when
 * the layout has none (it may be an expression, which cannot be reused).
 * @remarks A stack of font names and a short expression such as
 *   `["get", "font"]` are both arrays of strings. An expression starts with
 *   an operator, which is all lower case with no space, and a font name the
 *   glyph servers in use hold is not, so such a start means an expression.
 */
function literalFont(layout: unknown): readonly string[] | undefined {
  const font = (layout as { "text-font"?: unknown } | undefined)?.["text-font"];
  const stack =
    Array.isArray(font) && font[0] === "literal" ? (font[1] as unknown) : font;
  return Array.isArray(stack) &&
    stack.length > 0 &&
    stack.every((name) => typeof name === "string") &&
    !/^[a-z][a-z-]*$/.test(stack[0] as string)
    ? (stack as string[])
    : undefined;
}

/**
 * The font stack for labels: the first one a symbol layer of the loaded
 * basemap names, which its glyph server is known to have. Undefined when the
 * basemap has no glyph server, such as an inline raster style, because a
 * label cannot be drawn then and no other glyph host may be assumed.
 */
export function basemapFont(map: MapLibreMap): readonly string[] | undefined {
  const style = map.getStyle();
  if (!style.glyphs) {
    return undefined;
  }
  for (const layer of style.layers as {
    type?: string;
    layout?: unknown;
  }[]) {
    if (layer.type === "symbol") {
      const font = literalFont(layer.layout);
      if (font) {
        return font;
      }
    }
  }
  return undefined;
}

function pointCollection(id: string, features: readonly MapFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((feature) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [feature.position.lng, feature.position.lat],
      },
      properties: {
        "mapcairn:layer": id,
        "mapcairn:id": feature.id,
        icon: markerImageName(feature.shape, feature.colour, feature.radius),
        // Larger points are drawn first, so smaller ones stay on top and tappable.
        sort: -feature.radius,
      },
    })),
  };
}

function shapeCollection(shapes: MapShapes) {
  return {
    type: "FeatureCollection" as const,
    features: shapes.geometries.map((geometry) => ({
      type: "Feature" as const,
      geometry,
      properties: {},
    })),
  };
}

/**
 * The styled shapes of the layer's geometry kind, each carrying its look as
 * properties the engine layers read per feature. Shapes of the other kind are
 * left out.
 */
function styledCollection(id: string, layer: MapStyledShapes) {
  const types: readonly string[] = STYLED_GEOMETRY_TYPES[layer.geometry];
  return {
    type: "FeatureCollection" as const,
    features: layer.shapes
      .filter((shape) => types.includes(shape.geometry.type))
      .map((shape) => ({
        type: "Feature" as const,
        geometry: shape.geometry,
        properties: {
          "mapcairn:layer": id,
          "mapcairn:id": shape.id,
          colour: shape.look.colour,
          fillOpacity: shape.look.fillOpacity,
          pattern: shape.look.pattern,
          dash: shape.look.dash,
          width: shape.look.width,
          label: shape.label ?? "",
        },
      })),
  };
}

function weightedPoints(
  heatmap: Extract<MapHeatmap["source"], { kind: "points" }>,
) {
  return {
    type: "FeatureCollection" as const,
    features: heatmap.points.map((point) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [point.position.lng, point.position.lat],
      },
      properties: { weight: point.weight ?? 1 },
    })),
  };
}

/** The engine's vector tile source for a port vector source. Its zoom limits are tile levels, so they are not converted. */
function vectorSource(source: MapVectorTiles["source"]) {
  return {
    type: "vector",
    tiles: [source.tiles],
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    ...(source.encoding ? { encoding: source.encoding } : {}),
  };
}

/**
 * Works out the source and style layers of a data layer, without touching the
 * engine.
 * @param labelFont - Reads the labels' font stack. Called only by the kinds
 *   that draw labels, so a layer that has none never asks for it.
 */
export function planDataLayer(
  id: string,
  layer: DataLayer,
  labelFont: () => readonly string[] | undefined,
): DrawPlan {
  const ids = dataLayerEngineIds(id);
  switch (layer.kind) {
    case "features": {
      return {
        source: {
          type: "geojson",
          data: pointCollection(id, layer.features),
        },
        layers: [
          {
            id: ids.points,
            type: "symbol",
            source: ids.source,
            layout: {
              "icon-image": ["get", "icon"],
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "symbol-sort-key": ["get", "sort"],
            },
          },
        ],
        points: [ids.points],
      };
    }
    case "tiles": {
      const { tiles, tileSize, maxzoom, bounds, opacity } = layer.overlay;
      return {
        source: {
          type: "raster",
          tiles: [tiles],
          tileSize,
          maxzoom,
          ...(bounds ? { bounds: [...bounds] } : {}),
        },
        layers: [
          {
            id: ids.tiles,
            type: "raster",
            source: ids.source,
            paint: { "raster-opacity": opacity },
          },
        ],
      };
    }
    case "shapes": {
      const { colour, lineWidth = SHAPE_LINE_WIDTH } = layer.shapes;
      return {
        source: {
          type: "geojson",
          // The port's positions are readonly tuples; the engine only reads them.
          data: shapeCollection(layer.shapes),
        },
        layers: [
          {
            id: ids.fill,
            type: "fill",
            source: ids.source,
            filter: [
              "match",
              ["geometry-type"],
              ["Polygon", "MultiPolygon"],
              true,
              false,
            ],
            paint: {
              "fill-color": colour,
              "fill-opacity": SHAPE_FILL_OPACITY,
            },
          },
          {
            id: ids.line,
            type: "line",
            source: ids.source,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": colour, "line-width": lineWidth },
          },
        ],
      };
    }
    case "styled":
      return planStyledShapes(id, layer.layer, labelFont);
    case "vector":
      return planVectorLayer(id, layer.tiles, labelFont);
    case "heatmap":
      return planHeatmap(id, layer.heatmap);
  }
}

function planStyledShapes(
  id: string,
  styled: MapStyledShapes,
  labelFont: () => readonly string[] | undefined,
): DrawPlan {
  const source = dataLayerEngineIds(id).source;
  const collection = styledCollection(id, styled);
  const shape: ShapeSource = {
    prefix: `mapcairn:${id}:styled-`,
    source,
    zoom: {},
  };
  const look = propertyLook();
  const isArea = styled.geometry === "area";
  const layers = isArea ? areaLayers(shape, look) : lineLayers(shape, look);
  const font = labelFont();
  const labelled = collection.features.some(
    (feature) => feature.properties.label !== "",
  );
  if (font && labelled) {
    layers.push(
      labelLayer(shape, {
        text: ["get", "label"],
        font,
        along: !isArea,
        zoom: engineWindow({ minzoom: styled.labelMinZoom }),
        filter: ["!=", ["get", "label"], ""],
      }),
    );
  }
  const ofKind = (part: string) =>
    layers
      .map((layer) => layer.id)
      .filter((layerId) => layerId.startsWith(`${shape.prefix}${part}`));
  return {
    // The port's positions are readonly tuples; the engine only reads them.
    source: {
      type: "geojson",
      data: collection as unknown as GeoJSONSourceSpecification["data"],
    },
    layers,
    lines: isArea ? [] : ofKind("line-"),
    polygons: isArea ? ofKind("fill") : [],
  };
}

function planVectorLayer(
  id: string,
  vector: MapVectorTiles,
  labelFont: () => readonly string[] | undefined,
): DrawPlan {
  const source = dataLayerEngineIds(id).source;
  const font = labelFont();
  const layers: EngineLayer[] = [];
  vector.layers.forEach((sourceLayer, index) => {
    const look = ruleLook(sourceLayer.rule);
    if (!look) {
      return;
    }
    const shape: ShapeSource = {
      prefix: `mapcairn:${id}:v${index}-`,
      source,
      sourceLayer: sourceLayer.sourceLayer,
      zoom: engineWindow(vector, sourceLayer),
      only: sourceLayer.geometry,
    };
    const isArea = sourceLayer.geometry === "area";
    layers.push(
      ...(isArea ? areaLayers(shape, look) : lineLayers(shape, look)),
    );
    if (font && sourceLayer.label) {
      const text = ["to-string", ["get", sourceLayer.label.field]];
      layers.push(
        labelLayer(shape, {
          text,
          font,
          along: !isArea,
          zoom: engineWindow(vector, sourceLayer, sourceLayer.label),
          filter: ["!=", text, ""],
        }),
      );
    }
  });
  return { source: vectorSource(vector.source), layers };
}

function planHeatmap(id: string, heatmap: MapHeatmap): DrawPlan {
  const ids = dataLayerEngineIds(id);
  const { source, style } = heatmap;
  if (source.kind === "points") {
    return {
      source: {
        type: "geojson",
        data: weightedPoints(source),
      },
      layers: [
        heatmapLayer(
          {
            id: ids.heat,
            source: ids.source,
            weight: ["get", "weight"],
            zoom: {},
          },
          style,
        ),
      ],
    };
  }
  return {
    source: vectorSource(source.source),
    layers: [
      heatmapLayer(
        {
          id: ids.heat,
          source: ids.source,
          sourceLayer: source.sourceLayer,
          weight: source.weightField
            ? ["to-number", ["get", source.weightField], 1]
            : 1,
          zoom: engineWindow(source),
        },
        style,
      ),
    ],
  };
}
