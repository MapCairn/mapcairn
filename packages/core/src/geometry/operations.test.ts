// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  Feature,
  Geometry,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import { describe, expect, it } from "vitest";
import { GeometryError } from "./errors";
import { asFeature, haversine, NAIROBI, PARIS, rectangle } from "./fixtures";
import { buffer, difference, intersect, simplify, union } from "./operations";
import { geometryArea } from "./queries";

/** The kind of error `run` raises, or `undefined` when it returns. */
function kindOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(GeometryError);
    return (error as GeometryError).kind;
  }
  return undefined;
}

const PARIS_POINT: Point = { type: "Point", coordinates: PARIS };

describe("buffer", () => {
  it("makes a ring of equal radius around a point", () => {
    const result = buffer(PARIS_POINT, 1000) as Polygon;
    expect(result.type).toBe("Polygon");
    const ring = result.coordinates[0] ?? [];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const vertex of ring) {
      expect(haversine(PARIS, vertex)).toBeGreaterThan(990);
      expect(haversine(PARIS, vertex)).toBeLessThan(1010);
    }
  });

  it("covers close to a circle's area with enough steps", () => {
    const result = buffer(PARIS_POINT, 1000, { steps: 64 }) as Polygon;
    const circle = Math.PI * 1000 ** 2;
    expect(geometryArea(result)).toBeGreaterThan(circle * 0.99);
    expect(geometryArea(result)).toBeLessThan(circle * 1.01);
  });

  it("uses more vertices for more steps", () => {
    const few = buffer(PARIS_POINT, 500, { steps: 2 }) as Polygon;
    const many = buffer(PARIS_POINT, 500, { steps: 16 }) as Polygon;
    expect(many.coordinates[0]?.length).toBeGreaterThan(
      (few.coordinates[0] ?? []).length,
    );
  });

  it("buffers a line into an area that reaches both sides", () => {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [2.3, 48.85],
        [2.31, 48.85],
      ],
    };
    const result = buffer(line, 100) as Polygon;
    expect(result.type).toBe("Polygon");
    expect(geometryArea(result)).toBeGreaterThan(
      haversine([2.3, 48.85], [2.31, 48.85]) * 200 * 0.95,
    );
  });

  it("grows a polygon and shrinks it with a negative distance", () => {
    const square = rectangle(2.3, 48.85, 2.31, 48.86);
    const before = geometryArea(square);
    expect(geometryArea(buffer(square, 100) as Polygon)).toBeGreaterThan(
      before,
    );
    expect(geometryArea(buffer(square, -100) as Polygon)).toBeLessThan(before);
  });

  it("returns null when a negative buffer swallows the polygon", () => {
    expect(buffer(rectangle(2.3, 48.85, 2.301, 48.851), -5000)).toBeNull();
  });

  it("returns a polygon unchanged for a distance of zero", () => {
    const square = rectangle(2.3, 48.85, 2.31, 48.86);
    expect(buffer(square, 0)).toEqual(square);
  });

  it("returns null for a distance of zero around a point or line", () => {
    expect(buffer(PARIS_POINT, 0)).toBeNull();
  });

  it("refuses a negative distance for a point or a line", () => {
    expect(kindOf(() => buffer(PARIS_POINT, -5))).toBe("invalid");
  });

  it("unions the buffers of a collection", () => {
    const result = buffer(
      {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: PARIS },
          { type: "Point", coordinates: [2.3523, 48.8567] },
        ],
      },
      100,
    ) as Polygon;
    expect(result.type).toBe("Polygon");
  });

  it("keeps the pieces of a collection that do not touch", () => {
    const result = buffer(
      {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: PARIS },
          { type: "Point", coordinates: NAIROBI },
        ],
      },
      100,
    );
    expect(result?.type).toBe("MultiPolygon");
  });

  it("buffers a collection of a single member", () => {
    const result = buffer(
      { type: "GeometryCollection", geometries: [PARIS_POINT] },
      100,
    );
    expect(result?.type).toBe("Polygon");
  });

  it("returns null for a collection whose members all vanish", () => {
    expect(
      buffer({ type: "GeometryCollection", geometries: [PARIS_POINT] }, 0),
    ).toBeNull();
  });

  it("accepts a feature", () => {
    expect(buffer(asFeature(PARIS_POINT), 100)?.type).toBe("Polygon");
  });

  it("does not change its input", () => {
    const point: Point = { type: "Point", coordinates: [...PARIS] };
    buffer(point, 100);
    expect(point).toEqual(PARIS_POINT);
  });

  it("refuses an empty geometry", () => {
    expect(kindOf(() => buffer({ type: "Point", coordinates: [] }, 10))).toBe(
      "empty",
    );
  });

  it("refuses a distance that is not finite, and invalid steps", () => {
    expect(kindOf(() => buffer(PARIS_POINT, Number.NaN))).toBe("invalid");
    expect(kindOf(() => buffer(PARIS_POINT, Number.POSITIVE_INFINITY))).toBe(
      "invalid",
    );
    for (const steps of [0, -1, 1.5, 1001, Number.NaN]) {
      expect(kindOf(() => buffer(PARIS_POINT, 10, { steps }))).toBe("invalid");
    }
  });

  it("refuses input that is not a geometry", () => {
    expect(kindOf(() => buffer({ type: "Circle" } as never, 10))).toBe(
      "invalid",
    );
  });

  it("refuses a buffer that would cross the antimeridian", () => {
    expect(
      kindOf(() => buffer({ type: "Point", coordinates: [179.9999, 0] }, 5000)),
    ).toBe("unsupported");
    expect(
      kindOf(() =>
        buffer({ type: "Point", coordinates: [-179.9999, 10] }, 5000),
      ),
    ).toBe("unsupported");
  });

  it("refuses a buffer around an edge longer than half the globe", () => {
    expect(
      kindOf(() =>
        buffer(
          {
            type: "LineString",
            coordinates: [
              [-170, 0],
              [170, 0],
            ],
          },
          1000,
        ),
      ),
    ).toBe("unsupported");
  });

  it("refuses a buffer that would enclose a pole", () => {
    expect(
      kindOf(() => buffer({ type: "Point", coordinates: [0, 89.99] }, 5000)),
    ).toBe("unsupported");
  });
});

describe("union", () => {
  const left = rectangle(0, 0, 2, 2);
  const right = rectangle(1, 0, 3, 2);

  it("merges overlapping polygons into one", () => {
    const result = union([left, right]) as Polygon;
    expect(result.type).toBe("Polygon");
    expect(geometryArea(result)).toBeCloseTo(
      geometryArea(rectangle(0, 0, 3, 2)),
      -3,
    );
  });

  it("keeps separate polygons as a multipolygon", () => {
    const result = union([left, rectangle(10, 10, 11, 11)]) as MultiPolygon;
    expect(result.type).toBe("MultiPolygon");
    expect(result.coordinates).toHaveLength(2);
  });

  it("merges any number of polygons, and features", () => {
    const result = union([
      left,
      asFeature(right),
      rectangle(2.5, 0, 4, 2),
    ]) as Polygon;
    expect(result.type).toBe("Polygon");
  });

  it("accepts a multipolygon", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        (left as Polygon).coordinates,
        (rectangle(10, 10, 11, 11) as Polygon).coordinates,
      ],
    };
    expect(union([multi, right]).type).toBe("MultiPolygon");
  });

  it("returns a single polygon as it is", () => {
    expect(union([left])).toEqual(left);
  });

  it("refuses no input, empty input and input that is not an area", () => {
    expect(kindOf(() => union([]))).toBe("empty");
    expect(
      kindOf(() => union([left, { type: "Polygon", coordinates: [] }])),
    ).toBe("empty");
    expect(kindOf(() => union([left, PARIS_POINT]))).toBe("unsupported");
    expect(kindOf(() => union([left, { type: "Circle" } as never]))).toBe(
      "invalid",
    );
  });
});

describe("intersect", () => {
  it("returns the area two polygons share", () => {
    const result = intersect(
      rectangle(0, 0, 2, 2),
      rectangle(1, 1, 3, 3),
    ) as Polygon;
    expect(result.type).toBe("Polygon");
    expect(geometryArea(result)).toBeCloseTo(
      geometryArea(rectangle(1, 1, 2, 2)),
      -3,
    );
  });

  it("returns null when they do not meet", () => {
    expect(intersect(rectangle(0, 0, 1, 1), rectangle(5, 5, 6, 6))).toBeNull();
  });

  it("accepts features and multipolygons", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [(rectangle(0, 0, 2, 2) as Polygon).coordinates],
    };
    expect(intersect(asFeature(multi), rectangle(1, 1, 3, 3))).not.toBeNull();
  });

  it("refuses empty input and input that is not an area", () => {
    expect(
      kindOf(() =>
        intersect(
          { type: "MultiPolygon", coordinates: [] },
          rectangle(0, 0, 1, 1),
        ),
      ),
    ).toBe("empty");
    expect(kindOf(() => intersect(rectangle(0, 0, 1, 1), PARIS_POINT))).toBe(
      "unsupported",
    );
  });
});

describe("difference", () => {
  it("cuts the second polygon out of the first", () => {
    const result = difference(
      rectangle(0, 0, 2, 2),
      rectangle(1, 0, 3, 2),
    ) as Polygon;
    expect(geometryArea(result)).toBeCloseTo(
      geometryArea(rectangle(0, 0, 1, 2)),
      -3,
    );
  });

  it("leaves a hole when the second polygon sits inside", () => {
    const result = difference(
      rectangle(0, 0, 4, 4),
      rectangle(1, 1, 2, 2),
    ) as Polygon;
    expect(result.type).toBe("Polygon");
    expect(result.coordinates).toHaveLength(2);
  });

  it("returns null when nothing is left", () => {
    expect(difference(rectangle(1, 1, 2, 2), rectangle(0, 0, 4, 4))).toBeNull();
  });

  it("returns the first polygon when they do not meet", () => {
    const first = rectangle(0, 0, 1, 1);
    expect(difference(first, rectangle(5, 5, 6, 6))).toEqual(first);
  });

  it("refuses empty input and input that is not an area", () => {
    expect(
      kindOf(() =>
        difference(rectangle(0, 0, 1, 1), { type: "Polygon", coordinates: [] }),
      ),
    ).toBe("empty");
    expect(kindOf(() => difference(PARIS_POINT, rectangle(0, 0, 1, 1)))).toBe(
      "unsupported",
    );
  });
});

describe("simplify", () => {
  /** A line east along the equator with a small kink every 100 m. */
  function kinked(offsetLat: number, offsetLng = 0): LineString {
    return {
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.0009 + offsetLng, offsetLat],
        [0.0018, 0],
      ],
    };
  }

  it("drops vertices closer to the line than the tolerance", () => {
    // About 5.5 m of offset from a straight line.
    const result = simplify(kinked(0.00005), 20) as LineString;
    expect(result.coordinates).toEqual([
      [0, 0],
      [0.0018, 0],
    ]);
  });

  it("keeps vertices further from the line than the tolerance", () => {
    const result = simplify(kinked(0.00005), 2) as LineString;
    expect(result.coordinates).toHaveLength(3);
  });

  it("measures the tolerance in metres in every direction", () => {
    // 50 m of offset: sideways at 60 degrees north, where a degree of
    // longitude is half as long as a degree of latitude, and lengthways.
    const metres = 50;
    const dLat = metres / 111_195;
    const dLng = metres / (111_195 * Math.cos((60 * Math.PI) / 180));
    const eastWest: LineString = {
      type: "LineString",
      coordinates: [
        [10, 60],
        [10 + 0.002, 60 + dLat],
        [10 + 0.004, 60],
      ],
    };
    const northSouth: LineString = {
      type: "LineString",
      coordinates: [
        [10, 60],
        [10 + dLng, 60.002],
        [10, 60.004],
      ],
    };
    for (const line of [eastWest, northSouth]) {
      expect((simplify(line, 40) as LineString).coordinates).toHaveLength(3);
      expect((simplify(line, 60) as LineString).coordinates).toHaveLength(2);
    }
  });

  it("returns a copy for a tolerance of zero", () => {
    const line = kinked(0.00005);
    const result = simplify(line, 0);
    expect(result).toEqual(line);
    expect(result).not.toBe(line);
  });

  it("does not change its input", () => {
    const line = kinked(0.00005);
    const copy = structuredClone(line);
    simplify(line, 50);
    expect(line).toEqual(copy);
  });

  it("keeps a polygon a closed ring of at least four positions", () => {
    const wavy: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.001, 0.00001],
          [0.002, 0],
          [0.002, 0.002],
          [0.001, 0.00199],
          [0, 0.002],
          [0, 0],
        ],
      ],
    };
    const result = simplify(wavy, 5) as Polygon;
    const ring = result.coordinates[0] ?? [];
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring.length).toBeLessThan(7);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("simplifies every member of a multipolygon and a collection", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [(rectangle(0, 0, 0.01, 0.01) as Polygon).coordinates],
    };
    expect(simplify(multi, 1).type).toBe("MultiPolygon");
    const collection: Geometry = {
      type: "GeometryCollection",
      geometries: [PARIS_POINT, kinked(0.00005)],
    };
    const result = simplify(collection, 20);
    expect(result.type).toBe("GeometryCollection");
    expect((result as { geometries: Geometry[] }).geometries[1]).toEqual({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.0018, 0],
      ],
    });
  });

  it("simplifies a collection inside a collection", () => {
    const result = simplify(
      {
        type: "GeometryCollection",
        geometries: [
          {
            type: "GeometryCollection",
            geometries: [kinked(0.00005), { type: "Point", coordinates: [] }],
          },
        ],
      },
      20,
    ) as { geometries: { geometries: Geometry[] }[] };
    expect(result.geometries[0]?.geometries[0]).toEqual({
      type: "LineString",
      coordinates: [
        [0, 0],
        [0.0018, 0],
      ],
    });
    expect(result.geometries[0]?.geometries[1]).toEqual({
      type: "Point",
      coordinates: [],
    });
  });

  it("leaves points alone", () => {
    expect(simplify(PARIS_POINT, 100)).toEqual(PARIS_POINT);
    expect(
      simplify({ type: "MultiPoint", coordinates: [PARIS, NAIROBI] }, 100),
    ).toEqual({ type: "MultiPoint", coordinates: [PARIS, NAIROBI] });
  });

  it("accepts a feature and returns its geometry", () => {
    const feature: Feature = asFeature(kinked(0.00005));
    expect(simplify(feature, 20).type).toBe("LineString");
  });

  it("returns a shape with no area, or no length, as it is", () => {
    const flat: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 0],
        ],
      ],
    };
    const dot: LineString = {
      type: "LineString",
      coordinates: [
        [1, 1],
        [1, 1],
      ],
    };
    expect(simplify(flat, 10)).toEqual(flat);
    expect(simplify(dot, 10)).toEqual(dot);
  });

  it("keeps the height of the positions it keeps", () => {
    const result = simplify(
      {
        type: "LineString",
        coordinates: [
          [0, 0, 5],
          [0.0009, 0.00005, 6],
          [0.0018, 0, 7],
        ],
      },
      20,
    );
    expect((result as LineString).coordinates).toEqual([
      [0, 0, 5],
      [0.0018, 0, 7],
    ]);
  });

  it("leaves an empty member of a collection empty", () => {
    const result = simplify(
      {
        type: "GeometryCollection",
        geometries: [{ type: "LineString", coordinates: [] }, PARIS_POINT],
      },
      20,
    ) as { geometries: Geometry[] };
    expect(result.geometries[0]).toEqual({
      type: "LineString",
      coordinates: [],
    });
  });

  it("copes with a shape at a pole", () => {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [0, 90],
        [90, 90],
        [180, 90],
      ],
    };
    expect(simplify(line, 10).type).toBe("LineString");
  });

  it("refuses a tolerance that is negative or not finite", () => {
    for (const tolerance of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(kindOf(() => simplify(kinked(0), tolerance))).toBe("invalid");
    }
  });

  it("refuses an empty geometry", () => {
    expect(
      kindOf(() => simplify({ type: "LineString", coordinates: [] }, 10)),
    ).toBe("empty");
  });
});
