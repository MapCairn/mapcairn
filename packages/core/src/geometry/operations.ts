import { bbox } from "@turf/bbox";
import { buffer as turfBuffer } from "@turf/buffer";
import { difference as turfDifference } from "@turf/difference";
import { featureCollection, feature as turfFeature } from "@turf/helpers";
import { intersect as turfIntersect } from "@turf/intersect";
import { simplify as turfSimplify } from "@turf/simplify";
import { union as turfUnion } from "@turf/union";
import type { Feature, Geometry, Position } from "geojson";
import { GeometryError } from "./errors";
import { mapPositions } from "./positions";
import type { GeometryInput, PolygonalGeometry } from "./types";
import { isEmptyGeometry, validateGeometry } from "./validate";

/** Options for {@link buffer}. */
export interface BufferOptions {
  /**
   * How many segments approximate each quarter of a round corner or end cap.
   * A whole number from 1 to 1000. Default 8, so a point's buffer is a
   * 32-sided ring.
   */
  readonly steps?: number;
}

const DEFAULT_STEPS = 8;
const MAX_STEPS = 1000;

/** Metres in one degree of latitude, on a sphere of the Earth's mean radius. */
const METRES_PER_DEGREE = 111_194.9266;

/**
 * The smallest share of a degree of longitude, relative to a degree of
 * latitude, that {@link simplify} scales by. It keeps the scale finite at a
 * pole, where the true share is zero.
 */
const MIN_LONGITUDE_SCALE = 1e-3;

function toPolygonal(input: GeometryInput): PolygonalGeometry {
  const geometry = validateGeometry(input);
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    throw new GeometryError(
      "unsupported",
      "This operation works on polygons and multipolygons only.",
    );
  }
  if (isEmptyGeometry(geometry)) {
    throw new GeometryError("empty", "The polygon has no positions.");
  }
  return geometry;
}

function polygonalFeature(
  geometry: PolygonalGeometry,
): Feature<PolygonalGeometry> {
  return turfFeature(geometry);
}

/** True when a ring jumps more than half the globe between two positions. */
function jumpsAcrossAntimeridian(geometry: PolygonalGeometry): boolean {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) =>
    polygon.some((ring) =>
      ring.some((position, index) => {
        const previous = ring[index - 1];
        return (
          previous !== undefined &&
          Math.abs((position[0] as number) - (previous[0] as number)) > 180
        );
      }),
    ),
  );
}

function bufferShape(
  geometry: Geometry,
  distance: number,
  steps: number,
): PolygonalGeometry | null {
  if (geometry.type === "GeometryCollection") {
    const parts = geometry.geometries
      .filter((member) => !isEmptyGeometry(member))
      .map((member) => bufferShape(member, distance, steps))
      .filter((part): part is PolygonalGeometry => part !== null);
    if (parts.length === 0) {
      return null;
    }
    return parts.length === 1 ? (parts[0] as PolygonalGeometry) : union(parts);
  }
  const area = geometry.type === "Polygon" || geometry.type === "MultiPolygon";
  if (distance < 0 && !area) {
    throw new GeometryError(
      "invalid",
      "Only a polygon can take a negative buffer.",
    );
  }
  if (distance === 0) {
    return area ? structuredClone(geometry as PolygonalGeometry) : null;
  }
  const result = turfBuffer(geometry, distance, { units: "meters", steps });
  if (result === undefined) {
    return null;
  }
  if (jumpsAcrossAntimeridian(result.geometry)) {
    throw new GeometryError(
      "unsupported",
      "The buffer would cross the antimeridian or enclose a pole.",
    );
  }
  return result.geometry;
}

/**
 * Grows a geometry by `distance` metres on every side, giving the area within
 * that distance of it: a ring around a point, a rounded strip along a line, a
 * larger polygon around a polygon. A negative `distance` shrinks a polygon,
 * and a collection becomes the union of its members' buffers.
 *
 * The result is `null` when nothing is left: a distance of 0 around a point
 * or a line, or a negative distance that swallows the polygon. A distance of
 * 0 returns a polygon as it is.
 *
 * Distances are on the ground, worked out around each shape's own centre, so
 * a buffer is round on the Earth rather than on a flat map. Limit: a buffer
 * that would cross the antimeridian or enclose a pole is refused, because
 * GeoJSON cannot write it as one ring. Such a ring has an edge that jumps
 * more than 180 degrees of longitude, so a shape with an edge that long is
 * refused too. Buffer a shape that is far from both, or split it first.
 *
 * @param distance - Metres, finite. Negative only for a polygon.
 * @throws {GeometryError} `invalid` for a malformed geometry, a distance or
 *   `steps` that is not valid, or a negative distance for a point or line;
 *   `empty` for a geometry with no positions; `unsupported` when the buffer
 *   would cross the antimeridian or enclose a pole.
 */
export function buffer(
  input: GeometryInput,
  distance: number,
  options: BufferOptions = {},
): PolygonalGeometry | null {
  const steps = options.steps ?? DEFAULT_STEPS;
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS) {
    throw new GeometryError(
      "invalid",
      `The steps must be a whole number from 1 to ${MAX_STEPS}.`,
    );
  }
  if (!Number.isFinite(distance)) {
    throw new GeometryError("invalid", "The distance must be a finite number.");
  }
  const geometry = validateGeometry(input);
  if (isEmptyGeometry(geometry)) {
    throw new GeometryError("empty", "The geometry has no positions.");
  }
  return bufferShape(geometry, distance, steps);
}

/**
 * Merges polygons into one area. Polygons that touch or overlap become one
 * polygon, and ones that do not stay apart as a multipolygon. A single input
 * comes back as a copy.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry, `empty` for no
 *   input or an empty polygon, `unsupported` for anything but a `Polygon` or
 *   `MultiPolygon`.
 */
export function union(geometries: readonly GeometryInput[]): PolygonalGeometry {
  if (geometries.length === 0) {
    throw new GeometryError("empty", "There is nothing to merge.");
  }
  const polygons = geometries.map(toPolygonal);
  if (polygons.length === 1) {
    return structuredClone(polygons[0] as PolygonalGeometry);
  }
  const merged = turfUnion(featureCollection(polygons.map(polygonalFeature)));
  // turf returns null only for an empty collection, which is refused above.
  return (merged as Feature<PolygonalGeometry>).geometry;
}

/**
 * The area two polygons share, or `null` when they share none. Polygons that
 * only touch along an edge or at a point share no area.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry, `empty` for an
 *   empty polygon, `unsupported` for anything but a `Polygon` or
 *   `MultiPolygon`.
 */
export function intersect(
  first: GeometryInput,
  second: GeometryInput,
): PolygonalGeometry | null {
  const shared = turfIntersect(
    featureCollection([
      polygonalFeature(toPolygonal(first)),
      polygonalFeature(toPolygonal(second)),
    ]),
  );
  return shared === null ? null : shared.geometry;
}

/**
 * The part of `first` that `second` does not cover, or `null` when nothing
 * is left. A `second` inside `first` leaves a hole.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry, `empty` for an
 *   empty polygon, `unsupported` for anything but a `Polygon` or
 *   `MultiPolygon`.
 */
export function difference(
  first: GeometryInput,
  second: GeometryInput,
): PolygonalGeometry | null {
  const left = toPolygonal(first);
  const remainder = turfDifference(
    featureCollection([
      polygonalFeature(left),
      polygonalFeature(toPolygonal(second)),
    ]),
  );
  return remainder === null ? null : remainder.geometry;
}

function simplifyShape(geometry: Geometry, tolerance: number): Geometry {
  if (isEmptyGeometry(geometry)) {
    return structuredClone(geometry);
  }
  const [, south, , north] = bbox(geometry);
  const scale = Math.max(
    MIN_LONGITUDE_SCALE,
    Math.cos((((south + north) / 2) * Math.PI) / 180),
  );
  // Work on a plane where a degree east is as long as a degree north, so one
  // tolerance holds in every direction.
  const originals = new Map<string, Position>();
  const key = (x: number, y: number): string => `${x},${y}`;
  const flat = mapPositions(geometry, (position) => {
    const x = (position[0] as number) * scale;
    const y = position[1] as number;
    originals.set(key(x, y), position);
    return [x, y];
  });
  let simplified: Geometry;
  try {
    simplified = turfSimplify(flat, {
      tolerance: tolerance / METRES_PER_DEGREE,
    });
  } catch {
    // A shape with no area or no length, such as a polygon whose corners lie
    // on one line, has nothing to simplify, and turf refuses it.
    return structuredClone(geometry);
  }
  // Simplifying keeps a subset of the positions it was given, so each one
  // maps back to the exact original rather than a rounded copy.
  return mapPositions(
    simplified,
    (position) =>
      originals.get(
        key(position[0] as number, position[1] as number),
      ) as Position,
  );
}

/**
 * Removes vertices that lie within `tolerance` metres of the line that
 * would replace them (the Douglas-Peucker method), keeping every end point
 * and every ring closed. Points and multipoints come back unchanged.
 * Collections are simplified member by member, and the input is not changed.
 * A shape with no area or length to simplify, such as a polygon whose corners
 * lie on one line, comes back as it is.
 *
 * The tolerance is a distance on the ground, the same east-west and
 * north-south, taken at each shape's middle latitude. Near a pole it is only
 * approximate.
 *
 * @param tolerance - Metres, finite and not negative. 0 returns a copy.
 * @throws {GeometryError} `invalid` for a malformed geometry or a bad
 *   tolerance, `empty` for a geometry with no positions.
 */
export function simplify(input: GeometryInput, tolerance: number): Geometry {
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new GeometryError(
      "invalid",
      "The tolerance must be a finite number of metres, not negative.",
    );
  }
  const geometry = validateGeometry(input);
  if (isEmptyGeometry(geometry)) {
    throw new GeometryError("empty", "The geometry has no positions.");
  }
  if (tolerance === 0) {
    return structuredClone(geometry);
  }
  if (geometry.type === "GeometryCollection") {
    return {
      type: "GeometryCollection",
      geometries: geometry.geometries.map((member) =>
        simplifyShape(member, tolerance),
      ),
    };
  }
  return simplifyShape(geometry, tolerance);
}
