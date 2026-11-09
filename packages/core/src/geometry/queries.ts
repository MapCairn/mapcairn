import { bbox } from "@turf/bbox";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { centroid as turfCentroid } from "@turf/centroid";
import type { Geometry, Point, Position } from "geojson";
import type { Bounds, LatLng } from "../ports/geometry";
import {
  measureLineDistance,
  measurePolygonArea,
} from "../spatial/measurement";
import { GeometryError } from "./errors";
import type { BoundingBox, GeometryInput } from "./types";
import { isEmptyGeometry, validateGeometry } from "./validate";

/** A position to test: `[lng, lat]`, a map position or a GeoJSON point. */
export type PointInput = Position | LatLng | Point;

/** Options for {@link pointInPolygon}. */
export interface PointInPolygonOptions {
  /** Count a point on the edge, or on a hole's edge, as outside. Default `false`. */
  readonly ignoreBoundary?: boolean;
}

function nonEmpty(input: GeometryInput): Geometry {
  const geometry = validateGeometry(input);
  if (isEmptyGeometry(geometry)) {
    throw new GeometryError("empty", "The geometry has no positions.");
  }
  return geometry;
}

/**
 * The smallest box holding every position of a geometry, as
 * `[west, south, east, north]`. Heights are ignored.
 *
 * Longitude is treated as a flat axis, as GeoJSON does. A shape that crosses
 * the antimeridian must be split at 180 degrees, and the box of its pieces
 * then spans the whole way round (`west` -180, `east` 180) rather than the
 * short way across. Use `boundingBoxToBounds` for the shape the map port
 * takes.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry, `empty` when it
 *   has no positions.
 */
export function boundingBox(input: GeometryInput): BoundingBox {
  const [west, south, east, north] = bbox(nonEmpty(input));
  return [west, south, east, north];
}

/** Converts a {@link BoundingBox} to the `Bounds` the map port uses. */
export function boundingBoxToBounds(box: BoundingBox): Bounds {
  const [west, south, east, north] = box;
  return { west, south, east, north };
}

/**
 * The mean of a geometry's vertices, as a map position. This is a plain
 * average of the positions (a ring's repeated closing position counts once),
 * so a polygon with many vertices along one side leans towards that side. It
 * is not the centre of mass, and for a concave shape it may fall outside it.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry, `empty` when it
 *   has no positions.
 */
export function centroid(input: GeometryInput): LatLng {
  const [lng, lat] = turfCentroid(nonEmpty(input)).geometry.coordinates;
  return { lat: lat as number, lng: lng as number };
}

function resolvePoint(point: PointInput): Position {
  let candidate: unknown = point;
  if (Array.isArray(point)) {
    candidate = { type: "Point", coordinates: point };
  } else if (typeof point === "object" && point !== null && "lat" in point) {
    candidate = { type: "Point", coordinates: [point.lng, point.lat] };
  }
  const geometry = validateGeometry(candidate);
  if (geometry.type !== "Point" || geometry.coordinates.length === 0) {
    throw new GeometryError("invalid", "The point is not a position.");
  }
  return geometry.coordinates;
}

/**
 * Whether a point lies inside a polygon or multipolygon. Holes are respected:
 * a point in a hole is outside, and a point inside an island within a hole is
 * inside. A point on an edge counts as inside unless `ignoreBoundary` is set.
 * An empty polygon holds nothing.
 *
 * The test is planar, on the longitude and latitude as given, so it is
 * sound for any polygon that does not cross the antimeridian (GeoJSON splits
 * those at 180 degrees, and each piece works).
 *
 * @throws {GeometryError} `invalid` for a malformed point or polygon,
 *   `unsupported` when the shape is not a `Polygon` or `MultiPolygon`.
 */
export function pointInPolygon(
  point: PointInput,
  polygon: GeometryInput,
  options: PointInPolygonOptions = {},
): boolean {
  const position = resolvePoint(point);
  const area = validateGeometry(polygon);
  if (area.type !== "Polygon" && area.type !== "MultiPolygon") {
    throw new GeometryError(
      "unsupported",
      "Only a polygon or multipolygon can contain a point.",
    );
  }
  if (isEmptyGeometry(area)) {
    return false;
  }
  return booleanPointInPolygon(position, area, {
    ignoreBoundary: options.ignoreBoundary ?? false,
  });
}

/** Metres along one line of positions, by the shared measurement helper. */
function lineMetres(positions: readonly Position[]): number {
  return (measureLineDistance(positions) ?? 0) * 1000;
}

/** Square metres inside one ring, by the shared measurement helper. */
function ringSquareMetres(ring: readonly Position[]): number {
  return measurePolygonArea(ring) ?? 0;
}

function measureLength(geometry: Geometry): number {
  switch (geometry.type) {
    case "LineString":
      return lineMetres(geometry.coordinates);
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.reduce(
        (sum, ring) => sum + lineMetres(ring),
        0,
      );
    case "MultiPolygon":
      return geometry.coordinates.reduce(
        (sum, polygon) =>
          sum + polygon.reduce((inner, ring) => inner + lineMetres(ring), 0),
        0,
      );
    case "GeometryCollection":
      return geometry.geometries.reduce(
        (sum, member) => sum + measureLength(member),
        0,
      );
    default:
      return 0;
  }
}

function polygonArea(rings: readonly (readonly Position[])[]): number {
  const [outer, ...holes] = rings;
  if (outer === undefined) {
    return 0;
  }
  const holeArea = holes.reduce((sum, hole) => sum + ringSquareMetres(hole), 0);
  return Math.max(0, ringSquareMetres(outer) - holeArea);
}

function measureArea(geometry: Geometry): number {
  switch (geometry.type) {
    case "Polygon":
      return polygonArea(geometry.coordinates);
    case "MultiPolygon":
      return geometry.coordinates.reduce(
        (sum, polygon) => sum + polygonArea(polygon),
        0,
      );
    case "GeometryCollection":
      return geometry.geometries.reduce(
        (sum, member) => sum + measureArea(member),
        0,
      );
    default:
      return 0;
  }
}

/**
 * The length of a geometry in metres, along the ground. A line is its length,
 * a polygon its perimeter, holes included, and a collection the sum of its
 * members. A point, and any empty geometry, has no length. It sums the same
 * per-line measure as `measureLineDistance`, so the two agree.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry.
 */
export function geometryLength(input: GeometryInput): number {
  return measureLength(validateGeometry(input));
}

/**
 * The area of a geometry in square metres, on the ground. A polygon's holes
 * are taken out, a multipolygon and a collection are summed, and anything
 * that covers no area (a point, a line, an empty shape) is 0. It sums the
 * same per-ring measure as `measurePolygonArea`, so the two agree.
 *
 * @throws {GeometryError} `invalid` for a malformed geometry.
 */
export function geometryArea(input: GeometryInput): number {
  return measureArea(validateGeometry(input));
}
