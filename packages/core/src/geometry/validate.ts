import type { Geometry } from "geojson";
import { GeometryError } from "./errors";

/**
 * How deep a `GeometryCollection` may nest inside another. GeoJSON discourages
 * nesting at all; the limit keeps hostile input from exhausting the stack.
 */
export const MAX_COLLECTION_DEPTH = 16;

/** Options for {@link validateGeometry}. */
export interface ValidateOptions {
  /**
   * Whether coordinates are WGS 84 degrees, so longitude must lie in
   * [-180, 180] and latitude in [-90, 90]. Default `true`. Turn it off for
   * coordinates in another system, such as Web Mercator metres.
   */
  readonly geographic?: boolean;
}

type Shape = Record<string, unknown>;

const SHAPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection",
]);

function invalid(message: string): GeometryError {
  return new GeometryError("invalid", message);
}

function isRecord(value: unknown): value is Shape {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The geometry inside `input`, unwrapping a feature. */
function unwrap(input: unknown): Shape {
  if (!isRecord(input) || typeof input.type !== "string") {
    throw invalid("The input is not a GeoJSON geometry or feature.");
  }
  if (input.type === "FeatureCollection") {
    throw new GeometryError(
      "unsupported",
      "A feature collection is not a single geometry.",
    );
  }
  if (input.type === "Feature") {
    if (input.geometry === null) {
      throw new GeometryError("empty", "The feature has no geometry.");
    }
    if (!isRecord(input.geometry)) {
      throw invalid("The feature's geometry is not an object.");
    }
    return input.geometry;
  }
  return input;
}

/** Tracks the number of numbers in a position, which one shape keeps fixed. */
interface Dimension {
  value: number;
}

function checkPosition(
  value: unknown,
  geographic: boolean,
  dimension: Dimension,
): void {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    throw invalid("A position must hold two or three numbers.");
  }
  for (const part of value) {
    if (typeof part !== "number" || !Number.isFinite(part)) {
      throw invalid("A position must hold finite numbers.");
    }
  }
  if (dimension.value === 0) {
    dimension.value = value.length;
  } else if (dimension.value !== value.length) {
    throw invalid("The positions of one shape must all have the same size.");
  }
  if (geographic) {
    const [lng, lat] = value as number[];
    if ((lng as number) < -180 || (lng as number) > 180) {
      throw invalid("A longitude must lie between -180 and 180 degrees.");
    }
    if ((lat as number) < -90 || (lat as number) > 90) {
      throw invalid("A latitude must lie between -90 and 90 degrees.");
    }
  }
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw invalid(`${what} must be an array.`);
  }
  return value;
}

function checkLine(
  value: unknown,
  geographic: boolean,
  dimension: Dimension,
): void {
  const positions = asArray(value, "A line");
  if (positions.length < 2) {
    throw invalid("A line needs at least two positions.");
  }
  for (const position of positions) {
    checkPosition(position, geographic, dimension);
  }
}

function checkRing(
  value: unknown,
  geographic: boolean,
  dimension: Dimension,
): void {
  const positions = asArray(value, "A ring");
  if (positions.length < 4) {
    throw invalid("A ring needs at least four positions.");
  }
  for (const position of positions) {
    checkPosition(position, geographic, dimension);
  }
  const first = positions[0] as number[];
  const last = positions[positions.length - 1] as number[];
  if (first.some((part, index) => part !== last[index])) {
    throw invalid("A ring must end where it starts.");
  }
}

function checkPolygon(
  value: unknown,
  geographic: boolean,
  dimension: Dimension,
): void {
  for (const ring of asArray(value, "A polygon")) {
    checkRing(ring, geographic, dimension);
  }
}

function checkShape(shape: Shape, geographic: boolean, depth: number): void {
  const { type } = shape;
  if (typeof type !== "string" || !SHAPES.has(type)) {
    throw invalid(`The geometry type ${JSON.stringify(type)} is not known.`);
  }
  if (type === "GeometryCollection") {
    if (depth >= MAX_COLLECTION_DEPTH) {
      throw invalid("The geometry collections are nested too deeply.");
    }
    for (const member of asArray(shape.geometries, "A collection's members")) {
      if (!isRecord(member)) {
        throw invalid("A collection's member is not a geometry.");
      }
      checkShape(member, geographic, depth + 1);
    }
    return;
  }
  const coordinates = asArray(shape.coordinates, "The coordinates");
  const dimension: Dimension = { value: 0 };
  switch (type) {
    case "Point":
      if (coordinates.length > 0) {
        checkPosition(coordinates, geographic, dimension);
      }
      break;
    case "MultiPoint":
      for (const position of coordinates) {
        checkPosition(position, geographic, dimension);
      }
      break;
    case "LineString":
      if (coordinates.length > 0) {
        checkLine(coordinates, geographic, dimension);
      }
      break;
    case "MultiLineString":
      for (const line of coordinates) {
        checkLine(line, geographic, dimension);
      }
      break;
    case "Polygon":
      checkPolygon(coordinates, geographic, dimension);
      break;
    default:
      for (const polygon of coordinates) {
        checkPolygon(polygon, geographic, dimension);
      }
  }
}

/**
 * Checks that `input` is a well-formed GeoJSON geometry, or a feature holding
 * one, and returns the geometry itself (the same object, not a copy).
 *
 * It accepts empty geometries (a `Point` with `[]` for coordinates, a
 * `GeometryCollection` with no members) because they are legal GeoJSON; the
 * operations that cannot work on nothing refuse them with an `empty` error.
 * It refuses a position that is not two or three finite numbers, a line with
 * fewer than two positions, a ring that is open or shorter than four
 * positions, positions of different sizes inside one shape, and a collection
 * nested more than {@link MAX_COLLECTION_DEPTH} deep. By default it also
 * refuses a longitude or latitude outside the globe, which is how a shape
 * that runs past the antimeridian shows up: GeoJSON wants such a shape split
 * at 180 degrees.
 *
 * @throws {GeometryError} `invalid` for a malformed shape, `empty` for a
 *   feature with no geometry, `unsupported` for a feature collection.
 */
export function validateGeometry(
  input: unknown,
  options: ValidateOptions = {},
): Geometry {
  const shape = unwrap(input);
  checkShape(shape, options.geographic ?? true, 0);
  return shape as unknown as Geometry;
}

/**
 * Whether a validated geometry holds no positions: empty coordinates, or a
 * collection whose members are all empty.
 */
export function isEmptyGeometry(geometry: Geometry): boolean {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.every(isEmptyGeometry);
  }
  return geometry.coordinates.length === 0;
}
