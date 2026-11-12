// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LayerError } from "../ports/errors";
import type { Bounds } from "../ports/geometry";
import type { ControlValues, LayerFeature } from "../ports/layers";
import { resolveControlValues, templateValues } from "./controls";
import { type DecoderRegistry, decodeWith } from "./decoders";
import {
  isFeedLayer,
  isShapeStyle,
  type LayerDefinition,
  loadsFeatures,
} from "./definition";
import { matchesFilter } from "./filter";
import { fillUrlTemplate } from "./template";

const GEOMETRIES: Readonly<
  Record<"points" | "area" | "line", readonly string[]>
> = {
  points: ["Point"],
  area: ["Polygon", "MultiPolygon"],
  line: ["LineString", "MultiLineString"],
};

/**
 * Decodes a feed response with the definition's decoder, applies its filter
 * and keeps the geometry the layer draws: points for a point style or a
 * heatmap, polygons for an area style and lines for a line style. A query
 * layer keeps at most one feature more than its `maxFeatures`, so the caller
 * can tell that more exist without holding a runaway response.
 *
 * @throws `LayerError` `invalid` when it cannot be decoded (or the layer has
 *   no feed), and `empty` when no feature is left.
 */
export function decodeFeed(
  definition: LayerDefinition,
  raw: unknown,
  decoders: DecoderRegistry,
): LayerFeature[] {
  if (!loadsFeatures(definition)) {
    throw new LayerError("invalid", `${definition.id} has no feed.`);
  }
  const { decoder, fields, filter } = definition.source;
  const drawn =
    isFeedLayer(definition) && isShapeStyle(definition.style)
      ? GEOMETRIES[definition.style.geometry]
      : GEOMETRIES.points;
  const features = decodeWith(decoders, decoder, raw, fields).filter(
    (feature) =>
      drawn.includes(feature.geometry.type) &&
      (!filter || matchesFilter(feature, filter)),
  );
  if (features.length === 0) {
    throw new LayerError("empty");
  }
  return definition.source.kind === "query"
    ? features.slice(0, definition.source.maxFeatures + 1)
    : features;
}

/**
 * Decodes a detail response (such as an event's affected area) and keeps its
 * lines and polygons.
 *
 * @throws `LayerError` `invalid` when it cannot be decoded (or the layer has
 *   no detail), and `empty` when it has no shape.
 */
export function decodeDetail(
  definition: LayerDefinition,
  raw: unknown,
  decoders: DecoderRegistry,
): LayerFeature[] {
  if (!isFeedLayer(definition) || !definition.detail) {
    throw new LayerError("invalid", `${definition.id} has no detail source.`);
  }
  const shapes = decodeWith(decoders, definition.detail.decoder, raw, {
    id: "id",
    title: "properties.name",
  }).filter((shape) => shape.geometry.type !== "Point");
  if (shapes.length === 0) {
    throw new LayerError("empty");
  }
  return shapes;
}

/**
 * The URL for a feed or query layer's controls. Missing or invalid values use
 * their defaults. A query layer needs the `area` of the map it asks for
 * (see `queryWindow`), which fills its box and its limit.
 */
export function feedUrl(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
  area?: Bounds,
): string {
  if (!loadsFeatures(definition)) {
    throw new Error(`${definition.id} is not a feed layer.`);
  }
  const values = resolveControlValues(definition, controls, now);
  const { source } = definition;
  if (source.kind === "feed") {
    return fillUrlTemplate(source.url, templateValues(definition, values));
  }
  if (!area) {
    throw new Error(`${definition.id} is a query layer and needs an area.`);
  }
  return fillUrlTemplate(source.url, {
    ...templateValues(definition, values),
    west: String(area.west),
    south: String(area.south),
    east: String(area.east),
    north: String(area.north),
    limit: String(source.maxFeatures + 1),
  });
}

/**
 * The tile URL template for a raster or vector tile layer's controls, with
 * the engine's own placeholders (`{z}`, `{bbox-epsg-3857}`) left in.
 */
export function tileUrl(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
): string {
  if (loadsFeatures(definition)) {
    throw new Error(`${definition.id} is not a tile layer.`);
  }
  const values = resolveControlValues(definition, controls, now);
  return fillUrlTemplate(
    definition.source.tiles,
    templateValues(definition, values),
  );
}

/**
 * The URL of a feature's detail, or null when the layer has none or the
 * feature's URL is not `https` on one of the origins the definition declares.
 * The URL comes from the provider's data, so it is checked before any
 * request is made, not only by the Content-Security-Policy.
 */
export function detailUrl(
  definition: LayerDefinition,
  feature: LayerFeature,
): string | null {
  if (!isFeedLayer(definition) || !definition.detail) {
    return null;
  }
  const value = feature.fields[definition.detail.urlField];
  if (typeof value !== "string" || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === "https:" &&
    definition.detail.origins.includes(url.origin)
    ? url.href
    : null;
}
