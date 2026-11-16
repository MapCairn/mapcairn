// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { type LeafGeometry, leafGeometries } from "../geometry/walk.js";
import { eachPosition, samplePositions } from "./positionSample.js";

function leaf(geometry: unknown): LeafGeometry {
  const [first] = leafGeometries({ type: "Feature", geometry });
  return first as LeafGeometry;
}

function line(count: number): number[][] {
  return Array.from({ length: count }, (_, index) => [index, index / 2]);
}

function indexOfPointer(pointer: string): number {
  return Number(pointer.split("/").at(-1));
}

describe("samplePositions", () => {
  it("gives a point with the pointer of the coordinates themselves", () => {
    expect(
      samplePositions(leaf({ type: "Point", coordinates: [1, 2] }), 64),
    ).toEqual([{ position: [1, 2], pointer: "/geometry/coordinates" }]);
  });

  it("gives nothing for a point or a line whose coordinates are not readable", () => {
    expect(
      samplePositions(leaf({ type: "Point", coordinates: [] }), 64),
    ).toEqual([]);
    expect(
      samplePositions(leaf({ type: "LineString", coordinates: null }), 64),
    ).toEqual([]);
    expect(
      samplePositions(leaf({ type: "MultiPolygon", coordinates: {} }), 64),
    ).toEqual([]);
    expect(
      samplePositions(leaf({ type: "Polygon", coordinates: "x" }), 64),
    ).toEqual([]);
  });

  it("gives every position of a small geometry, with its pointer", () => {
    const sampled = samplePositions(
      leaf({
        type: "MultiPoint",
        coordinates: [
          [1, 2],
          [3, 4, 5],
        ],
      }),
      64,
    );
    expect(sampled).toEqual([
      { position: [1, 2], pointer: "/geometry/coordinates/0" },
      { position: [3, 4, 5], pointer: "/geometry/coordinates/1" },
    ]);
  });

  it("skips what is not a position and does not count it as sampled", () => {
    const sampled = samplePositions(
      leaf({
        type: "LineString",
        coordinates: [[1, 2], "x", [3], [4, 5], [null, 1]],
      }),
      64,
    );
    expect(sampled.map(({ pointer }) => pointer)).toEqual([
      "/geometry/coordinates/0",
      "/geometry/coordinates/3",
    ]);
  });

  it("gives the pointers of rings in a polygon and a multipolygon", () => {
    const polygon = samplePositions(
      leaf({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
          ],
          [[5, 5]],
        ],
      }),
      64,
    );
    expect(polygon.map(({ pointer }) => pointer)).toEqual([
      "/geometry/coordinates/0/0",
      "/geometry/coordinates/0/1",
      "/geometry/coordinates/1/0",
    ]);
    const multi = samplePositions(
      leaf({
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0]]],
          [
            [[1, 1]],
            [
              [2, 2],
              [3, 3],
            ],
          ],
        ],
      }),
      64,
    );
    expect(multi.map(({ pointer }) => pointer)).toEqual([
      "/geometry/coordinates/0/0/0",
      "/geometry/coordinates/1/0/0",
      "/geometry/coordinates/1/1/0",
      "/geometry/coordinates/1/1/1",
    ]);
  });

  it("skips a ring or a polygon that is not an array", () => {
    expect(
      samplePositions(
        leaf({ type: "Polygon", coordinates: [5, [[1, 2]]] }),
        64,
      ).map(({ pointer }) => pointer),
    ).toEqual(["/geometry/coordinates/1/0"]);
    expect(
      samplePositions(
        leaf({ type: "MultiPolygon", coordinates: [null, [[[1, 2]]]] }),
        64,
      ).map(({ pointer }) => pointer),
    ).toEqual(["/geometry/coordinates/1/0/0"]);
    expect(
      samplePositions(
        leaf({ type: "MultiLineString", coordinates: [[[1, 2]], 7] }),
        64,
      ),
    ).toHaveLength(1);
  });

  it("steps over an empty ring to reach the next one", () => {
    const sampled = samplePositions(
      leaf({
        type: "Polygon",
        coordinates: [[], [[1, 2]], [], [[3, 4]]],
      }),
      64,
    );
    expect(sampled.map(({ pointer }) => pointer)).toEqual([
      "/geometry/coordinates/1/0",
      "/geometry/coordinates/3/0",
    ]);
  });

  it("spreads a large geometry evenly and always keeps the first and the last position", () => {
    const sampled = samplePositions(
      leaf({ type: "LineString", coordinates: line(1000) }),
      64,
    );
    const indices = sampled.map(({ pointer }) => indexOfPointer(pointer));
    expect(indices).toHaveLength(64);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(999);
    expect(new Set(indices).size).toBe(64);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    const steps = indices
      .slice(1)
      .map((value, at) => value - (indices[at] ?? 0));
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1);
  });

  it("samples across the rings of one geometry", () => {
    const rings = [line(40), line(40), line(40)];
    const sampled = samplePositions(
      leaf({ type: "Polygon", coordinates: rings }),
      4,
    );
    expect(sampled.map(({ pointer }) => pointer)).toEqual([
      "/geometry/coordinates/0/0",
      "/geometry/coordinates/1/0",
      "/geometry/coordinates/1/39",
      "/geometry/coordinates/2/39",
    ]);
  });

  it("gives a geometry with exactly the limit whole", () => {
    expect(
      samplePositions(leaf({ type: "LineString", coordinates: line(64) }), 64),
    ).toHaveLength(64);
  });
});

describe("eachPosition", () => {
  it("yields every readable position in order and no others", () => {
    const positions = [
      ...eachPosition(
        leaf({
          type: "MultiLineString",
          coordinates: [[[1, 2], "x"], [[3, 4]]],
        }),
      ),
    ];
    expect(positions).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("yields a point's position", () => {
    expect([
      ...eachPosition(leaf({ type: "Point", coordinates: [7, 8, 9] })),
    ]).toEqual([[7, 8, 9]]);
    expect([
      ...eachPosition(leaf({ type: "Point", coordinates: "no" })),
    ]).toEqual([]);
  });
});
