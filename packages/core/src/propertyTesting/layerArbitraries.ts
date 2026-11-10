import fc from "fast-check";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LINE_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import type { LayerDefinition } from "../layers/definition";
import type { FieldValue } from "../ports/layers";

/** Every kind of layer definition the sample fixtures hold. */
export const SAMPLE_DEFINITIONS: readonly LayerDefinition[] = [
  SAMPLE_FEED_LAYER,
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_LINE_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_VECTOR_LAYER,
  SAMPLE_TILE_LAYER,
];

/** The edges of the range of values a data layer's position may take. */
const MAX_LONGITUDE_TRIED = 200;
const MAX_LATITUDE_TRIED = 100;

const MAX_FEATURES = 5;
const MAX_PROPERTIES = 5;
const MAX_POSITIONS = 6;
const MAX_RINGS = 5;
const MAX_PROPERTY_NAME_LENGTH = 8;

/**
 * A longitude and latitude that is usually inside the world and sometimes just
 * outside it, because a provider's coordinates are not to be trusted.
 */
const position = fc.tuple(
  fc.double({
    min: -MAX_LONGITUDE_TRIED,
    max: MAX_LONGITUDE_TRIED,
    noNaN: true,
  }),
  fc.double({
    min: -MAX_LATITUDE_TRIED,
    max: MAX_LATITUDE_TRIED,
    noNaN: true,
  }),
);

const geometryType = fc.constantFrom(
  "Point",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
);

const coordinates = fc.oneof(
  fc.jsonValue(),
  position,
  fc.array(position, { maxLength: MAX_POSITIONS }),
  fc.array(fc.array(position, { maxLength: MAX_POSITIONS }), {
    maxLength: MAX_RINGS,
  }),
);

/** A feature whose parts are usually the right kind of thing, and often not quite. */
const featureLike = fc.oneof(
  fc.jsonValue(),
  fc.record({
    type: fc.constant("Feature"),
    id: fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
    geometry: fc.record({ type: geometryType, coordinates }),
    properties: fc.dictionary(
      fc.string({ maxLength: MAX_PROPERTY_NAME_LENGTH }),
      fc.jsonValue(),
      {
        maxKeys: MAX_PROPERTIES,
      },
    ),
  }),
);

/**
 * The body of a provider's response: any JSON, or a document shaped like a
 * GeoJSON feature collection whose features are right or wrong in small ways.
 */
export const responseBody: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue(),
  fc.record({
    type: fc.constant("FeatureCollection"),
    features: fc.array(featureLike, { maxLength: MAX_FEATURES }),
  }),
);

/** A value a decoded feature may hold in one of its fields. */
export const fieldValue: fc.Arbitrary<FieldValue> = fc.oneof(
  fc.string(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.boolean(),
  fc.constant(null),
);

/**
 * A sample definition with one top-level field replaced by any JSON, which
 * gets past the first checks and into the ones that read each field.
 */
export const damagedDefinition: fc.Arbitrary<Record<string, unknown>> = fc
  .constantFrom(...SAMPLE_DEFINITIONS)
  .chain((definition) =>
    fc
      .record({
        field: fc.constantFrom(...Object.keys(definition)),
        replacement: fc.jsonValue(),
      })
      .map(({ field, replacement }) => ({
        ...definition,
        [field]: replacement,
      })),
  );
