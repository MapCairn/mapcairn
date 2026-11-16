// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { Position } from "../geometry/predicates.js";
import { type LeafGeometry, leafGeometries } from "../geometry/walk.js";
import {
  fixLeaves,
  identicalPositions,
  mapPositions,
  mapRuns,
  type RunInfo,
} from "./fixSupport.js";

function leaf(type: LeafGeometry["type"], coordinates: unknown): LeafGeometry {
  return { type, coordinates, pointer: "/geometry" };
}

function mark(run: readonly Position[]): readonly Position[] {
  return [...run, [9, 9]];
}

describe("identicalPositions", () => {
  it("compares every element and the length", () => {
    expect(identicalPositions([1, 2], [1, 2])).toBe(true);
    expect(identicalPositions([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(identicalPositions([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(identicalPositions([1, 2], [1, 2, 3])).toBe(false);
    expect(identicalPositions([1, 2, 3], [1, 2])).toBe(false);
  });

  it("treats -0 and 0 as the same number", () => {
    expect(identicalPositions([-0, 0], [0, -0])).toBe(true);
  });
});

describe("mapRuns", () => {
  const infos: RunInfo[] = [];
  const record = (run: readonly Position[], info: RunInfo): Position[] => {
    infos.push(info);
    return [...run];
  };

  it("hands a line to the transform as a line", () => {
    infos.length = 0;
    mapRuns(
      leaf("LineString", [
        [0, 0],
        [1, 1],
      ]),
      record,
    );
    mapRuns(
      leaf("MultiLineString", [
        [
          [0, 0],
          [1, 1],
        ],
      ]),
      record,
    );
    expect(infos).toEqual([
      { kind: "line", isExterior: false },
      { kind: "line", isExterior: false },
    ]);
  });

  it("hands rings to the transform with whether each is the exterior", () => {
    infos.length = 0;
    const ring = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ];
    mapRuns(leaf("Polygon", [ring, ring]), record);
    mapRuns(leaf("MultiPolygon", [[ring], [ring, ring]]), record);
    expect(infos.map((info) => info.isExterior)).toEqual([
      true,
      false,
      true,
      true,
      false,
    ]);
    expect(infos.every((info) => info.kind === "ring")).toBe(true);
  });

  it("returns the very same coordinates when the transform returns every run", () => {
    const coordinates = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ];
    expect(mapRuns(leaf("Polygon", coordinates), (run) => run)).toBe(
      coordinates,
    );
    expect(mapRuns(leaf("MultiPolygon", [coordinates]), (run) => run)).toEqual([
      coordinates,
    ]);
  });

  it("shares the runs the transform leaves alone", () => {
    const first = [
      [0, 0],
      [1, 1],
    ];
    const second = [
      [2, 2],
      [3, 3],
    ];
    const mapped = mapRuns(leaf("MultiLineString", [first, second]), (run) =>
      run === first ? mark(run) : run,
    ) as unknown[];
    expect(mapped[0]).toEqual([...first, [9, 9]]);
    expect(mapped[1]).toBe(second);
  });

  it("skips runs that are not arrays of positions", () => {
    const bad = [[0, 0], [1]];
    const coordinates = [bad, "text", null];
    expect(mapRuns(leaf("Polygon", coordinates), mark)).toBe(coordinates);
    expect(mapRuns(leaf("MultiLineString", coordinates), mark)).toBe(
      coordinates,
    );
    expect(mapRuns(leaf("LineString", bad), mark)).toBe(bad);
    expect(mapRuns(leaf("Polygon", "text"), mark)).toBe("text");
    expect(mapRuns(leaf("MultiPolygon", [null]), mark)).toEqual([null]);
  });

  it("does not touch points", () => {
    const point = [1, 2];
    expect(mapRuns(leaf("Point", point), mark)).toBe(point);
    const points = [[1, 2]];
    expect(mapRuns(leaf("MultiPoint", points), mark)).toBe(points);
  });
});

describe("mapPositions", () => {
  const shift = (position: Position): Position => [
    (position[0] as number) + 1,
    ...position.slice(1),
  ];

  it("maps the position of a point and of a multipoint", () => {
    expect(mapPositions(leaf("Point", [1, 2, 3]), shift)).toEqual([2, 2, 3]);
    expect(
      mapPositions(leaf("MultiPoint", [[1, 2], "text", [3, 4]]), shift),
    ).toEqual([[2, 2], "text", [4, 4]]);
  });

  it("maps every position of lines and rings", () => {
    expect(
      mapPositions(
        leaf("LineString", [
          [0, 0],
          [1, 1],
        ]),
        shift,
      ),
    ).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(
      mapPositions(
        leaf("Polygon", [
          [
            [0, 0],
            [1, 0],
            [0, 0],
          ],
        ]),
        shift,
      ),
    ).toEqual([
      [
        [1, 0],
        [2, 0],
        [1, 0],
      ],
    ]);
  });

  it("returns the same coordinates when every position comes back the same", () => {
    const point = [1, 2];
    const line = [
      [0, 0],
      [1, 1],
    ];
    expect(mapPositions(leaf("Point", point), (position) => position)).toBe(
      point,
    );
    expect(mapPositions(leaf("LineString", line), (position) => position)).toBe(
      line,
    );
  });

  it("leaves unreadable positions alone", () => {
    expect(mapPositions(leaf("Point", "text"), shift)).toBe("text");
    expect(mapPositions(leaf("MultiPoint", "text"), shift)).toBe("text");
    expect(mapPositions(leaf("LineString", [null]), shift)).toEqual([null]);
  });
});

describe("fixLeaves", () => {
  const setToX = (): unknown => "x";

  it("replaces the coordinates of a leaf of a feature and shares the rest", () => {
    const item = {
      type: "Feature",
      id: 7,
      properties: { a: 1 },
      geometry: { type: "Point", coordinates: [1, 2] },
    };
    const fixed = fixLeaves(item, setToX) as typeof item;
    expect(fixed).toEqual({
      ...item,
      geometry: { type: "Point", coordinates: "x" },
    });
    expect(fixed.properties).toBe(item.properties);
  });

  it("replaces the coordinates of a bare geometry", () => {
    expect(fixLeaves({ type: "Point", coordinates: [1, 2] }, setToX)).toEqual({
      type: "Point",
      coordinates: "x",
    });
  });

  it("replaces leaves inside collections, in order, leaving siblings shared", () => {
    const sibling = { type: "Point", coordinates: [1, 1] };
    const item = {
      type: "Feature",
      geometry: {
        type: "GeometryCollection",
        geometries: [
          sibling,
          {
            type: "GeometryCollection",
            geometries: [{ type: "LineString", coordinates: [] }],
          },
        ],
      },
    };
    const seen: string[] = [];
    const fixed = fixLeaves(item, (found) => {
      seen.push(found.pointer);
      return found.type === "LineString" ? "x" : found.coordinates;
    }) as typeof item;
    expect(seen).toEqual([
      "/geometry/geometries/0",
      "/geometry/geometries/1/geometries/0",
    ]);
    expect(fixed.geometry.geometries[0]).toBe(sibling);
    expect(fixed.geometry.geometries[1]).toEqual({
      type: "GeometryCollection",
      geometries: [{ type: "LineString", coordinates: "x" }],
    });
  });

  it("returns the same object when no leaf changed, and for input with no leaves", () => {
    const item = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [1, 2] },
    };
    expect(fixLeaves(item, (found) => found.coordinates)).toBe(item);
    for (const value of [
      null,
      "text",
      3,
      { type: "Feature", geometry: null },
    ]) {
      expect(fixLeaves(value, setToX)).toBe(value);
    }
  });

  it("keeps members of a collection that are not geometries", () => {
    const item = {
      type: "GeometryCollection",
      geometries: [null, { type: "Point", coordinates: [1, 1] }],
    };
    expect(fixLeaves(item, setToX)).toEqual({
      type: "GeometryCollection",
      geometries: [null, { type: "Point", coordinates: "x" }],
    });
  });

  it("follows collections only as deep as the walk does", () => {
    const nested = (depth: number): unknown =>
      depth === 0
        ? { type: "Point", coordinates: [1, 1] }
        : { type: "GeometryCollection", geometries: [nested(depth - 1)] };
    const item = {
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [2, 2] }, nested(40)],
    };
    expect(leafGeometries(item)).toHaveLength(1);
    const fixed = fixLeaves(item, setToX) as typeof item;
    expect(fixed.geometries[0]).toEqual({ type: "Point", coordinates: "x" });
    expect(fixed.geometries[1]).toBe(item.geometries[1]);
  });
});
