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
