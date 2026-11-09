import { LayerError } from "../ports/errors";
import type { ControlValues, LayerFeature } from "../ports/layers";
import { resolveControlValues, templateValues } from "./controls";
import type { DecoderRegistry } from "./decoders";
import { isFeedLayer, type LayerDefinition } from "./definition";
import { matchesFilter } from "./filter";
import { fillUrlTemplate } from "./template";

function decodeWith(
  decoders: DecoderRegistry,
  name: string,
  raw: unknown,
  fields: Parameters<NonNullable<ReturnType<DecoderRegistry["get"]>>>[1],
): LayerFeature[] {
  const decoder = decoders.get(name);
  if (!decoder) {
    throw new LayerError("invalid", `No decoder is registered as "${name}".`);
  }
  try {
    return decoder(raw, fields);
  } catch (error) {
    throw new LayerError(
      "invalid",
      `The response could not be decoded: ${String(error)}`,
    );
  }
}

/**
 * Decodes a feed response with the definition's decoder, applies its filter
 * and keeps the points, which are all a feed layer draws.
 *
 * @throws `LayerError` `invalid` when it cannot be decoded (or the layer has
 *   no feed), and `empty` when no feature is left.
 */
export function decodeFeed(
  definition: LayerDefinition,
  raw: unknown,
  decoders: DecoderRegistry,
): LayerFeature[] {
  if (!isFeedLayer(definition)) {
    throw new LayerError("invalid", `${definition.id} has no feed.`);
  }
  const { decoder, fields, filter } = definition.source;
  const features = decodeWith(decoders, decoder, raw, fields).filter(
    (feature) =>
      feature.geometry.type === "Point" &&
      (!filter || matchesFilter(feature, filter)),
  );
  if (features.length === 0) {
    throw new LayerError("empty");
  }
  return features;
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

/** The feed URL for a feed layer's controls. Missing or invalid values use their defaults. */
export function feedUrl(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
): string {
  if (!isFeedLayer(definition)) {
    throw new Error(`${definition.id} is not a feed layer.`);
  }
  const values = resolveControlValues(definition, controls, now);
  return fillUrlTemplate(
    definition.source.url,
    templateValues(definition, values),
  );
}

/**
 * The tile URL template for a tile layer's controls, with the engine's own
 * placeholders (`{z}`, `{bbox-epsg-3857}`) left in.
 */
export function tileUrl(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
): string {
  if (isFeedLayer(definition)) {
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
