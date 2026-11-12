// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import type { Geometry, Position } from "geojson";
import type { LatLng } from "../ports/geometry";

/**
 * The finest step the link and the address bar keep: five decimal places of
 * a degree, about a metre. A position on this grid survives writing and
 * reading unchanged.
 */
const GRID_UNITS_PER_DEGREE = 100_000;

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/** A position holds longitude and latitude, and may add a height. */
const POSITION_SIZES = [2, 3] as const;

const MIN_LINE_POSITIONS = 2;
const MAX_LINE_POSITIONS = 6;
const MIN_RING_CORNERS = 3;
const MAX_RING_CORNERS = 5;
const MAX_RINGS = 2;
const MAX_MEMBERS = 3;

/** Turns -0 into 0 (adding zero does it), because text cannot tell them apart. */
function withoutNegativeZero(value: number): number {
  return value + 0;
}

/** A number of degrees on the grid, from `-limit` to `limit`. */
export function degreesOnGrid(limit: number): fc.Arbitrary<number> {
  return fc
    .integer({
      min: -limit * GRID_UNITS_PER_DEGREE,
      max: limit * GRID_UNITS_PER_DEGREE,
    })
    .map((units) => withoutNegativeZero(units / GRID_UNITS_PER_DEGREE));
}

/** A position on the grid, anywhere in the world. */
export const positionOnGrid: fc.Arbitrary<LatLng> = fc.record({
  lat: degreesOnGrid(MAX_LATITUDE),
  lng: degreesOnGrid(MAX_LONGITUDE),
});

/** The degrees on the grid nearest to `degrees`, never negative zero. */
function snapDegreesToGrid(degrees: number): number {
  return withoutNegativeZero(
    Math.round(degrees * GRID_UNITS_PER_DEGREE) / GRID_UNITS_PER_DEGREE,
  );
}

/** The position on the grid nearest to `position`. */
export function snapToGrid(position: LatLng): LatLng {
  return {
    lat: snapDegreesToGrid(position.lat),
    lng: snapDegreesToGrid(position.lng),
  };
}

function positionOfSize(size: number): fc.Arbitrary<Position> {
  return fc.array(
    fc
      .double({ noNaN: true, noDefaultInfinity: true })
      // Adding zero turns -0 into 0, which text cannot tell apart.
      .map((value) => value + 0),
    { minLength: size, maxLength: size },
  );
}

function ringOfSize(size: number): fc.Arbitrary<Position[]> {
  return fc
    .array(positionOfSize(size), {
      minLength: MIN_RING_CORNERS,
      maxLength: MAX_RING_CORNERS,
    })
    .map((corners) => [...corners, corners[0] as Position]);
}

function geometryOfSize(size: number): fc.Arbitrary<Geometry> {
  const position = positionOfSize(size);
  const line = fc.array(position, {
    minLength: MIN_LINE_POSITIONS,
    maxLength: MAX_LINE_POSITIONS,
  });
  const polygon = fc.array(ringOfSize(size), {
    minLength: 1,
    maxLength: MAX_RINGS,
  });
  return fc.oneof(
    position.map((coordinates): Geometry => ({ type: "Point", coordinates })),
    fc
      .array(position, { maxLength: MAX_MEMBERS })
      .map((coordinates): Geometry => ({ type: "MultiPoint", coordinates })),
    line.map((coordinates): Geometry => ({ type: "LineString", coordinates })),
    fc
      .array(line, { maxLength: MAX_MEMBERS })
      .map(
        (coordinates): Geometry => ({ type: "MultiLineString", coordinates }),
      ),
    polygon.map((coordinates): Geometry => ({ type: "Polygon", coordinates })),
    fc
      .array(polygon, { maxLength: MAX_MEMBERS })
      .map((coordinates): Geometry => ({ type: "MultiPolygon", coordinates })),
  );
}

const singleGeometry: fc.Arbitrary<Geometry> = fc
  .constantFrom(...POSITION_SIZES)
  .chain(geometryOfSize);

/**
 * A valid GeoJSON geometry in any coordinate system: every kind, with or
 * without a height, and collections of them. Coordinates are any finite
 * number, because Well-Known Text may hold projected metres.
 */
export const geoJsonGeometry: fc.Arbitrary<Geometry> = fc.oneof(
  singleGeometry,
  fc
    .array(singleGeometry, { maxLength: MAX_MEMBERS })
    .map(
      (geometries): Geometry => ({ type: "GeometryCollection", geometries }),
    ),
);
