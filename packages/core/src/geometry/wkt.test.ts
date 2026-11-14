// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { failureOf } from "../propertyTesting/failureOf";
import { GeometryError } from "./errors";
import {
  formatWkt,
  parseWkt,
  readWktRecovering,
  readWktSequence,
  startsLikeWkt,
  UnsupportedSridError,
} from "./wkt";

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

  it("writes every number as plain decimal text, with no exponent", () => {
    const point: Geometry = { type: "Point", coordinates: [7.8e-7, -1e21] };
    expect(formatWkt(point)).toBe(`POINT (0.00000078 -1${"0".repeat(21)})`);
    expect(formatWkt({ type: "Point", coordinates: [1e-9, 2.5e-8] })).toBe(
      "POINT (0.000000001 0.000000025)",
    );
    expect(
      formatWkt(
        { type: "Point", coordinates: [1.23456789e-7, 5] },
        { precision: 8 },
      ),
    ).toBe("POINT (0.00000012 5)");
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
    "SRID=;POINT (1 2)",
    "SRID=abc;POINT (1 2)",
    "SRID 4326;POINT (1 2)",
    "SRID=4326 POINT (1 2)",
    "SRID=4326;",
    "SRID=4326;POINT (1 2) SRID=4326;",
    "SRID=4326;SRID=4326;POINT (1 2)",
    "GEOMETRYCOLLECTION (SRID=4326;POINT (1 2))",
    "GEOMETRYCOLLECTION (POINT (1 2), SRID=4326;POINT (3 4))",
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
  const LIMIT_MS = 5000;
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

  it("refuses a long run of SRID prefixes, one after another", () => {
    const result = time(`${"SRID=4326;".repeat(SIZE / 10)}POINT (1 2)`);
    expect(result.failed).toBe(true);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("refuses an SRID that is a very long run of digits", () => {
    const result = time(`SRID=${"4".repeat(SIZE)};POINT (1 2)`);
    expect(result.failed).toBe(true);
    expect(result.elapsed).toBeLessThan(LIMIT_MS);
  });

  it("refuses a long run of semicolons, equals signs or prefix parts", () => {
    for (const mark of [";", "=", "SRID=", "SRID=4326;"]) {
      for (const text of [mark.repeat(SIZE), `SRID=${mark.repeat(SIZE)}`]) {
        const result = time(`${text}POINT (1 2)`);
        expect(result.failed).toBe(true);
        expect(result.elapsed).toBeLessThan(LIMIT_MS);
      }
    }
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

describe("the axis order", () => {
  it("reads longitude then latitude unless told otherwise", () => {
    expect(parseWkt("POINT (2 48)")).toEqual({
      type: "Point",
      coordinates: [2, 48],
    });
    expect(parseWkt("POINT (2 48)", { axisOrder: "lng-lat" })).toEqual({
      type: "Point",
      coordinates: [2, 48],
    });
  });

  it("swaps every position when the text is latitude then longitude, keeping a height last", () => {
    expect(parseWkt("POINT Z (48 2 100)", { axisOrder: "lat-lng" })).toEqual({
      type: "Point",
      coordinates: [2, 48, 100],
    });
    expect(
      parseWkt("MULTILINESTRING ((48 2, 49 3), (50 4, 51 5))", {
        axisOrder: "lat-lng",
      }),
    ).toEqual({
      type: "MultiLineString",
      coordinates: [
        [
          [2, 48],
          [3, 49],
        ],
        [
          [4, 50],
          [5, 51],
        ],
      ],
    });
  });
});

describe("EWKT", () => {
  /** The error `text` raises, or `undefined` when it parses. */
  function errorOf(text: string): GeometryError | undefined {
    try {
      parseWkt(text);
    } catch (error) {
      return error as GeometryError;
    }
    return undefined;
  }

  /** The kind of error `text` raises, or `undefined` when it parses. */
  function kindOf(text: string): string | undefined {
    return errorOf(text)?.kind;
  }

  it("reads an SRID prefix of 4326, whatever its case or spacing", () => {
    const point = { type: "Point", coordinates: [2, 48] };
    expect(parseWkt("SRID=4326;POINT (2 48)")).toEqual(point);
    expect(parseWkt("srid = 4326 ; point(2 48)")).toEqual(point);
  });

  it("applies the axis order after the prefix", () => {
    expect(
      parseWkt("SRID=4326;POINT (48 2)", { axisOrder: "lat-lng" }),
    ).toEqual({ type: "Point", coordinates: [2, 48] });
  });

  it("reads a prefix before each geometry of a sequence", () => {
    expect(
      readWktSequence("SRID=4326;POINT (1 2)\nSRID=4326;LINESTRING (0 0, 1 1)"),
    ).toEqual([
      { type: "Point", coordinates: [1, 2] },
      {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
    ]);
  });

  it("refuses any other SRID with a plain message", () => {
    expect(() => parseWkt("SRID=3857;POINT (261845.8 6250056)")).toThrow(
      "Only SRID 4326 (WGS 84) is supported, not SRID 3857.",
    );
    expect(() => parseWkt("SRID=3857;POINT (1 2)")).toThrow(GeometryError);
    expect(kindOf("SRID=3857;POINT (1 2)")).toBe("unsupported");
  });

  it("names the SRID it refused on the error, so a caller can tell it from a curve", () => {
    for (const [text, srid] of [
      ["SRID=3857;POINT (1 2)", 3857],
      ["SRID=0;POINT (1 2)", 0],
      ["SRID=123456789;POINT (1 2)", 123_456_789],
    ] as const) {
      const error = errorOf(text);
      expect(error).toBeInstanceOf(UnsupportedSridError);
      expect((error as UnsupportedSridError).srid).toBe(srid);
      expect(error?.kind).toBe("unsupported");
    }
    expect(errorOf("CIRCULARSTRING (0 0, 1 1, 2 0)")).not.toBeInstanceOf(
      UnsupportedSridError,
    );
  });

  it("reads a prefix before every kind of geometry, empty or not", () => {
    for (const text of [
      "POINT (1 2)",
      "MULTIPOINT ((1 2), (3 4))",
      "MULTIPOLYGON (((0 0, 4 0, 4 4, 0 0)))",
      "GEOMETRYCOLLECTION (POINT (1 2))",
      "GEOMETRYCOLLECTION EMPTY",
    ]) {
      expect(parseWkt(`SRID=4326;${text}`)).toEqual(parseWkt(text));
    }
  });

  it("refuses a prefix inside a collection, where only a whole geometry may carry one", () => {
    for (const text of [
      "GEOMETRYCOLLECTION (SRID=4326;POINT (1 2))",
      "SRID=4326;GEOMETRYCOLLECTION (SRID=4326;POINT (1 2))",
    ]) {
      expect(kindOf(text)).toBe("invalid");
      expect(() => readWktSequence(text)).toThrow(GeometryError);
    }
  });

  it("refuses an SRID that is not a plain run of at most nine digits, as invalid", () => {
    for (const srid of [
      "4326.0",
      "+4326",
      "-1",
      "4326e0",
      "4.326e3",
      "1e21",
      "1234567890",
      "9".repeat(40),
      "",
      "abc",
    ]) {
      const text = `SRID=${srid};POINT (1 2)`;
      expect(kindOf(text), text).toBe("invalid");
      expect(() => parseWkt(text), text).toThrow(/ at position \d+\.$/);
    }
  });

  it("does not print a huge SRID back", () => {
    expect(() => parseWkt(`SRID=${"9".repeat(30)};POINT (1 2)`)).toThrow(
      "An SRID must be a whole number of at most 9 digits at position 6.",
    );
  });
});

describe("startsLikeWkt", () => {
  it("is true when the first word is a WKT type, with any case, tag or space before it", () => {
    for (const text of [
      "POINT (1 2)",
      "  point(1 2",
      "\n\tMultiPolygon EMPTY",
      "POINTZ (1 2 3)",
      "LINESTRING M (1 2 3, 4 5 6)",
      "GEOMETRYCOLLECTION",
      "CIRCULARSTRING (0 0, 1 1, 2 0)",
      "POINT",
      "SRID=4326;POINT (1 2)",
      "SRID=3857;POINT (1 2)",
      "srid = 4326 ; point (1 2)",
      "SRID=;POINT (1 2)",
    ]) {
      expect(startsLikeWkt(text)).toBe(true);
    }
  });

  it("is false for anything else", () => {
    for (const text of [
      "",
      " ",
      "hello",
      "(1 2)",
      "{}",
      "1 2",
      "POINTS (1 2)",
      "name,wkt",
      "SRID",
      "srid,4326;POINT (1 2)",
    ]) {
      expect(startsLikeWkt(text)).toBe(false);
    }
  });
});

describe("readWktSequence", () => {
  const kindOf = (text: unknown): string | undefined =>
    failureOf(GeometryError, () => readWktSequence(text as string))?.kind;

  it("reads one geometry, or several one after another in any layout", () => {
    expect(readWktSequence("POINT (1 2)")).toEqual([
      { type: "Point", coordinates: [1, 2] },
    ]);
    expect(
      readWktSequence(
        "POINT (1 2)\nLINESTRING (\n0 0,\n1 1)\r\n\r\npoint(3 4)",
      ),
    ).toEqual([
      { type: "Point", coordinates: [1, 2] },
      {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      { type: "Point", coordinates: [3, 4] },
    ]);
  });

  it("does not check the shape or the range, which its caller does", () => {
    expect(readWktSequence("LINESTRING (500 500)")).toEqual([
      { type: "LineString", coordinates: [[500, 500]] },
    ]);
    expect(readWktSequence("POINT EMPTY")).toEqual([
      { type: "Point", coordinates: [] },
    ]);
  });

  it("applies the axis order", () => {
    expect(readWktSequence("POINT (48 2)", { axisOrder: "lat-lng" })).toEqual([
      { type: "Point", coordinates: [2, 48] },
    ]);
  });

  it("refuses text with no geometry, or with text that starts no geometry", () => {
    for (const text of [
      "",
      "  \n",
      "POINT (1 2) (3 4)",
      "POINT (1 2), POINT (3 4)",
      "POINT (1 2",
    ]) {
      expect(kindOf(text)).toBe("invalid");
    }
  });

  it("refuses a measure or a curve as unsupported", () => {
    expect(kindOf("POINT (1 2)\nPOINT M (1 2 3)")).toBe("unsupported");
    expect(kindOf("CIRCULARSTRING (0 0, 1 1, 2 0)")).toBe("unsupported");
  });

  it("refuses something that is not a string", () => {
    expect(kindOf(5)).toBe("invalid");
  });
});

describe("readWktRecovering", () => {
  const readings = (text: string) => [...readWktRecovering(text)];
  const kinds = (text: string) =>
    readings(text).map((reading) =>
      reading instanceof GeometryError ? reading.kind : reading.type,
    );

  it("gives the same geometries as readWktSequence when every one can be read", () => {
    const text =
      "POINT (1 2)\nLINESTRING (0 0, 1 1)\nPOLYGON ((0 0, 1 0, 1 1, 0 0))";
    expect(readings(text)).toEqual(readWktSequence(text));
  });

  it("skips a geometry with a measure and keeps the ones around it, on one line", () => {
    expect(
      kinds(
        "POINT (1 1) POINT M (1 2 3) LINESTRINGZM (0 0 0 0, 1 1 1 1) POINT (3 3)",
      ),
    ).toEqual(["Point", "unsupported", "unsupported", "Point"]);
  });

  it("skips a curved geometry with brackets inside it, whatever its layout", () => {
    const text =
      "COMPOUNDCURVE (CIRCULARSTRING (0 0, 1 1, 2 0), (2 0, 3 3)) LINESTRING (0 0, 1 1)";
    expect(kinds(text)).toEqual(["unsupported", "LineString"]);
    expect(
      kinds("POINT (1 1) CURVEPOLYGON EMPTY POINT (2 2) CIRCULARSTRING EMPTY"),
    ).toEqual(["Point", "unsupported", "Point", "unsupported"]);
  });

  it("skips a measure that carries EMPTY, and one with a tag word", () => {
    expect(kinds("POINT ZM EMPTY POINT (1 1) POINT M EMPTY")).toEqual([
      "unsupported",
      "Point",
      "unsupported",
    ]);
  });

  it("skips a geometry in another SRID, and keeps one in SRID 4326 after it", () => {
    const [first, second] = readings(
      "SRID=3857;POINT (1 2)\nSRID=4326;POINT (3 4)",
    );
    expect(first).toBeInstanceOf(UnsupportedSridError);
    expect(second).toEqual({ type: "Point", coordinates: [3, 4] });
  });

  it("skips a whole collection that has a measure member", () => {
    expect(
      kinds(
        "GEOMETRYCOLLECTION (POINT (1 1), POINT M (1 2 3), POINT (4 4)) POINT (5 5)",
      ),
    ).toEqual(["unsupported", "Point"]);
  });

  it("skips one bad line and keeps the lines around it", () => {
    const [before, bad, after] = readings(
      "POINT (1 1)\nPOINT (x y)\nPOINT (3 3)",
    );
    expect(before).toEqual({ type: "Point", coordinates: [1, 1] });
    expect(bad).toBeInstanceOf(GeometryError);
    expect((bad as GeometryError).kind).toBe("invalid");
    expect((bad as GeometryError).message).toBe(
      "Expected a number at position 20.",
    );
    expect(after).toEqual({ type: "Point", coordinates: [3, 3] });
  });

  it("starts again at the next line when a line is cut short", () => {
    expect(kinds("LINESTRING (1 2, 3 4\nPOINT (5 6)")).toEqual([
      "invalid",
      "Point",
    ]);
  });

  it("counts the text up to the next geometry line as one stretch", () => {
    expect(kinds("POINT (1 1)\nfoo\nbar baz\nPOINT (2 2)")).toEqual([
      "Point",
      "invalid",
      "Point",
    ]);
  });

  it("ends the skip of a measure at the end of its line when its brackets stay open", () => {
    expect(kinds("POINT M (1 2\nPOINT (5 6)")).toEqual([
      "unsupported",
      "Point",
    ]);
    expect(kinds("POINT M\nPOINT (5 6)")).toEqual(["unsupported", "Point"]);
  });

  it("goes on after a character it does not know", () => {
    expect(kinds("POINT (1 1) @\nPOINT (2 2)")).toEqual([
      "Point",
      "invalid",
      "Point",
    ]);
    expect(kinds("@\nPOINT (2 2)")).toEqual(["invalid", "Point"]);
    expect(kinds("POINT M (1 @ 2)\nPOINT (2 2)")).toEqual([
      "unsupported",
      "Point",
    ]);
  });

  it("reads every line break the same way", () => {
    expect(kinds("POINT (1 1)\r\nPOINT (x)\r\nPOINT (3 3)")).toEqual([
      "Point",
      "invalid",
      "Point",
    ]);
    expect(kinds("POINT (1 1)\rPOINT (x)\rPOINT (3 3)")).toEqual([
      "Point",
      "invalid",
      "Point",
    ]);
  });

  it("gives one error for text that is not WKT, and for empty text", () => {
    expect(kinds("hello world")).toEqual(["invalid"]);
    expect(kinds("")).toEqual(["invalid"]);
  });

  it("gives one error and stops for text that never starts a geometry again", () => {
    expect(kinds("POINT (x)\n1 2\n3 4")).toEqual(["invalid"]);
  });

  it("reads lazily, so a caller that stops early reads no more", () => {
    const text = `POINT (1 1)\n${"POINT (x)\n".repeat(100_000)}`;
    const iterator = readWktRecovering(text);
    expect(iterator.next().value).toEqual({
      type: "Point",
      coordinates: [1, 1],
    });
    expect(iterator.next().value).toBeInstanceOf(GeometryError);
  });

  it("honours the axis order", () => {
    expect(readings("POINT (1 2) POINT M (1 2 3)")[0]).toEqual({
      type: "Point",
      coordinates: [1, 2],
    });
    expect([
      ...readWktRecovering("POINT (1 2)", { axisOrder: "lat-lng" }),
    ]).toEqual([{ type: "Point", coordinates: [2, 1] }]);
  });

  it("refuses something that is not a string", () => {
    expect(() => readWktRecovering(5 as unknown as string)).toThrow(
      "WKT must be a string.",
    );
  });
});

describe("startsLikeWkt on later lines and with odd spacing", () => {
  it("accepts the SRID prefix spaced out, and refuses a bare SRID word", () => {
    expect(startsLikeWkt("  \n SRID  = 4326;POINT (1 2)")).toBe(true);
    expect(startsLikeWkt("SRID 4326")).toBe(false);
    expect(startsLikeWkt("Sridhar")).toBe(false);
  });
});
