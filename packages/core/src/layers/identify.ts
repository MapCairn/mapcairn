// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { GeometryError } from "../geometry/errors";
import { wgs84ToWebMercator } from "../geometry/mercator";
import type { LatLng } from "../ports/geometry";
import type {
  ControlValues,
  IdentifyTarget,
  LayerFeature,
} from "../ports/layers";
import { EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0 } from "../zoom/zoom";
import { resolveControlValues, templateValues } from "./controls";
import { type DecoderRegistry, decodeWith, geojsonDecoder } from "./decoders";
import type { IdentifiableLayerDefinition } from "./definition";
import { readPath } from "./paths";
import { fillUrlTemplate } from "./template";
import { isObject } from "./validateSupport";

/** How far from a tap, in CSS pixels, a layer looks when its definition says nothing: a box a little under a fingertip. */
export const DEFAULT_IDENTIFY_TOLERANCE_PX = 12;

/** The smallest tolerance a definition may set, in CSS pixels. */
export const MIN_IDENTIFY_TOLERANCE_PX = 1;

/** The largest tolerance a definition may set, in CSS pixels. */
export const MAX_IDENTIFY_TOLERANCE_PX = 20;

/** The most features one layer yields for one tap, however many its answer holds. */
export const MAX_IDENTIFIED_FEATURES = 20;

/**
 * The variables an identify URL is filled with, besides the layer's controls.
 * No control or derived variable of a layer with an `identify` block may
 * share a name with one.
 */
export const IDENTIFY_VARIABLES: readonly string[] = [
  "lng",
  "lat",
  "bbox",
  "width",
  "height",
  "x",
  "y",
  "zoom",
];

/** Decimal places kept in a degree: about eleven centimetres. */
const DEGREE_DECIMALS = 6;

/** Decimal places kept in a metre or a zoom: a millimetre. */
const MEASURE_DECIMALS = 3;

/** The half pixel from the tapped pixel's centre to the edge of the box. */
const HALF_PIXEL = 0.5;

/**
 * Writes a number rounded to `decimals`, so a long float is cut and a value
 * that rounds to nothing is `0`, never `-0` or `0.000000`. Degrees, metres
 * and zoom levels are far below the size at which JavaScript would switch to
 * an exponent.
 */
function plain(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

/** The box `minx, miny, maxx, maxy` in EPSG:3857 metres, 2t+1 pixels across, centred on the tap. */
function boxAround(
  tap: LatLng,
  zoom: number,
  tolerance: number,
): readonly number[] {
  if (!Number.isFinite(zoom)) {
    throw new GeometryError("invalid", "A zoom must be a finite number.");
  }
  const centre = wgs84ToWebMercator(tap);
  const half =
    ((tolerance + HALF_PIXEL) * EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0) / 2 ** zoom;
  return [centre.x - half, centre.y - half, centre.x + half, centre.y + half];
}

/** The values of {@link IDENTIFY_VARIABLES} for a tap. */
function identifyValues(
  { latlng, zoom }: IdentifyTarget,
  tolerance: number,
): Readonly<Record<string, string>> {
  const side = String(2 * tolerance + 1);
  return {
    lng: plain(latlng.lng, DEGREE_DECIMALS),
    lat: plain(latlng.lat, DEGREE_DECIMALS),
    bbox: boxAround(latlng, zoom, tolerance)
      .map((metres) => plain(metres, MEASURE_DECIMALS))
      .join(","),
    width: side,
    height: side,
    x: String(tolerance),
    y: String(tolerance),
    zoom: plain(zoom, MEASURE_DECIMALS),
  };
}

/**
 * The URL that asks a tile layer's service what is at a tap, as a WMS
 * `GetFeatureInfo` request does. The request is a small square picture,
 * `2 * tolerance + 1` pixels across, centred on the tapped pixel: `{width}`
 * and `{height}` are that size, `{x}` and `{y}` are the tolerance, and
 * `{bbox}` is the picture's box as `minx,miny,maxx,maxy` in EPSG:3857 metres.
 * Every value is encoded, so `{bbox}` goes out with its commas as `%2C`.
 *
 * @remarks The box is neither clamped nor shifted at the edges of the world,
 *   and the server decides what it makes of one. A tap at longitude 179.9999
 *   gives a box that ends past the edge of the world square. Near a pole the
 *   box is centred on latitude 85.0511, the limit of Web Mercator, while
 *   `{lat}` keeps the latitude tapped. The caller wraps longitude to -180 up
 *   to 180 first. Numbers are rounded to a millimetre, a zoom to three
 *   decimals and degrees to six, and written without an exponent.
 * @throws `GeometryError` `invalid` when a coordinate or the zoom is not
 *   finite. A plain `Error` when the template names a variable that has no
 *   value, which a definition that passed validation never does.
 */
export function identifyUrl(
  definition: IdentifiableLayerDefinition,
  controls: ControlValues,
  now: number,
  at: IdentifyTarget,
): string {
  const { url, tolerance = DEFAULT_IDENTIFY_TOLERANCE_PX } =
    definition.identify;
  const values = resolveControlValues(definition, controls, now);
  return fillUrlTemplate(
    url,
    {
      ...templateValues(definition, values),
      ...identifyValues(at, tolerance),
    },
    [],
  );
}

function featureCollection(features: readonly unknown[]): unknown {
  return { type: "FeatureCollection", features };
}

/** A GeoJSON point at the tapped place, for a feature the service gave no place. */
function pointAt(tap: LatLng): unknown {
  return { type: "Point", coordinates: [tap.lng, tap.lat] };
}

/** Each item of the list at `path` as the properties of a feature at the tap. A path that is not a list gives no features. */
function recordsAsFeatures(raw: unknown, path: string, tap: LatLng): unknown {
  const records = readPath(raw, path);
  if (!Array.isArray(records)) {
    return featureCollection([]);
  }
  return featureCollection(
    records.slice(0, MAX_IDENTIFIED_FEATURES).map((record) => ({
      type: "Feature",
      geometry: pointAt(tap),
      properties: record,
    })),
  );
}

/** The feature, or a copy at the tap when it has no geometry (a raster pixel value, say). */
function placed(feature: unknown, tap: LatLng): unknown {
  if (!isObject(feature) || readPath(feature, "geometry") != null) {
    return feature;
  }
  return { ...feature, geometry: pointAt(tap) };
}

/**
 * Prepares a GeoJSON-like answer for the built-in decoder: a document with no
 * `features` list is no features, and a feature with no geometry is placed at
 * the tap. Anything that is not a document is left for the decoder to refuse.
 */
function placeFeatures(raw: unknown, tap: LatLng): unknown {
  if (!isObject(raw)) {
    return raw;
  }
  const features = readPath(raw, "features");
  if (!Array.isArray(features)) {
    return featureCollection([]);
  }
  return { ...raw, features: features.map((item) => placed(item, tap)) };
}

/** The answer in the shape its decoder reads: see {@link decodeIdentify}. */
function prepared(
  definition: IdentifiableLayerDefinition,
  raw: unknown,
  decoders: DecoderRegistry,
  tap: LatLng,
): unknown {
  const { decoder, records } = definition.identify;
  if (records !== undefined) {
    return recordsAsFeatures(raw, records, tap);
  }
  return decoders.get(decoder) === geojsonDecoder
    ? placeFeatures(raw, tap)
    : raw;
}

/**
 * Decodes a service's answer to a tap into features, keeping at most
 * {@link MAX_IDENTIFIED_FEATURES}. Nothing found is an empty list, not an
 * error: it is the common answer.
 *
 * @remarks The answer is prepared, then the definition's named decoder runs,
 *   so `Decoder` keeps its signature. With `records`, the list at that path
 *   becomes a feature collection whose features sit at the tapped place and
 *   whose `properties` are the items, whatever the decoder. Without it, the
 *   built-in `geojson` decoder gets a document with no `features` list read
 *   as no features, and a feature with a missing or `null` geometry placed at
 *   the tapped place, because the decoder drops features with none and a
 *   found feature needs a place for its selection ring. A decoder of any
 *   other kind, including one registered under the name `geojson`, gets the
 *   raw answer. A feature without a usable `id` takes its position in the
 *   answer: unique for one answer, but not the same from one tap to the next.
 *   The cap applies after decoding, because the decoder drops features it
 *   cannot use, so the work is linear in the size of the answer (a records
 *   list is cut to the cap first). The caller bounds the size of the answer
 *   it fetches.
 * @throws `LayerError` `invalid` when the decoder is not registered, or the
 *   answer is not a document the decoder reads.
 */
export function decodeIdentify(
  definition: IdentifiableLayerDefinition,
  raw: unknown,
  decoders: DecoderRegistry,
  at: IdentifyTarget,
): LayerFeature[] {
  const { decoder, fields } = definition.identify;
  return decodeWith(decoders, decoder, raw, fields, (answer) =>
    prepared(definition, answer, decoders, at.latlng),
  ).slice(0, MAX_IDENTIFIED_FEATURES);
}
