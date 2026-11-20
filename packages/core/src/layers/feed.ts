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
import { jsonEqual } from "./jsonEqual";
import { queryBoxes } from "./query";
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
  return capQuery(definition, features);
}

/** A query layer's features cut to one more than its `maxFeatures`; any other layer's, whole. */
function capQuery(
  definition: LayerDefinition,
  features: LayerFeature[],
): LayerFeature[] {
  return loadsFeatures(definition) && definition.source.kind === "query"
    ? features.slice(0, definition.source.maxFeatures + 1)
    : features;
}

/** What decoding one of several responses gives: its features, or none when it held none. */
function decodeOrNothing(
  definition: LayerDefinition,
  raw: unknown,
  decoders: DecoderRegistry,
): LayerFeature[] {
  try {
    return decodeFeed(definition, raw, decoders);
  } catch (error) {
    if (error instanceof LayerError && error.kind === "empty") {
      return [];
    }
    throw error;
  }
}

/**
 * Joins decoded responses. A feature with the id and the geometry of one
 * already kept is the same feature, seen from both boxes, and is dropped.
 * A different feature that has the same id (a provider that reuses one, or
 * the position a decoder gives a feature with no id of its own, which starts
 * again in each response) is kept under a new id, so ids stay unique in the
 * layer.
 */
function joinResponses(responses: readonly LayerFeature[][]): LayerFeature[] {
  const kept = new Map<string, LayerFeature>();
  responses.forEach((features, response) => {
    for (const feature of features) {
      const same = kept.get(feature.id);
      if (same && jsonEqual(same.geometry, feature.geometry)) {
        continue;
      }
      let id = feature.id;
      for (let n = response; kept.has(id); n += 1) {
        id = `${feature.id}#${n}`;
      }
      kept.set(id, { ...feature, id, fields: { ...feature.fields, id } });
    }
  });
  return [...kept.values()];
}

/**
 * Decodes the responses to the requests `feedUrls` lists, as `decodeFeed`
 * does for one, and joins them in the order they came. A feature that more
 * than one response holds (one on the antimeridian can be in the box on each
 * side) is kept once, when its id and geometry are the same; a different
 * feature with the same id is kept under a new id. Each response is capped
 * at one more than a query layer's `maxFeatures` before they are joined, and
 * the cap applies to the whole again.
 *
 * @throws `LayerError` `invalid` when any response cannot be decoded, and
 *   `empty` when no feature is left in any of them.
 */
export function decodeFeeds(
  definition: LayerDefinition,
  raws: readonly unknown[],
  decoders: DecoderRegistry,
): LayerFeature[] {
  const [only, ...others] = raws;
  if (others.length === 0) {
    return decodeFeed(definition, only, decoders);
  }
  const features = joinResponses(
    raws.map((raw) => decodeOrNothing(definition, raw, decoders)),
  );
  if (features.length === 0) {
    throw new LayerError("empty");
  }
  return capQuery(definition, features);
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
 *
 * @throws when the `area` crosses the antimeridian, which takes two
 *   requests: use `feedUrls`. It once gave one URL with the box clamped to
 *   the edge of the world, which asked for the wrong area.
 */
export function feedUrl(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
  area?: Bounds,
): string {
  const [url, ...more] = feedUrls(definition, controls, now, area);
  if (more.length > 0) {
    throw new Error(`The area for ${definition.id} crosses the antimeridian.`);
  }
  return url as string;
}

/**
 * The URLs to ask for a feed or query layer's controls: one, except for a
 * query layer whose `area` crosses the antimeridian, which gets one for each
 * side of the line (`queryBoxes`), because a provider takes a box inside
 * -180 to 180. Join the answers with `decodeFeeds`.
 */
export function feedUrls(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
  area?: Bounds,
): string[] {
  if (!loadsFeatures(definition)) {
    throw new Error(`${definition.id} is not a feed layer.`);
  }
  const values = resolveControlValues(definition, controls, now);
  const { source } = definition;
  if (source.kind === "feed") {
    return [fillUrlTemplate(source.url, templateValues(definition, values))];
  }
  if (!area) {
    throw new Error(`${definition.id} is a query layer and needs an area.`);
  }
  return queryBoxes(area).map((box) =>
    fillUrlTemplate(source.url, {
      ...templateValues(definition, values),
      west: String(box.west),
      south: String(box.south),
      east: String(box.east),
      north: String(box.north),
      limit: String(source.maxFeatures + 1),
    }),
  );
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
