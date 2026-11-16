// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pointer } from "../json.js";
import type { Position } from "./predicates.js";
import {
  type LeafGeometry,
  leafGeometries,
  matchingPositions,
} from "./walk.js";

function leaf(geometry: unknown): LeafGeometry {
  const [first] = leafGeometries({ type: "Feature", geometry });
  return first as LeafGeometry;
}

const NEGATIVE = (position: Position): boolean => (position[0] as number) < 0;

describe("matchingPositions", () => {
  it("points a Point at its coordinates", () => {
    const found = matchingPositions(
      leaf({ type: "Point", coordinates: [-1, 2] }),
      NEGATIVE,
    );
    expect(found.positions).toEqual([[-1, 2]]);
    expect(found.first).toEqual({
      position: [-1, 2],
      pointer: "/geometry/coordinates",
    });
  });

  it("finds nothing in a Point that is not a position or does not match", () => {
    for (const coordinates of [[], [1, 2], "x", null, [Number.NaN, 1]]) {
      expect(
        matchingPositions(leaf({ type: "Point", coordinates }), NEGATIVE),
      ).toEqual({ positions: [], first: undefined });
    }
  });

  it("points a MultiPoint match at its index and skips unreadable members", () => {
    const found = matchingPositions(
      leaf({
        type: "MultiPoint",
        coordinates: [[1, 1], "x", [-2, 0], [-3, 0]],
      }),
      NEGATIVE,
    );
    expect(found.positions).toEqual([
      [-2, 0],
      [-3, 0],
    ]);
    expect(found.first?.pointer).toBe("/geometry/coordinates/2");
  });

  it("finds nothing in a MultiPoint whose coordinates are not an array", () => {
    expect(
      matchingPositions(
        leaf({ type: "MultiPoint", coordinates: {} }),
        NEGATIVE,
      ),
    ).toEqual({ positions: [], first: undefined });
  });

  it("points a LineString, ring and MultiPolygon match at its place in the document", () => {
    expect(
      matchingPositions(
        leaf({
          type: "LineString",
          coordinates: [
            [1, 0],
            [-1, 0],
          ],
        }),
        NEGATIVE,
      ).first?.pointer,
    ).toBe("/geometry/coordinates/1");
    expect(
      matchingPositions(
        leaf({
          type: "MultiLineString",
          coordinates: [
            [
              [1, 0],
              [2, 0],
            ],
            [
              [1, 0],
              [-1, 0],
            ],
          ],
        }),
        NEGATIVE,
      ).first?.pointer,
    ).toBe("/geometry/coordinates/1/1");
    expect(
      matchingPositions(
        leaf({
          type: "Polygon",
          coordinates: [
            [
              [1, 0],
              [2, 0],
              [2, 1],
              [1, 0],
            ],
            [
              [1, 0],
              [-2, 0],
              [2, 1],
              [1, 0],
            ],
          ],
        }),
        NEGATIVE,
      ).first?.pointer,
    ).toBe("/geometry/coordinates/1/1");
    expect(
      matchingPositions(
        leaf({
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [1, 0],
                [2, 0],
                [-2, 1],
                [1, 0],
              ],
            ],
          ],
        }),
        NEGATIVE,
      ).first?.pointer,
    ).toBe("/geometry/coordinates/0/0/2");
  });

  it("skips a whole run that has a position it cannot read, as the walkers do", () => {
    const found = matchingPositions(
      leaf({
        type: "LineString",
        coordinates: [[-1, 0], "x", [-2, 0]],
      }),
      NEGATIVE,
    );
    expect(found).toEqual({ positions: [], first: undefined });
  });

  it("agrees with testing every position and building every pointer", () => {
    const positionArb = fc.tuple(
      fc.integer({ min: -5, max: 5 }),
      fc.integer({ min: -5, max: 5 }),
    );
    void fc.assert(
      fc.property(
        fc.array(fc.array(positionArb, { minLength: 4, maxLength: 8 }), {
          minLength: 1,
          maxLength: 3,
        }),
        (rings) => {
          const found = matchingPositions(
            leaf({ type: "Polygon", coordinates: rings }),
            NEGATIVE,
          );
          const expected: { position: Position; pointer: string }[] = [];
          rings.forEach((ring, ringIndex) => {
            ring.forEach((position, index) => {
              if (NEGATIVE(position)) {
                expected.push({
                  position,
                  pointer: pointer("/geometry/coordinates", ringIndex, index),
                });
              }
            });
          });
          expect(found.positions).toEqual(expected.map((e) => e.position));
          expect(found.first).toEqual(expected[0]);
        },
      ),
    );
  });
});
