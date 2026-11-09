import type {
  Feature,
  Geometry,
  LineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import { describe, expect, it } from "vitest";
import {
  measureLineDistance,
  measurePolygonArea,
} from "../spatial/measurement";
import { GeometryError } from "./errors";
import { asFeature, NAIROBI, PARIS, rectangle } from "./fixtures";
import {
  boundingBox,
  boundingBoxToBounds,
  centroid,
  geometryArea,
  geometryLength,
  pointInPolygon,
} from "./queries";

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

const LINE: LineString = {
  type: "LineString",
  coordinates: [
    [2.3, 48.85],
    [2.31, 48.86],
    [2.32, 48.85],
  ],
};

describe("boundingBox", () => {
  it("returns west, south, east, north", () => {
    expect(boundingBox(LINE)).toEqual([2.3, 48.85, 2.32, 48.86]);
  });

  it("covers a point as a box of no size", () => {
    expect(boundingBox({ type: "Point", coordinates: PARIS })).toEqual([
      PARIS[0],
      PARIS[1],
      PARIS[0],
      PARIS[1],
    ]);
  });

  it("covers a polygon, a multipolygon and a collection", () => {
    expect(boundingBox(rectangle(1, 2, 3, 4))).toEqual([1, 2, 3, 4]);
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        (rectangle(1, 2, 3, 4) as Polygon).coordinates,
        (rectangle(10, 20, 11, 21) as Polygon).coordinates,
      ],
    };
    expect(boundingBox(multi)).toEqual([1, 2, 11, 21]);
    expect(
      boundingBox({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: PARIS },
          { type: "Point", coordinates: NAIROBI },
        ],
      }),
    ).toEqual([PARIS[0], NAIROBI[1], NAIROBI[0], PARIS[1]]);
  });

  it("ignores a height", () => {
    expect(
      boundingBox({
        type: "LineString",
        coordinates: [
          [1, 2, 500],
          [3, 4, -20],
        ],
      }),
    ).toEqual([1, 2, 3, 4]);
  });

  it("accepts a feature", () => {
    expect(boundingBox(asFeature(LINE))).toEqual([2.3, 48.85, 2.32, 48.86]);
  });

  it("treats longitude as a flat axis, so shapes split at the antimeridian span the globe", () => {
    const east: Polygon = rectangle(170, -5, 180, 5);
    const west: Polygon = rectangle(-180, -5, -170, 5);
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [east.coordinates, west.coordinates],
    };
    expect(boundingBox(multi)).toEqual([-180, -5, 180, 5]);
  });

  it("refuses an empty geometry and input that is not a geometry", () => {
    expect(
      kindOf(() => boundingBox({ type: "GeometryCollection", geometries: [] })),
    ).toBe("empty");
    expect(kindOf(() => boundingBox({ type: "Point" } as never))).toBe(
      "invalid",
    );
  });
});

describe("boundingBoxToBounds", () => {
  it("names the four edges the way the map port does", () => {
    expect(boundingBoxToBounds([1, 2, 3, 4])).toEqual({
      west: 1,
      south: 2,
      east: 3,
      north: 4,
    });
  });

  it("gives a box a map can fit", () => {
    expect(boundingBoxToBounds(boundingBox(LINE))).toEqual({
      west: 2.3,
      south: 48.85,
      east: 2.32,
      north: 48.86,
    });
  });
});

describe("centroid", () => {
  it("returns the middle of a square", () => {
    expect(centroid(rectangle(0, 0, 4, 2))).toEqual({ lat: 1, lng: 2 });
  });

  it("returns a point as itself", () => {
    expect(centroid({ type: "Point", coordinates: PARIS })).toEqual({
      lat: PARIS[1],
      lng: PARIS[0],
    });
  });

  it("averages the positions of a multipoint", () => {
    const result = centroid({
      type: "MultiPoint",
      coordinates: [
        [0, 0],
        [4, 2],
      ],
    });
    expect(result).toEqual({ lat: 1, lng: 2 });
  });

  it("accepts a feature and a collection", () => {
    expect(centroid(asFeature(rectangle(0, 0, 2, 2)))).toEqual({
      lat: 1,
      lng: 1,
    });
    expect(
      centroid({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [0, 0] },
          { type: "Point", coordinates: [2, 2] },
        ],
      }),
    ).toEqual({ lat: 1, lng: 1 });
  });

  it("refuses an empty geometry", () => {
    expect(
      kindOf(() => centroid({ type: "MultiPoint", coordinates: [] })),
    ).toBe("empty");
  });
});

describe("pointInPolygon", () => {
  const square = rectangle(0, 0, 4, 4);
  const withHole: Polygon = {
    type: "Polygon",
    coordinates: [
      (square as Polygon).coordinates[0] ?? [],
      [
        [1, 1],
        [1, 3],
        [3, 3],
        [3, 1],
        [1, 1],
      ],
    ],
  };

  it("is true inside and false outside", () => {
    expect(pointInPolygon([2, 2], square)).toBe(true);
    expect(pointInPolygon([5, 2], square)).toBe(false);
    expect(pointInPolygon([-0.0001, 2], square)).toBe(false);
  });

  it("counts the boundary as inside unless told to ignore it", () => {
    expect(pointInPolygon([0, 2], square)).toBe(true);
    expect(pointInPolygon([0, 0], square)).toBe(true);
    expect(pointInPolygon([0, 2], square, { ignoreBoundary: true })).toBe(
      false,
    );
    expect(pointInPolygon([2, 2], square, { ignoreBoundary: true })).toBe(true);
  });

  it("is false inside a hole, and true between the hole and the edge", () => {
    expect(pointInPolygon([2, 2], withHole)).toBe(false);
    expect(pointInPolygon([0.5, 0.5], withHole)).toBe(true);
    expect(pointInPolygon([1, 2], withHole)).toBe(true);
    expect(pointInPolygon([1, 2], withHole, { ignoreBoundary: true })).toBe(
      false,
    );
  });

  it("looks through every polygon of a multipolygon", () => {
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        withHole.coordinates,
        (rectangle(10, 10, 12, 12) as Polygon).coordinates,
        [
          [
            [20, 20],
            [20, 26],
            [26, 26],
            [26, 20],
            [20, 20],
          ],
          [
            [21, 21],
            [21, 25],
            [25, 25],
            [25, 21],
            [21, 21],
          ],
        ],
      ],
    };
    expect(pointInPolygon([11, 11], multi)).toBe(true);
    expect(pointInPolygon([0.5, 0.5], multi)).toBe(true);
    expect(pointInPolygon([2, 2], multi)).toBe(false);
    expect(pointInPolygon([22, 22], multi)).toBe(false);
    expect(pointInPolygon([20.5, 22], multi)).toBe(true);
    expect(pointInPolygon([8, 8], multi)).toBe(false);
  });

  it("takes a position, a map position or a point", () => {
    const point: Point = { type: "Point", coordinates: [2, 2] };
    expect(pointInPolygon([2, 2], square)).toBe(true);
    expect(pointInPolygon({ lat: 2, lng: 2 }, square)).toBe(true);
    expect(pointInPolygon(point, square)).toBe(true);
    expect(pointInPolygon({ lat: 2, lng: 9 }, square)).toBe(false);
  });

  it("takes the polygon as a feature", () => {
    expect(pointInPolygon([2, 2], asFeature(square))).toBe(true);
  });

  it("is false for an empty polygon", () => {
    expect(pointInPolygon([2, 2], { type: "Polygon", coordinates: [] })).toBe(
      false,
    );
    expect(
      pointInPolygon([2, 2], { type: "MultiPolygon", coordinates: [] }),
    ).toBe(false);
  });

  it("refuses a polygon that is not an area, and a point that is not valid", () => {
    expect(kindOf(() => pointInPolygon([2, 2], LINE))).toBe("unsupported");
    expect(
      kindOf(() =>
        pointInPolygon([2, 2], {
          type: "GeometryCollection",
          geometries: [square],
        }),
      ),
    ).toBe("unsupported");
    expect(kindOf(() => pointInPolygon([Number.NaN, 2], square))).toBe(
      "invalid",
    );
    expect(kindOf(() => pointInPolygon([200, 2], square))).toBe("invalid");
    expect(kindOf(() => pointInPolygon([2], square))).toBe("invalid");
    expect(
      kindOf(() => pointInPolygon({ type: "Polygon" } as never, square)),
    ).toBe("invalid");
    expect(
      kindOf(() => pointInPolygon({ lat: Number.NaN, lng: 1 }, square)),
    ).toBe("invalid");
    expect(
      kindOf(() =>
        pointInPolygon({ type: "Point", coordinates: [] } as Point, square),
      ),
    ).toBe("invalid");
    expect(kindOf(() => pointInPolygon(undefined as never, square))).toBe(
      "invalid",
    );
    expect(kindOf(() => pointInPolygon({ lat: 1 } as never, square))).toBe(
      "invalid",
    );
    expect(kindOf(() => pointInPolygon(rectangle(0, 0, 1, 1), square))).toBe(
      "invalid",
    );
  });
});

describe("geometryLength", () => {
  it("measures a line in metres, as measureLineDistance does in kilometres", () => {
    const expected = (measureLineDistance(LINE.coordinates) ?? 0) * 1000;
    expect(geometryLength(LINE)).toBeCloseTo(expected, 6);
    expect(geometryLength(LINE)).toBeGreaterThan(2000);
  });

  it("sums the lines of a multilinestring", () => {
    const single = geometryLength(LINE);
    expect(
      geometryLength({
        type: "MultiLineString",
        coordinates: [LINE.coordinates, LINE.coordinates],
      }),
    ).toBeCloseTo(single * 2, 6);
  });

  it("measures the perimeter of a polygon, holes included", () => {
    const outer = rectangle(0, 0, 0.01, 0.01).coordinates[0] ?? [];
    const hole = [
      [0.002, 0.002],
      [0.002, 0.004],
      [0.004, 0.004],
      [0.004, 0.002],
      [0.002, 0.002],
    ];
    const solid = geometryLength(rectangle(0, 0, 0.01, 0.01));
    const holed = geometryLength({
      type: "Polygon",
      coordinates: [outer, hole],
    });
    expect(solid).toBeCloseTo((measureLineDistance(outer) ?? 0) * 1000, 6);
    expect(holed).toBeGreaterThan(solid);
    expect(
      geometryLength({ type: "MultiPolygon", coordinates: [[outer, hole]] }),
    ).toBeCloseTo(holed, 6);
  });

  it("is zero for points, and for nothing", () => {
    expect(geometryLength({ type: "Point", coordinates: PARIS })).toBe(0);
    expect(
      geometryLength({ type: "MultiPoint", coordinates: [PARIS, NAIROBI] }),
    ).toBe(0);
    expect(geometryLength({ type: "LineString", coordinates: [] })).toBe(0);
    expect(geometryLength({ type: "GeometryCollection", geometries: [] })).toBe(
      0,
    );
  });

  it("adds up a collection and accepts a feature", () => {
    const geometry: Geometry = {
      type: "GeometryCollection",
      geometries: [LINE, { type: "Point", coordinates: PARIS }, LINE],
    };
    expect(geometryLength(geometry)).toBeCloseTo(geometryLength(LINE) * 2, 6);
    const feature: Feature = asFeature(LINE);
    expect(geometryLength(feature)).toBeCloseTo(geometryLength(LINE), 6);
  });

  it("refuses input that is not a geometry", () => {
    expect(kindOf(() => geometryLength({ type: "Circle" } as never))).toBe(
      "invalid",
    );
  });
});

describe("geometryArea", () => {
  it("measures a polygon in square metres, as measurePolygonArea does", () => {
    const square = rectangle(2.3, 48.85, 2.31, 48.86);
    const ring = square.coordinates[0] ?? [];
    expect(geometryArea(square)).toBeCloseTo(measurePolygonArea(ring) ?? 0, 3);
    // Roughly 730 m by 1110 m.
    expect(geometryArea(square)).toBeGreaterThan(780_000);
    expect(geometryArea(square)).toBeLessThan(840_000);
  });

  it("takes the holes out", () => {
    const outer = rectangle(0, 0, 0.01, 0.01).coordinates[0] ?? [];
    const hole = [
      [0.002, 0.002],
      [0.002, 0.004],
      [0.004, 0.004],
      [0.004, 0.002],
      [0.002, 0.002],
    ];
    const solid = geometryArea({ type: "Polygon", coordinates: [outer] });
    const holed = geometryArea({ type: "Polygon", coordinates: [outer, hole] });
    expect(holed).toBeCloseTo(solid - (measurePolygonArea(hole) ?? 0), 3);
  });

  it("sums the polygons of a multipolygon and of a collection", () => {
    const one = rectangle(0, 0, 0.01, 0.01);
    const two = rectangle(1, 1, 1.01, 1.01);
    const multi: MultiPolygon = {
      type: "MultiPolygon",
      coordinates: [one.coordinates, two.coordinates],
    };
    expect(geometryArea(multi)).toBeCloseTo(
      geometryArea(one) + geometryArea(two),
      3,
    );
    expect(
      geometryArea({ type: "GeometryCollection", geometries: [one, two] }),
    ).toBeCloseTo(geometryArea(multi), 3);
  });

  it("is zero for anything without an area", () => {
    expect(geometryArea(LINE)).toBe(0);
    expect(geometryArea({ type: "Point", coordinates: PARIS })).toBe(0);
    expect(geometryArea({ type: "Polygon", coordinates: [] })).toBe(0);
    expect(geometryArea({ type: "MultiPolygon", coordinates: [] })).toBe(0);
  });

  it("is zero for a polygon whose corners lie on one line", () => {
    expect(
      geometryArea({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [2, 0],
            [0, 0],
          ],
        ],
      }),
    ).toBe(0);
  });

  it("accepts a feature", () => {
    expect(
      geometryArea(asFeature(rectangle(0, 0, 0.01, 0.01))),
    ).toBeGreaterThan(0);
  });
});
