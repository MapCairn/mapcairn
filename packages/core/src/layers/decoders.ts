// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { LayerError } from "../ports/errors";
import type {
  FieldValue,
  LayerFeature,
  LayerGeometry,
  Position,
} from "../ports/layers";
import type { FieldMap } from "./definition";
import { readPath } from "./paths";
import { createNamedRegistry, type NamedRegistry } from "./registry";

/**
 * Turns a raw response into features, mapping fields by the definition's
 * paths. It knows a format, never a provider. It throws when the response is
 * not in its format at all; single features it cannot read are skipped.
 */
export type Decoder = (raw: unknown, fields: FieldMap) => LayerFeature[];

/** Decoders by name, as a definition's `decoder` names them. */
export type DecoderRegistry = NamedRegistry<Decoder>;

function toFieldValue(value: unknown): FieldValue {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : null;
}

function toPosition(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const [lng, lat] = value as unknown[];
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  ) {
    return null;
  }
  return [lng, lat];
}

/** Applies `read` to every item of a list, or returns null if any item fails. */
function every<T>(
  value: unknown,
  read: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: T[] = [];
  for (const item of value) {
    const read_ = read(item);
    if (read_ === null) {
      return null;
    }
    items.push(read_);
  }
  return items;
}

const toLine = (value: unknown) => every(value, toPosition);
const toPolygon = (value: unknown) => every(value, toLine);

function toGeometry(value: unknown): LayerGeometry | null {
  const type = readPath(value, "type");
  const coordinates = readPath(value, "coordinates");
  switch (type) {
    case "Point": {
      const point = toPosition(coordinates);
      return point && { type, coordinates: point };
    }
    case "LineString": {
      const line = toLine(coordinates);
      return line && { type, coordinates: line };
    }
    case "MultiLineString":
    case "Polygon": {
      const rings = toPolygon(coordinates);
      return rings && { type, coordinates: rings };
    }
    case "MultiPolygon": {
      const polygons = every(coordinates, toPolygon);
      return polygons && { type, coordinates: polygons };
    }
    default:
      return null;
  }
}

/**
 * The built-in decoder for GeoJSON feature collections, and for documents
 * that are GeoJSON-like (a `features` list of objects with a `geometry`).
 * Fields are read by dotted path from each feature, so the same decoder
 * serves any provider. Only strings, numbers and booleans are kept; any
 * other value becomes null. A feature with no usable `id` gets its position
 * in the list. Features without a drawable geometry are skipped.
 *
 * @throws When the document has no `features` list.
 */
export const geojsonDecoder: Decoder = (raw, fields) => {
  const features = readPath(raw, "features");
  if (!Array.isArray(features)) {
    throw new Error("The response is not a GeoJSON feature collection.");
  }
  const decoded: LayerFeature[] = [];
  features.forEach((feature: unknown, index) => {
    const geometry = toGeometry(readPath(feature, "geometry"));
    if (!geometry) {
      return;
    }
    const values: Record<string, FieldValue> = {};
    for (const [name, path] of Object.entries(fields)) {
      values[name] = toFieldValue(readPath(feature, path));
    }
    const id = values.id;
    const key = id === null || id === "" ? String(index) : String(id);
    decoded.push({ id: key, geometry, fields: { ...values, id: key } });
  });
  return decoded;
};

/**
 * Decodes a raw response with the decoder registered as `name`, the way the
 * feed, detail and identify functions do, so a host that reads a response of
 * its own gets the same typed refusal.
 *
 * @param prepare Reshapes `raw` for the decoder. It runs inside the same
 *   guard as the decoder, so a response that breaks it is refused too. It
 *   leaves `raw` as it is by default.
 * @throws `LayerError` `invalid` when no decoder has that name, or when
 *   `prepare` or the decoder throws.
 */
export function decodeWith(
  decoders: DecoderRegistry,
  name: string,
  raw: unknown,
  fields: FieldMap,
  prepare: (raw: unknown) => unknown = (response) => response,
): LayerFeature[] {
  const decoder = decoders.get(name);
  if (!decoder) {
    throw new LayerError("invalid", `No decoder is registered as "${name}".`);
  }
  try {
    return decoder(prepare(raw), fields);
  } catch (error) {
    throw new LayerError(
      "invalid",
      `The response could not be decoded: ${String(error)}`,
    );
  }
}

/** A registry with the built-in `geojson` decoder plus any `extra` ones, by name. */
export function createDecoderRegistry(
  extra: Readonly<Record<string, Decoder>> = {},
): DecoderRegistry {
  return createNamedRegistry(
    Object.entries({ geojson: geojsonDecoder, ...extra }),
  );
}
