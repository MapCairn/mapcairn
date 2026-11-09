import type { Feature, Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { GeometryError } from "./errors";
import { formatWkt, parseWkt } from "./wkt";

const SQUARE = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
];
const HOLE = [
  [1, 1],
  [1, 2],
  [2, 2],
  [2, 1],
  [1, 1],
];

/** One GeoJSON geometry and the canonical WKT text that stands for it. */
const CASES: ReadonlyArray<readonly [string, Geometry, string]> = [
  [
    "a point",
    { type: "Point", coordinates: [2.3522, 48.8566] },
    "POINT (2.3522 48.8566)",
  ],
  [
    "a point with a height",
    { type: "Point", coordinates: [36.8219, -1.2921, 1795] },
    "POINT Z (36.8219 -1.2921 1795)",
  ],
  [
    "a line",
    {
      type: "LineString",
      coordinates: [
        [30, 10],
        [10, 30],
        [40, 40],
      ],
    },
    "LINESTRING (30 10, 10 30, 40 40)",
  ],
  [
    "a polygon",
    { type: "Polygon", coordinates: [SQUARE] },
    "POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0))",
  ],
  [
    "a polygon with a hole",
    { type: "Polygon", coordinates: [SQUARE, HOLE] },
    "POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 1 2, 2 2, 2 1, 1 1))",
  ],
  [
    "several points",
    {
      type: "MultiPoint",
      coordinates: [
        [10, 40],
        [40, 30],
      ],
    },
    "MULTIPOINT ((10 40), (40 30))",
  ],
  [
    "several lines",
    {
      type: "MultiLineString",
      coordinates: [
        [
          [10, 10],
          [20, 20],
        ],
        [
          [40, 40],
          [30, 30],
          [40, 20],
        ],
      ],
    },
    "MULTILINESTRING ((10 10, 20 20), (40 40, 30 30, 40 20))",
  ],
  [
    "several polygons",
    {
      type: "MultiPolygon",
      coordinates: [[SQUARE], [SQUARE, HOLE]],
    },
    "MULTIPOLYGON (((0 0, 4 0, 4 4, 0 4, 0 0)), ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 1 2, 2 2, 2 1, 1 1)))",
  ],
  [
    "a collection",
    {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [4, 6] },
        {
          type: "LineString",
          coordinates: [
            [4, 6],
            [7, 10],
          ],
        },
      ],
    },
    "GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))",
  ],
  [
    "a collection inside a collection",
    {
      type: "GeometryCollection",
      geometries: [
        {
          type: "GeometryCollection",
          geometries: [{ type: "Point", coordinates: [1, 2] }],
        },
        { type: "Polygon", coordinates: [SQUARE] },
      ],
    },
    "GEOMETRYCOLLECTION (GEOMETRYCOLLECTION (POINT (1 2)), POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0)))",
  ],
  ["an empty point", { type: "Point", coordinates: [] }, "POINT EMPTY"],
  [
    "an empty line",
    { type: "LineString", coordinates: [] },
    "LINESTRING EMPTY",
  ],
  ["an empty polygon", { type: "Polygon", coordinates: [] }, "POLYGON EMPTY"],
  [
    "an empty multipoint",
    { type: "MultiPoint", coordinates: [] },
    "MULTIPOINT EMPTY",
  ],
  [
    "an empty multiline",
    { type: "MultiLineString", coordinates: [] },
    "MULTILINESTRING EMPTY",
  ],
  [
    "an empty multipolygon",
    { type: "MultiPolygon", coordinates: [] },
    "MULTIPOLYGON EMPTY",
  ],
  [
    "an empty collection",
    { type: "GeometryCollection", geometries: [] },
    "GEOMETRYCOLLECTION EMPTY",
  ],
];

describe("formatWkt", () => {
  for (const [name, geometry, wkt] of CASES) {
    it(`writes ${name}`, () => {
      expect(formatWkt(geometry)).toBe(wkt);
    });
  }

  it("writes the geometry of a feature", () => {
    const feature: Feature = {
      type: "Feature",
      properties: { name: "ignored" },
      geometry: { type: "Point", coordinates: [1, 2] },
    };
    expect(formatWkt(feature)).toBe("POINT (1 2)");
  });

  it("rounds to a number of decimal places when asked", () => {
    const point: Geometry = {
      type: "Point",
      coordinates: [2.352222, 48.85661],
    };
    expect(formatWkt(point, { precision: 3 })).toBe("POINT (2.352 48.857)");
    expect(formatWkt(point, { precision: 0 })).toBe("POINT (2 49)");
  });

  it("writes tiny and huge numbers in a form the parser reads back", () => {
    const point: Geometry = { type: "Point", coordinates: [1e-7, 1e21] };
    expect(parseWkt(formatWkt(point))).toEqual(point);
  });

  it("never writes a negative zero", () => {
    const point: Geometry = { type: "Point", coordinates: [-0, 0] };
    expect(formatWkt(point)).toBe("POINT (0 0)");
  });

  it("refuses a feature with no geometry", () => {
    const feature: Feature<null> = {
      type: "Feature",
      properties: {},
      geometry: null,
    };
    expect(() => formatWkt(feature)).toThrow(GeometryError);
  });

  it("refuses a shape that is not valid GeoJSON", () => {
    expect(() =>
      formatWkt({ type: "Point", coordinates: [Number.NaN, 0] } as Geometry),
    ).toThrow(GeometryError);
    expect(() => formatWkt({ type: "Circle" } as unknown as Geometry)).toThrow(
      GeometryError,
    );
  });

  it("refuses a precision that is not a whole number from 0 to 20", () => {
    const point: Geometry = { type: "Point", coordinates: [1, 2] };
    expect(() => formatWkt(point, { precision: -1 })).toThrow(GeometryError);
    expect(() => formatWkt(point, { precision: 1.5 })).toThrow(GeometryError);
    expect(() => formatWkt(point, { precision: 21 })).toThrow(GeometryError);
  });
});

describe("parseWkt", () => {
  for (const [name, geometry, wkt] of CASES) {
    it(`reads ${name}`, () => {
      expect(parseWkt(wkt)).toEqual(geometry);
    });
  }

  it("round trips every case through WKT and back", () => {
    for (const [, geometry] of CASES) {
      expect(parseWkt(formatWkt(geometry))).toEqual(geometry);
    }
  });

  it("round trips canonical text through GeoJSON and back", () => {
    for (const [, , wkt] of CASES) {
      expect(formatWkt(parseWkt(wkt))).toBe(wkt);
    }
  });

  it("ignores case and the spacing between tokens", () => {
    expect(parseWkt("point(30 10)")).toEqual({
      type: "Point",
      coordinates: [30, 10],
    });
    expect(parseWkt("  Point\n\t(  30   10  )  ")).toEqual({
      type: "Point",
      coordinates: [30, 10],
    });
    expect(parseWkt("LineString(1 2,3 4)")).toEqual({
      type: "LineString",
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
  });

  it("reads numbers in every form WKT allows", () => {
    expect(parseWkt("POINT (+1.5 -.5)")).toEqual({
      type: "Point",
      coordinates: [1.5, -0.5],
    });
    expect(parseWkt("POINT (5. 1E3)")).toEqual({
      type: "Point",
      coordinates: [5, 1000],
    });
    expect(parseWkt("POINT (1.5e-3 -2E+2)")).toEqual({
      type: "Point",
      coordinates: [0.0015, -200],
    });
  });

  it("reads a height with or without the Z tag", () => {
    const expected = { type: "Point", coordinates: [1, 2, 3] };
    expect(parseWkt("POINT Z (1 2 3)")).toEqual(expected);
    expect(parseWkt("POINTZ(1 2 3)")).toEqual(expected);
    expect(parseWkt("POINT (1 2 3)")).toEqual(expected);
  });

  it("reads an empty shape that carries the Z tag", () => {
    expect(parseWkt("POINT Z EMPTY")).toEqual({
      type: "Point",
      coordinates: [],
    });
    expect(parseWkt("POINT empty")).toEqual({ type: "Point", coordinates: [] });
  });

  it("refuses a Z tag over positions with two numbers", () => {
    expect(() => parseWkt("POINT Z (1 2)")).toThrow(GeometryError);
  });

  it("refuses a word it does not know between the type and the bracket", () => {
    expect(() => parseWkt("POINT FOO (1 2)")).toThrow(/position 7/);
  });

  it("reads a multipoint with bare or bracketed members", () => {
    const expected = {
      type: "MultiPoint",
      coordinates: [
        [10, 40],
        [40, 30],
      ],
    };
    expect(parseWkt("MULTIPOINT (10 40, 40 30)")).toEqual(expected);
    expect(parseWkt("MULTIPOINT ((10 40), (40 30))")).toEqual(expected);
  });

  it("reads WKT whose coordinates are not degrees", () => {
    expect(parseWkt("POINT (261845.8 6250056)")).toEqual({
      type: "Point",
      coordinates: [261845.8, 6250056],
    });
  });

  /** The kind of error `text` raises, or `undefined` when it parses. */
  function kindOf(text: string): string | undefined {
    try {
      parseWkt(text);
    } catch (error) {
      return (error as GeometryError).kind;
    }
    return undefined;
  }

  const MALFORMED = [
    "",
    "   ",
    "POINT",
    "POINT (",
    "POINT ()",
    "POINT (1)",
    "POINT (1 2",
    "POINT 1 2",
    "POINT (1 2))",
    "POINT (1 2) POINT (3 4)",
    "POINT (1 2) trailing",
    "POINT (a b)",
    "POINT (1,2)",
    "POINT (1 2, 3 4)",
    "POINT ((1 2))",
    "POINT (1 2 3 4)",
    "POINT (--1 2)",
    "POINT (1..2 3)",
    "POINT (1e 2)",
    "POINT (1e+ 2)",
    "POINT (1.2.3 4)",
    "POINT (1 2e5e5)",
    "POINT (. 2)",
    "POINT (+ 2)",
    "POINT (1e999 0)",
    "POINT (NaN 0)",
    "POINT (Infinity 0)",
    "POINT EMPTY EMPTY",
    "POINT (1 2) ;",
    "SRID=4326;POINT (1 2)",
    "LINESTRING (1 2)",
    "LINESTRING (1 2,, 3 4)",
    "LINESTRING (1 2, 3 4,)",
    "LINESTRING (, 1 2, 3 4)",
    "LINESTRING ((1 2, 3 4))",
    "LINESTRING (1 2, 3 4 5)",
    "POLYGON (0 0, 1 0, 1 1, 0 0)",
    "POLYGON ((0 0, 1 0, 1 1))",
    "POLYGON ((0 0, 1 0, 1 1, 0 1))",
    "POLYGON ((0 0, 1 0, 1 1, 0 0), )",
    "MULTIPOINT ((1 2), 3 4)",
    "MULTIPOLYGON ((0 0, 1 0, 1 1, 0 0))",
    "GEOMETRYCOLLECTION (POINT (1 2),)",
    "GEOMETRYCOLLECTION (1 2)",
    "GEOMETRYCOLLECTION (POINT (1 2)",
    "\u0000",
    "POINT (1 2)\u0000",
    "POINT (１ ２)",
  ];

  for (const text of MALFORMED) {
    it(`refuses ${JSON.stringify(text)} as invalid`, () => {
      expect(() => parseWkt(text)).toThrow(GeometryError);
      expect(kindOf(text)).toBe("invalid");
    });
  }

  const UNSUPPORTED = [
    "POINT M (1 2 3)",
    "POINT ZM (1 2 3 4)",
    "TRIANGLE ((0 0, 1 0, 0 1, 0 0))",
    "CIRCULARSTRING (0 0, 1 1, 2 0)",
    "POINTM (1 2 3)",
    "POINTZM (1 2 3 4)",
    "LINESTRING M (1 2 3, 4 5 6)",
  ];

  for (const text of UNSUPPORTED) {
    it(`refuses ${JSON.stringify(text)} as unsupported`, () => {
      expect(kindOf(text)).toBe("unsupported");
    });
  }

  it("refuses text that is not a string", () => {
    expect(() => parseWkt(undefined as unknown as string)).toThrow(
      GeometryError,
    );
    expect(() => parseWkt(42 as unknown as string)).toThrow(GeometryError);
  });

  it("says where it stopped", () => {
    expect(() => parseWkt("POINT (1 x)")).toThrow(/position 10/);
  });

  it("refuses a collection nested past a sensible depth, without overflowing the stack", () => {
    const depth = 50_000;
    const text = `${"GEOMETRYCOLLECTION (".repeat(depth)}POINT (1 2)${")".repeat(depth)}`;
    expect(() => parseWkt(text)).toThrow(GeometryError);
  });

  it("accepts a collection nested a few levels", () => {
    const depth = 8;
    const text = `${"GEOMETRYCOLLECTION (".repeat(depth)}POINT (1 2)${")".repeat(depth)}`;
    expect(parseWkt(text).type).toBe("GeometryCollection");
  });
});

/**
 * Hostile input: every case below would take minutes, not milliseconds, if
 * parsing backtracked. Each runs once with a large input and a generous
 * absolute limit, so a quadratic parser fails and a linear one passes with a
 * wide margin on a slow machine.
 */
describe("parseWkt on hostile input", () => {
  const LIMIT_MS = 1500;
  const SIZE = 500_000;

  /** Runs `text` through the parser and returns how long it took. */
  function time(text: string): { elapsed: number; failed: boolean } {
    const start = performance.now();
    let failed = false;
    try {
      parseWkt(text);
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryError);
      failed = true;
    }
    return { elapsed: performance.now() - start, failed };
  }

  it("reads a very long run of spaces", () => {
    const result = time(`POINT (${" ".repeat(SIZE)}1${" ".repeat(SIZE)}2)`);
    expect(result.failed).toBe(false);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("reads a very long run of digits", () => {
    const result = time(`POINT (${"1".repeat(SIZE)} 2)`);
    // The value overflows to infinity, so it is refused, quickly.
    expect(result.failed).toBe(true);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("reads a long run of digits after the decimal point", () => {
    const result = time(`POINT (0.${"1".repeat(SIZE)} 2)`);
    expect(result.failed).toBe(false);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("refuses a long run of digits that ends in a bad character", () => {
    const result = time(`POINT (${"1".repeat(SIZE)}x 2)`);
    expect(result.failed).toBe(true);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("refuses a long run of signs, points and exponent marks", () => {
    for (const run of ["-", "+", ".", "e", "1e", "1.", "-.", "1e+"]) {
      const result = time(`POINT (${run.repeat(SIZE)} 2)`);
      expect(result.failed).toBe(true);
      expect(result.elapsed).toBeLessThan(LIMIT_MS);
    }
  });

  it("refuses a long run of opening or closing brackets", () => {
    for (const bracket of ["(", ")"]) {
      const result = time(`POINT ${bracket.repeat(SIZE)}`);
      expect(result.failed).toBe(true);
      expect(result.elapsed).toBeLessThan(LIMIT_MS);
    }
  });

  it("refuses a very long keyword", () => {
    const result = time(`${"P".repeat(SIZE)} (1 2)`);
    expect(result.failed).toBe(true);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("reads a very long list of coordinates", () => {
    const positions = Array.from({ length: 100_000 }, (_, i) => `${i} ${i}`);
    const result = time(`LINESTRING (${positions.join(", ")})`);
    expect(result.failed).toBe(false);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("refuses a very long list that is cut short", () => {
    const positions = Array.from({ length: 100_000 }, (_, i) => `${i} ${i}`);
    const result = time(`LINESTRING (${positions.join(", ")}`);
    expect(result.failed).toBe(true);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });
});
