// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import type { DrawShapeInput } from "../draw/reducer";
import { MAX_CIRCLE_RADIUS_METRES, validateShape } from "../draw/shape";
import type { DrawShape } from "../draw/types";
import { degreesOnGrid, positionOnGrid, snapToGrid } from "./geoArbitraries";

/** A centre this far from the poles and the antimeridian keeps a small shape inside the world. */
const SAFE_LATITUDE = 80;
const SAFE_LONGITUDE = 170;

const MIN_LINE_VERTICES = 2;
const MAX_LINE_VERTICES = 6;
const MIN_POLYGON_VERTICES = 3;
const MAX_POLYGON_VERTICES = 8;
const MAX_SHAPES_IN_A_LINK = 5;

/** Radii of a generated polygon, in degrees: wide enough to survive rounding to the grid. */
const MIN_POLYGON_RADIUS = 0.01;
const MAX_POLYGON_RADIUS = 0.5;

const pointInput: fc.Arbitrary<DrawShapeInput> = positionOnGrid.map(
  (position) => ({ kind: "point", vertices: [position] }),
);

const lineInput: fc.Arbitrary<DrawShapeInput> = fc
  .array(positionOnGrid, {
    minLength: MIN_LINE_VERTICES,
    maxLength: MAX_LINE_VERTICES,
  })
  .map((vertices) => ({ kind: "line", vertices }));

const circleInput: fc.Arbitrary<DrawShapeInput> = fc
  .record({
    centre: positionOnGrid,
    radiusMetres: fc.integer({ min: 1, max: MAX_CIRCLE_RADIUS_METRES }),
  })
  .map(({ centre, radiusMetres }) => ({
    kind: "circle",
    vertices: [centre],
    radiusMetres,
  }));

/** The range of a small circle's radius in centimetres: 0.01 m, the least a CSV or GeoJSON export keeps, to 3 m. */
const MIN_SMALL_RADIUS_CENTIMETRES = 1;
const MAX_SMALL_RADIUS_CENTIMETRES = 300;
const CENTIMETRES_PER_METRE = 100;

/**
 * A circle with a radius from a centimetre to three metres, in whole
 * centimetres so its exported radius reads back exactly, and far enough from
 * the poles and the antimeridian for its outline to be an ordinary polygon.
 * Rounding the outline to six decimals folds such a circle in on itself, so it
 * checks that the export keeps more digits.
 */
export const smallCircleInput: fc.Arbitrary<DrawShapeInput> = fc
  .record({
    centre: fc.record({
      lat: degreesOnGrid(SAFE_LATITUDE),
      lng: degreesOnGrid(SAFE_LONGITUDE),
    }),
    centimetres: fc.integer({
      min: MIN_SMALL_RADIUS_CENTIMETRES,
      max: MAX_SMALL_RADIUS_CENTIMETRES,
    }),
  })
  .map(({ centre, centimetres }) => ({
    kind: "circle",
    vertices: [centre],
    radiusMetres: centimetres / CENTIMETRES_PER_METRE,
  }));

/** The smallest radius, in metres, of a circle off the grid: 0.1 mm, which is still many units of ten decimals across. */
const MIN_OFF_GRID_RADIUS_METRES = 0.0001;

/** The largest radius, in metres, of a circle off the grid: well below the 1 m at which six decimals begin to fold a circle in. */
const MAX_OFF_GRID_RADIUS_METRES = 0.1;

/**
 * A circle of a tenth of a metre or less whose centre and radius sit anywhere,
 * as a tap on the map and a drag give them, not on a grid. Such a circle's
 * outline needs more than six decimals, so its centre and radius are written
 * exactly, and an export has to read back as the same numbers. It is away from
 * the poles and the antimeridian, where its outline is an ordinary polygon.
 */
export const offGridSmallCircleInput: fc.Arbitrary<DrawShapeInput> = fc
  .record({
    lat: fc.double({
      min: -SAFE_LATITUDE,
      max: SAFE_LATITUDE,
      noNaN: true,
    }),
    lng: fc.double({
      min: -SAFE_LONGITUDE,
      max: SAFE_LONGITUDE,
      noNaN: true,
    }),
    radiusMetres: fc.double({
      min: MIN_OFF_GRID_RADIUS_METRES,
      max: MAX_OFF_GRID_RADIUS_METRES,
      noNaN: true,
    }),
  })
  .map(({ lat, lng, radiusMetres }) => ({
    kind: "circle",
    // Adding zero turns a negative zero into 0, which is how a file writes it.
    vertices: [{ lat: lat + 0, lng: lng + 0 }],
    radiusMetres,
  }));

/**
 * A polygon that cannot cross itself: its corners sit at evenly spaced
 * bearings around a centre, each at its own distance.
 */
const polygonInput: fc.Arbitrary<DrawShapeInput> = fc
  .record({
    centre: fc.record({
      lat: degreesOnGrid(SAFE_LATITUDE),
      lng: degreesOnGrid(SAFE_LONGITUDE),
    }),
    radii: fc.array(
      fc.double({
        min: MIN_POLYGON_RADIUS,
        max: MAX_POLYGON_RADIUS,
        noNaN: true,
      }),
      { minLength: MIN_POLYGON_VERTICES, maxLength: MAX_POLYGON_VERTICES },
    ),
  })
  .map(({ centre, radii }) => ({
    kind: "polygon",
    vertices: radii.map((radius, index) => {
      const bearing = (2 * Math.PI * index) / radii.length;
      return snapToGrid({
        lat: centre.lat + radius * Math.cos(bearing),
        lng: centre.lng + radius * Math.sin(bearing),
      });
    }),
  }));

/**
 * One valid shape of any kind, with every position on the grid, as the link
 * encoding reads it back.
 */
export const shapeInput: fc.Arbitrary<DrawShapeInput> = fc
  .oneof(pointInput, lineInput, polygonInput, circleInput)
  .filter((input) => validateShape(finishShape(input, 0)) === null);

/** Several valid shapes, few enough to fit in a link. */
export const shapeInputs: fc.Arbitrary<DrawShapeInput[]> = fc.array(
  shapeInput,
  { maxLength: MAX_SHAPES_IN_A_LINK },
);

/** A shape as the draw tool holds it once it is finished. */
export function finishShape(input: DrawShapeInput, index: number): DrawShape {
  return {
    ...input,
    id: `shape-${index + 1}`,
    label: `Shape ${index + 1}`,
    done: true,
  };
}
