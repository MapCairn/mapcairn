// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Finding, RuleContext } from "../types.js";
import { decimalPlaces, exceedsPrecision, precisionRule } from "./precision.js";

const CONTEXT: RuleContext = { regions: [], countries: undefined };

function readFixture(name: string): unknown[] {
  const url = new URL(`../../../fixtures/precision/${name}`, import.meta.url);
  const parsed = JSON.parse(readFileSync(url, "utf8")) as unknown;
  return Array.isArray(parsed)
    ? parsed
    : (parsed as { features: unknown[] }).features;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function feature(geometry: unknown): unknown {
  return { type: "Feature", properties: { name: "x" }, geometry };
}

function point(...coordinates: unknown[]): unknown {
  return feature({ type: "Point", coordinates });
}

function coordinatesOf(item: unknown): unknown {
  return (item as { geometry: { coordinates: unknown } }).geometry.coordinates;
}

function paths(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.path);
}

function check(item: unknown): readonly Finding[] {
  return precisionRule.check(item, CONTEXT);
}

function fix(item: unknown): unknown {
  return precisionRule.fix?.(item, CONTEXT);
}

function nextUp(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigInt64(0);
  view.setBigInt64(0, value >= 0 ? bits + 1n : bits - 1n);
  return view.getFloat64(0);
}

function nextDown(value: number): number {
  return -nextUp(-value);
}

function maxDecimals(...coordinates: number[]): unknown {
  return check(point(...coordinates))[0]?.data?.maxDecimals;
}

describe("precisionRule", () => {
  it("describes itself", () => {
    expect(precisionRule).toMatchObject({
      id: "precision",
      severity: "info",
      confidence: "high",
      fixable: true,
      needsRegion: false,
    });
    expect(precisionRule.summary).toMatch(/centimetre/);
    expect(precisionRule.summary).toMatch(/\.$/);
  });

  describe("fixtures", () => {
    it("reports nothing on the pass fixture", () => {
      for (const item of readFixture("pass.geojson")) {
        expect(check(item)).toEqual([]);
      }
    });

    it("reports the expected findings on the fail fixture, in order", () => {
      const reported = readFixture("fail.geojson").flatMap((item, index) =>
        check(item).map((finding) => ({
          path: `/features/${index}${finding.path}`,
          severity: finding.severity,
        })),
      );
      expect(reported).toEqual(readFixture("fail.expected.json"));
    });

    it("leaves no finding after the fix on the fail fixture", () => {
      for (const item of readFixture("fail.geojson")) {
        expect(check(fix(item))).toEqual([]);
      }
    });
  });

  describe("counting decimals", () => {
    it("counts places from the shortest decimal form", () => {
      expect(maxDecimals(0.12345678, 1)).toBe(8);
      expect(maxDecimals(1, -0.123456789)).toBe(9);
      expect(maxDecimals(0.1 + 0.2, 1)).toBe(17);
    });

    it("counts places correctly for exponent forms", () => {
      expect(maxDecimals(1e-8, 0)).toBe(8);
      expect(maxDecimals(1.5e-7, 0)).toBe(8);
      expect(maxDecimals(1.5e-8, 0)).toBe(9);
      expect(maxDecimals(5e-324, 0)).toBe(324);
    });

    it("allows seven places and fewer, large numbers and exponents that remove the fraction", () => {
      expect(check(point(1e-7, 0))).toEqual([]);
      expect(check(point(1.5e-6, 0))).toEqual([]);
      expect(check(point(-0.1234567, 0))).toEqual([]);
      expect(check(point(1e21, 1.5e25))).toEqual([]);
      expect(check(point(0, 0))).toEqual([]);
    });

    it("reads longitude, latitude and altitude, and nothing after them", () => {
      expect(maxDecimals(0, 0, 1.123456789)).toBe(9);
      expect(check(point(0, 0, 1, 1.123456789123))).toEqual([]);
    });
  });

  describe("check", () => {
    it("reports one finding for each geometry with the worst precision and the number of positions", () => {
      const findings = check(
        feature({
          type: "LineString",
          coordinates: [
            [1.123456789, 2],
            [3, 4.1234567891],
            [5, 6],
          ],
        }),
      );
      expect(findings).toEqual([
        {
          ruleId: "precision",
          severity: "info",
          confidence: "high",
          path: "/geometry/coordinates",
          message:
            "Coordinates in 2 positions have up to 10 decimal places, but 7 places of longitude or latitude is about a centimetre.",
          fixable: true,
          data: { maxDecimals: 10, positions: 2 },
        },
      ]);
    });

    it("words a single position in the singular", () => {
      expect(check(point(0.12345678, 1))[0]?.message).toBe(
        "Coordinates in 1 position have up to 8 decimal places, but 7 places of longitude or latitude is about a centimetre.",
      );
    });

    it("reports each leaf of a MultiPolygon, a MultiLineString and a collection on its own", () => {
      const precise = [0.123456789, 0.123456789];
      const multiPolygon = check(
        feature({
          type: "MultiPolygon",
          coordinates: [[[precise, [0, 0], [1, 1], precise]]],
        }),
      );
      expect(paths(multiPolygon)).toEqual(["/geometry/coordinates"]);
      expect(multiPolygon[0]?.data).toEqual({ maxDecimals: 9, positions: 2 });
      const multiLine = check(
        feature({
          type: "MultiLineString",
          coordinates: [
            [precise, [0, 0]],
            [[1, 1], precise],
          ],
        }),
      );
      expect(multiLine[0]?.data).toEqual({ maxDecimals: 9, positions: 2 });
      const collection = check(
        feature({
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: precise },
            {
              type: "GeometryCollection",
              geometries: [{ type: "MultiPoint", coordinates: [precise] }],
            },
          ],
        }),
      );
      expect(paths(collection)).toEqual([
        "/geometry/geometries/0/coordinates",
        "/geometry/geometries/1/geometries/0/coordinates",
      ]);
    });

    it("reads a bare geometry", () => {
      const findings = check({
        type: "Point",
        coordinates: [0.123456789, 0],
      });
      expect(paths(findings)).toEqual(["/coordinates"]);
    });
  });

  describe("fix", () => {
    it("rounds longitude, latitude and altitude to seven places", () => {
      expect(fix(point(0.123456789, -51.987654321, 12.123456789))).toEqual(
        point(0.1234568, -51.9876543, 12.1234568),
      );
    });

    it("leaves elements after the altitude and numbers that are fine as they are", () => {
      expect(fix(point(0.123456789, 1.5, 3, 0.123456789123))).toEqual(
        point(0.1234568, 1.5, 3, 0.123456789123),
      );
    });

    it("turns -0, and a number that rounds to -0, into 0", () => {
      const fixed = coordinatesOf(fix(point(-0, -1e-9))) as number[];
      expect(Object.is(fixed[0], 0)).toBe(true);
      expect(Object.is(fixed[1], 0)).toBe(true);
    });

    it("rounds every kind of geometry", () => {
      const a = [0.123456789, 1];
      const rounded = [0.1234568, 1];
      const geometry = (type: string, coordinates: unknown): unknown =>
        feature({ type, coordinates });
      const cases: [unknown, unknown][] = [
        [
          geometry("MultiPoint", [a, [2, 2]]),
          geometry("MultiPoint", [rounded, [2, 2]]),
        ],
        [
          geometry("LineString", [a, [2, 2]]),
          geometry("LineString", [rounded, [2, 2]]),
        ],
        [
          geometry("MultiLineString", [
            [a, [2, 2]],
            [[3, 3], a],
          ]),
          geometry("MultiLineString", [
            [rounded, [2, 2]],
            [[3, 3], rounded],
          ]),
        ],
        [
          geometry("Polygon", [[a, [2, 2], [3, 3], a]]),
          geometry("Polygon", [[rounded, [2, 2], [3, 3], rounded]]),
        ],
        [
          geometry("MultiPolygon", [[[a, [2, 2], [3, 3], a]]]),
          geometry("MultiPolygon", [[[rounded, [2, 2], [3, 3], rounded]]]),
        ],
      ];
      for (const [input, expected] of cases) {
        expect(fix(input)).toEqual(expected);
      }
    });

    it("rounds inside nested collections and shares what it did not change", () => {
      const untouched = { type: "Point", coordinates: [1, 1] };
      const item = feature({
        type: "GeometryCollection",
        geometries: [
          untouched,
          {
            type: "GeometryCollection",
            geometries: [{ type: "Point", coordinates: [0.123456789, 1] }],
          },
        ],
      }) as { properties: unknown; geometry: { geometries: unknown[] } };
      const fixed = fix(item) as typeof item;
      expect(fixed.geometry.geometries[0]).toBe(untouched);
      expect(fixed.properties).toBe(item.properties);
      expect(fixed.geometry.geometries[1]).toEqual({
        type: "GeometryCollection",
        geometries: [{ type: "Point", coordinates: [0.1234568, 1] }],
      });
    });

    it("rounds a bare geometry", () => {
      expect(fix({ type: "Point", coordinates: [0.123456789, 1] })).toEqual({
        type: "Point",
        coordinates: [0.1234568, 1],
      });
    });

    it("returns the same object when no number needs rounding", () => {
      const item = point(1.5, 2.25, 3);
      expect(fix(item)).toBe(item);
    });

    it("does not mutate a frozen input", () => {
      expect(() => fix(deepFreeze(point(0.123456789, 1)))).not.toThrow();
    });

    it("lets the duplicate fix take over when two positions round to one", () => {
      const fixed = fix(
        feature({
          type: "LineString",
          coordinates: [
            [0.123456781, 1],
            [0.123456782, 1],
          ],
        }),
      );
      expect(coordinatesOf(fixed)).toEqual([
        [0.1234568, 1],
        [0.1234568, 1],
      ]);
    });
  });

  describe("malformed input", () => {
    const samples: unknown[] = [
      undefined,
      null,
      "text",
      42,
      [],
      {},
      { type: "Feature" },
      feature(null),
      feature("text"),
      feature({ type: "Point" }),
      feature({ type: "Point", coordinates: "text" }),
      feature({ type: "Point", coordinates: ["a", "b"] }),
      feature({ type: "Point", coordinates: [1] }),
      feature({ type: "MultiPoint", coordinates: [null, "text", [1]] }),
      feature({ type: "LineString", coordinates: [null, [0.123456789, 1]] }),
      feature({ type: "MultiLineString", coordinates: [null, "text", [null]] }),
      feature({ type: "Polygon", coordinates: [null, [null]] }),
      feature({ type: "MultiPolygon", coordinates: "text" }),
      feature({ type: "GeometryCollection", geometries: "text" }),
      feature({ type: "GeometryCollection", geometries: [null, 3] }),
    ];

    it("never throws and returns unreadable input unchanged", () => {
      for (const sample of samples) {
        expect(check(sample)).toEqual([]);
        expect(fix(sample)).toBe(sample);
      }
    });

    it("ignores non-numbers among the first three elements", () => {
      const item = point(0.123456789, 1, "high");
      expect(check(item)).toHaveLength(1);
      expect(fix(item)).toEqual(point(0.1234568, 1, "high"));
    });
  });

  describe("properties", () => {
    const longitude = fc.double({ min: -180, max: 180, noNaN: true });
    const latitude = fc.double({ min: -90, max: 90, noNaN: true });
    const altitude = fc.double({ min: -1e4, max: 1e4, noNaN: true });
    const position = fc.oneof(
      fc.tuple(longitude, latitude),
      fc.tuple(longitude, latitude, altitude),
    );
    const anyFeature = fc.oneof(
      position.map((coordinates) => feature({ type: "Point", coordinates })),
      fc
        .array(position, { minLength: 2, maxLength: 6 })
        .map((coordinates) => feature({ type: "LineString", coordinates })),
      fc
        .array(fc.array(position, { minLength: 4, maxLength: 6 }), {
          minLength: 1,
          maxLength: 3,
        })
        .map((coordinates) => feature({ type: "Polygon", coordinates })),
    );

    it("fixes to a feature with no findings, idempotently, without mutating", () => {
      void fc.assert(
        fc.property(anyFeature, (item) => {
          const frozen = deepFreeze(structuredClone(item));
          const fixed = fix(frozen);
          expect(check(fixed)).toEqual([]);
          expect(fix(fixed)).toBe(fixed);
          expect(frozen).toEqual(item);
        }),
      );
    });

    it("moves a coordinate by no more than half a unit in the seventh place", () => {
      void fc.assert(
        fc.property(position, (coordinates) => {
          const fixed = coordinatesOf(fix(point(...coordinates))) as number[];
          fixed.forEach((value, axis) => {
            expect(Number.isFinite(value)).toBe(true);
            expect(
              Math.abs(value - (coordinates[axis] as number)),
            ).toBeLessThanOrEqual(5.000001e-8);
          });
        }),
      );
    });

    it("rounds any finite number, however large or small, to a finite one with at most seven places", () => {
      void fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          (value) => {
            const fixed = coordinatesOf(fix(point(value, 0))) as number[];
            expect(Number.isFinite(fixed[0])).toBe(true);
            expect(check(point(...fixed))).toEqual([]);
            expect(coordinatesOf(fix(point(...fixed)))).toEqual(fixed);
          },
        ),
      );
    });
  });

  describe("exceedsPrecision", () => {
    const slow = (value: number): boolean => decimalPlaces(value) > 7;

    it("is exact at the edge of seven places and for numbers too large for the scale test", () => {
      for (const value of [
        0, -0, 1e-7, 1.5e-7, 1e-8, 0.1234567, 0.12345678, 99999999.1234567,
        99999999.12345678, 268435456.00000006, 1e8, 1e21, 5e-324,
      ]) {
        expect(exceedsPrecision(value)).toBe(slow(value));
        expect(exceedsPrecision(-value)).toBe(slow(-value));
      }
    });

    it("agrees with counting the text of the number, for any double", () => {
      void fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true }),
          (value) => {
            expect(exceedsPrecision(value)).toBe(slow(value));
          },
        ),
        { numRuns: 2000 },
      );
    });

    it("agrees on numbers written with a chosen count of decimals", () => {
      void fc.assert(
        fc.property(
          fc.integer({ min: -(2 ** 52), max: 2 ** 52 }),
          fc.integer({ min: 0, max: 12 }),
          (whole, places) => {
            const value = whole / 10 ** places;
            expect(exceedsPrecision(value)).toBe(slow(value));
          },
        ),
        { numRuns: 2000 },
      );
    });

    it("agrees on coordinate-sized numbers one step either side of a seven-place value", () => {
      void fc.assert(
        fc.property(
          fc.integer({ min: -(10 ** 9), max: 10 ** 9 }),
          fc.integer({ min: -3, max: 3 }),
          (whole, steps) => {
            let value = whole / 1e7;
            for (let step = 0; step < Math.abs(steps); step++) {
              value = steps > 0 ? nextUp(value) : nextDown(value);
            }
            expect(exceedsPrecision(value)).toBe(slow(value));
          },
        ),
        { numRuns: 2000 },
      );
    });
  });
});
