// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  boundsOfPoints,
  type ControlValues,
  evaluatePointStyle,
  type FeedLayerDefinition,
  type FormatterRegistry,
  formatTemplate,
  type HeatmapLayerDefinition,
  type HeatmapSpec,
  heatmapOpacity,
  heatmapSettings,
  type LatLng,
  type LayerDefinition,
  type LayerFeature,
  type LayerGeometry,
  type MapFeature,
  type MapHeatmap,
  type MapHeatmapStyle,
  type MapLookRule,
  type MapShapeLook,
  type MapStyledShape,
  type MapStyledShapes,
  type MapVectorSourceLayer,
  type MapVectorTiles,
  type PaletteSlot,
  type PointStyle,
  type ShapeLook,
  type ShapeStyle,
  shapeClasses,
  shapeEvaluator,
  tileUrl,
  type VectorTileLayerDefinition,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";

const PALETTE: Readonly<Record<string, string>> = tokenValues.dataPalette;

/**
 * The hex value of a palette slot. Definitions name slots, `@mapcairn/theme`
 * holds the values, and the definition schema only accepts slots that exist,
 * so a missing value is a wiring bug.
 */
export function paletteColour(slot: PaletteSlot): string {
  const colour = PALETTE[slot];
  if (colour === undefined) {
    throw new Error(`The data palette has no colour "${slot}".`);
  }
  return colour;
}

/** Every position of a geometry, in any nesting. */
function positionsOf(geometry: LayerGeometry): LatLng[] {
  switch (geometry.type) {
    case "Point":
      return [{ lng: geometry.coordinates[0], lat: geometry.coordinates[1] }];
    case "LineString":
      return geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flatMap((line) =>
        line.map(([lng, lat]) => ({ lat, lng })),
      );
    case "MultiPolygon":
      return geometry.coordinates.flatMap((rings) =>
        rings.flatMap((ring) => ring.map(([lng, lat]) => ({ lat, lng }))),
      );
  }
}

/** The most vertices one ring or line contributes to an outline drawn over the map. */
export const MAX_OUTLINE_POINTS = 400;

/** One ring or line of a feature, ready to draw as a path. */
export interface FeatureOutline {
  readonly points: readonly LatLng[];
  /** True for a polygon ring, whose path closes. */
  readonly closed: boolean;
}

/** Keeps at most `limit` evenly spread positions, always the first and the last. */
function thin(positions: readonly LatLng[], limit: number): LatLng[] {
  if (positions.length <= limit) {
    return [...positions];
  }
  const step = (positions.length - 1) / (limit - 1);
  return Array.from(
    { length: limit },
    (_, index) => positions[Math.round(index * step)] as LatLng,
  );
}

/**
 * The rings and lines of a polygon or line feature, thinned so an outline
 * drawn from them over the map stays cheap to redraw while the map moves. A
 * point has none.
 */
export function featureOutlines(feature: LayerFeature): FeatureOutline[] {
  const { geometry } = feature;
  const toPoints = (line: readonly (readonly [number, number])[]) =>
    thin(
      line.map(([lng, lat]) => ({ lat, lng })),
      MAX_OUTLINE_POINTS,
    );
  switch (geometry.type) {
    case "Point":
      return [];
    case "LineString":
      return [{ points: toPoints(geometry.coordinates), closed: false }];
    case "MultiLineString":
      return geometry.coordinates.map((line) => ({
        points: toPoints(line),
        closed: false,
      }));
    case "Polygon":
      return geometry.coordinates.map((ring) => ({
        points: toPoints(ring),
        closed: true,
      }));
    case "MultiPolygon":
      return geometry.coordinates.flatMap((rings) =>
        rings.map((ring) => ({ points: toPoints(ring), closed: true })),
      );
  }
}

/** The box around a feature's geometry, or null when it has no coordinates. */
export function featureBounds(feature: LayerFeature): Bounds | null {
  const positions = positionsOf(feature.geometry);
  return boundsOfPoints(positions) ?? null;
}

/**
 * Where a feature is: a point's own position, and for a polygon or line the
 * centre of its box. Null when the geometry has no coordinates.
 */
export function featurePosition(feature: LayerFeature): LatLng | null {
  const bounds = featureBounds(feature);
  return bounds
    ? {
        lat: (bounds.south + bounds.north) / 2,
        lng: (bounds.west + bounds.east) / 2,
      }
    : null;
}

function toMapLook(look: ShapeLook): MapShapeLook {
  return {
    colour: paletteColour(look.colour),
    fillOpacity: look.fillOpacity,
    pattern: look.pattern,
    dash: look.dash,
    width: look.width,
  };
}

/**
 * Turns a shape style's colour rule into the rule a vector tile engine
 * evaluates for each feature: categories become cases with the other class
 * as the fallback, and steps and equal intervals become ascending minimums.
 */
export function toLookRule(style: ShapeStyle): MapLookRule {
  const classes = shapeClasses(style).map(toMapLook);
  const at = (index: number) => classes[index] as MapShapeLook;
  const { colour } = style;
  switch (colour.kind) {
    case "fixed":
      return { kind: "fixed", look: at(0) };
    case "category":
      return {
        kind: "category",
        field: colour.field,
        cases: colour.categories.map((category, index) => ({
          value: category.value,
          look: at(index),
        })),
        fallback: at(colour.categories.length),
      };
    case "steps":
      return {
        kind: "steps",
        field: colour.field,
        steps: colour.steps.map((step, index) => ({
          min: step.min,
          look: at(index),
        })),
      };
    case "intervals": {
      const width = (colour.max - colour.min) / colour.ramp.length;
      return {
        kind: "steps",
        field: colour.field,
        steps: colour.ramp.map((_, index) => ({
          min: colour.min + index * width,
          look: at(index),
        })),
      };
    }
  }
}

/** The engine's source for a definition's vector tiles, with the tile URL filled from the controls. */
function toMapSource(
  definition: VectorTileLayerDefinition,
  controls: ControlValues,
  now: number,
) {
  return {
    tiles: tileUrl(definition, controls, now),
    minzoom: definition.source.minzoom ?? 0,
    maxzoom: definition.source.maxzoom,
  };
}

/**
 * The vector tile layer for the polygon and line source layers of a
 * definition, with each rule, window and label worked out. Heatmap source
 * layers are drawn separately (see {@link toVectorHeatmaps}).
 */
export function toMapVector(
  definition: VectorTileLayerDefinition,
  controls: ControlValues,
  now: number,
): MapVectorTiles {
  return {
    source: toMapSource(definition, controls, now),
    layers: definition.sourceLayers.flatMap((layer): MapVectorSourceLayer[] => {
      if ("heatmap" in layer) {
        return [];
      }
      const { style } = layer;
      return [
        {
          sourceLayer: layer.sourceLayer,
          geometry: style.geometry,
          rule: toLookRule(style),
          ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}),
          ...(layer.maxzoom !== undefined ? { maxzoom: layer.maxzoom } : {}),
          ...(style.label
            ? {
                label: {
                  field: style.label.template.slice(1, -1),
                  ...(style.label.minzoom !== undefined
                    ? { minzoom: style.label.minzoom }
                    : {}),
                },
              }
            : {}),
        },
      ];
    }),
    ...(definition.minzoom !== undefined
      ? { minzoom: definition.minzoom }
      : {}),
    ...(definition.maxzoom !== undefined
      ? { maxzoom: definition.maxzoom }
      : {}),
  };
}

function heatmapStyle(
  definition: LayerDefinition,
  spec: HeatmapSpec,
  controls: ControlValues,
): MapHeatmapStyle {
  return {
    ...heatmapSettings(spec, controls),
    opacity: heatmapOpacity(definition, controls),
    ramp: spec.ramp.map(paletteColour),
  };
}

/** A heatmap of a feed or query layer's points, weighted by its weight field. */
export function toMapHeatmap(
  definition: HeatmapLayerDefinition,
  features: readonly LayerFeature[],
  controls: ControlValues,
): MapHeatmap {
  const { weightField } = definition.heatmap;
  return {
    source: {
      kind: "points",
      points: features.flatMap((feature) => {
        if (feature.geometry.type !== "Point") {
          return [];
        }
        const raw = weightField ? feature.fields[weightField] : null;
        const [lng, lat] = feature.geometry.coordinates;
        return [
          {
            position: { lat, lng },
            weight: typeof raw === "number" && Number.isFinite(raw) ? raw : 1,
          },
        ];
      }),
    },
    style: heatmapStyle(definition, definition.heatmap, controls),
  };
}

/** One heatmap for each heatmap source layer of a vector tile definition, in order. */
export function toVectorHeatmaps(
  definition: VectorTileLayerDefinition,
  controls: ControlValues,
  now: number,
): MapHeatmap[] {
  return definition.sourceLayers.flatMap((layer): MapHeatmap[] => {
    if (!("heatmap" in layer)) {
      return [];
    }
    return [
      {
        source: {
          kind: "vector",
          source: toMapSource(definition, controls, now),
          sourceLayer: layer.sourceLayer,
          ...(layer.heatmap.weightField
            ? { weightField: layer.heatmap.weightField }
            : {}),
          ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}),
          ...(layer.maxzoom !== undefined ? { maxzoom: layer.maxzoom } : {}),
        },
        style: heatmapStyle(definition, layer.heatmap, controls),
      },
    ];
  });
}

/**
 * Works out how each polygon or line of a feed layer is drawn, with its label
 * text, so the map adapter gets plain colours, widths and patterns and needs
 * no style rule. Features of the geometry the style does not draw are skipped.
 */
export function toStyledShapes(
  definition: FeedLayerDefinition<ShapeStyle>,
  features: readonly LayerFeature[],
  formatters: FormatterRegistry,
  now: number,
): MapStyledShapes {
  const { style } = definition;
  const evaluate = shapeEvaluator(style);
  const drawn =
    style.geometry === "area"
      ? ["Polygon", "MultiPolygon"]
      : ["LineString", "MultiLineString"];
  const shapes = features.flatMap((feature): MapStyledShape[] => {
    if (!drawn.includes(feature.geometry.type)) {
      return [];
    }
    const look = evaluate(feature.fields);
    const label = style.label
      ? formatTemplate(style.label.template, feature.fields, formatters, {
          now,
        })
      : null;
    return [
      {
        id: feature.id,
        geometry: feature.geometry,
        look: {
          colour: paletteColour(look.colour),
          fillOpacity: look.fillOpacity,
          pattern: look.pattern,
          dash: look.dash,
          width: look.width,
        },
        ...(label ? { label } : {}),
      },
    ];
  });
  return {
    geometry: style.geometry,
    shapes,
    ...(style.label?.minzoom !== undefined
      ? { labelMinZoom: style.label.minzoom }
      : {}),
  };
}

/**
 * Works out how each point of a feed layer is drawn, so the map adapter gets
 * plain colours, sizes and shapes and needs no style rule.
 */
export function toMapFeatures(
  style: PointStyle,
  features: readonly LayerFeature[],
): MapFeature[] {
  return features.flatMap((feature) => {
    const position =
      feature.geometry.type === "Point" ? featurePosition(feature) : null;
    if (!position) {
      return [];
    }
    const marker = evaluatePointStyle(style, feature.fields);
    return [
      {
        id: feature.id,
        position,
        colour: paletteColour(marker.colour),
        radius: marker.radius,
        shape: marker.shape,
      },
    ];
  });
}
