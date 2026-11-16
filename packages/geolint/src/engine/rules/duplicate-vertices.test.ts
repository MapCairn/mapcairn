// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Finding, RuleContext } from "../types.js";
import { duplicateVerticesRule } from "./duplicate-vertices.js";
import { precisionRule } from "./precision.js";

const CONTEXT: RuleContext = { regions: [], countries: undefined };

function readFixture(name: string): unknown[] {
  const url = new URL(
    `../../../fixtures/duplicate-vertices/${name}`,
    import.meta.url,
  );
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

function line(...positions: unknown[]): unknown {
  return feature({ type: "LineString", coordinates: positions });
}

function polygon(...rings: unknown[]): unknown {
  return feature({ type: "Polygon", coordinates: rings });
}

function coordinatesOf(item: unknown): unknown {
  return (item as { geometry: { coordinates: unknown } }).geometry.coordinates;
}

function paths(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.path);
}

function check(item: unknown): readonly Finding[] {
  return duplicateVerticesRule.check(item, CONTEXT);
}

function fix(item: unknown): unknown {
  return duplicateVerticesRule.fix?.(item, CONTEXT);
}

describe("duplicateVerticesRule", () => {
  it("describes itself", () => {
    expect(duplicateVerticesRule).toMatchObject({
      id: "duplicate-vertices",
      severity: "warning",
      confidence: "high",
      fixable: true,
      needsRegion: false,
    });
    expect(duplicateVerticesRule.summary).toMatch(/\.$/);
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

    it("marks only the finding that cannot be repaired as not fixable", () => {
      const fixable = readFixture("fail.geojson").flatMap((item) =>
        check(item).map((finding) => finding.fixable),
      );
      expect(fixable).toEqual([true, true, true, true, false]);
    });

    it("leaves only the unfixable finding after the fix on the fail fixture", () => {
      const remaining = readFixture("fail.geojson").flatMap((item) =>
        check(fix(item)),
      );
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({
        path: "/geometry/geometries/0/coordinates/1",
        fixable: false,
      });
    });
  });

  describe("check", () => {
    it("reports one finding for a run of repeats, with its length", () => {
      const findings = check(line([0, 0], [1, 1], [1, 1], [1, 1], [2, 2]));
      expect(findings).toEqual([
        {
          ruleId: "duplicate-vertices",
          severity: "warning",
          confidence: "high",
          path: "/geometry/coordinates/2",
          message: "A position is repeated 2 times in a row.",
          fixable: true,
          data: { count: 2 },
        },
      ]);
    });

    it("words a single repeat in the singular", () => {
      const [finding] = check(line([0, 0], [0, 0], [1, 1]));
      expect(finding?.message).toBe(
        "A position is repeated straight after itself.",
      );
      expect(finding?.data).toEqual({ count: 1 });
    });

    it("reports separate runs separately", () => {
      const findings = check(line([0, 0], [0, 0], [1, 1], [2, 2], [2, 2]));
      expect(paths(findings)).toEqual([
        "/geometry/coordinates/1",
        "/geometry/coordinates/4",
      ]);
    });

    it("does not count the closing position of a ring as a duplicate", () => {
      expect(
        check(
          polygon([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ]),
        ),
      ).toEqual([]);
    });

    it("counts a repeat of the closing position in a ring", () => {
      const findings = check(
        polygon([
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
          [0, 0],
        ]),
      );
      expect(paths(findings)).toEqual(["/geometry/coordinates/0/4"]);
      expect(findings[0]?.fixable).toBe(true);
    });

    it("compares every element, so a different altitude is not a repeat", () => {
      expect(check(line([0, 0, 1], [0, 0, 2]))).toEqual([]);
      expect(check(line([0, 0, 1], [0, 0, 1]))).toHaveLength(1);
      expect(check(line([0, 0], [0, 0, 1]))).toEqual([]);
    });

    it("reads every ring of a MultiPolygon and every line of a MultiLineString", () => {
      const ring = [
        [0, 0],
        [1, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ];
      const polygons = check(
        feature({ type: "MultiPolygon", coordinates: [[ring, ring], [ring]] }),
      );
      expect(paths(polygons)).toEqual([
        "/geometry/coordinates/0/0/2",
        "/geometry/coordinates/0/1/2",
        "/geometry/coordinates/1/0/2",
      ]);
      const lines = check(
        feature({
          type: "MultiLineString",
          coordinates: [
            [
              [0, 0],
              [0, 0],
            ],
            [
              [1, 1],
              [2, 2],
            ],
          ],
        }),
      );
      expect(paths(lines)).toEqual(["/geometry/coordinates/0/1"]);
    });

    it("reads geometries inside nested collections", () => {
      const findings = check(
        feature({
          type: "GeometryCollection",
          geometries: [
            {
              type: "GeometryCollection",
              geometries: [
                {
                  type: "LineString",
                  coordinates: [
                    [0, 0],
                    [0, 0],
                    [1, 1],
                  ],
                },
              ],
            },
          ],
        }),
      );
      expect(paths(findings)).toEqual([
        "/geometry/geometries/0/geometries/0/coordinates/1",
      ]);
    });

    it("ignores points", () => {
      const points = feature({
        type: "MultiPoint",
        coordinates: [
          [1, 1],
          [1, 1],
        ],
      });
      expect(check(points)).toEqual([]);
      expect(fix(points)).toBe(points);
    });

    it("marks repeats that cannot go without breaking the geometry as not fixable", () => {
      const tooShortLine = check(line([5, 5], [5, 5]));
      const tooShortRing = check(
        polygon([
          [0, 0],
          [1, 1],
          [1, 1],
          [0, 0],
        ]),
      );
      expect(tooShortLine.map((finding) => finding.fixable)).toEqual([false]);
      expect(tooShortRing.map((finding) => finding.fixable)).toEqual([false]);
    });
  });

  describe("fix", () => {
    it("removes the repeats of a line", () => {
      expect(fix(line([0, 0], [1, 1], [1, 1], [1, 1], [2, 2]))).toEqual(
        line([0, 0], [1, 1], [2, 2]),
      );
    });

    it("keeps the closing position when a ring repeats its first or last", () => {
      const fixed = fix(
        polygon([
          [0, 0],
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
          [0, 0],
        ]),
      );
      expect(coordinatesOf(fixed)).toEqual([
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ]);
    });

    it("keeps altitude on the positions it keeps", () => {
      expect(fix(line([0, 0, 5], [0, 0, 5], [1, 1, 6]))).toEqual(
        line([0, 0, 5], [1, 1, 6]),
      );
    });

    it("leaves a line or ring that would become too short as it is", () => {
      const shortLine = line([5, 5], [5, 5]);
      const shortRing = polygon([
        [0, 0],
        [1, 1],
        [1, 1],
        [0, 0],
      ]);
      expect(fix(shortLine)).toBe(shortLine);
      expect(fix(shortRing)).toBe(shortRing);
    });

    it("repairs the lines it can and leaves the others in a MultiLineString", () => {
      const fixed = fix(
        feature({
          type: "MultiLineString",
          coordinates: [
            [
              [0, 0],
              [0, 0],
              [1, 1],
            ],
            [
              [2, 2],
              [2, 2],
            ],
          ],
        }),
      );
      expect(coordinatesOf(fixed)).toEqual([
        [
          [0, 0],
          [1, 1],
        ],
        [
          [2, 2],
          [2, 2],
        ],
      ]);
    });

    it("returns the same object when there are no repeats, and shares the rest", () => {
      const clean = line([0, 0], [1, 1]);
      expect(fix(clean)).toBe(clean);
      const item = feature({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [1, 1] },
          {
            type: "LineString",
            coordinates: [
              [0, 0],
              [0, 0],
              [1, 1],
            ],
          },
        ],
      }) as { properties: unknown; geometry: { geometries: unknown[] } };
      const fixed = fix(item) as typeof item;
      expect(fixed).not.toBe(item);
      expect(fixed.properties).toBe(item.properties);
      expect(fixed.geometry.geometries[0]).toBe(item.geometry.geometries[0]);
    });

    it("does not mutate a frozen input", () => {
      const item = deepFreeze(line([0, 0], [0, 0], [1, 1]));
      expect(() => fix(item)).not.toThrow();
    });

    it("removes what the precision fix made identical on the next pass", () => {
      const item = line([0.123456781, 1], [0.123456782, 1], [5, 5]);
      const rounded = precisionRule.fix?.(item, CONTEXT);
      expect(check(rounded)).toHaveLength(1);
      expect(fix(rounded)).toEqual(line([0.1234568, 1], [5, 5]));
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
      feature({ type: "LineString" }),
      feature({ type: "LineString", coordinates: "text" }),
      feature({ type: "LineString", coordinates: [null, null] }),
      feature({ type: "LineString", coordinates: [[0, 0], [0], [0, 0]] }),
      feature({
        type: "LineString",
        coordinates: [
          ["a", "b"],
          ["a", "b"],
        ],
      }),
      feature({ type: "MultiLineString", coordinates: [null, "text", [null]] }),
      feature({ type: "Polygon", coordinates: "text" }),
      feature({ type: "Polygon", coordinates: [null, [null]] }),
      feature({ type: "MultiPolygon", coordinates: [null, "text", [null]] }),
      feature({ type: "GeometryCollection", geometries: "text" }),
      feature({ type: "GeometryCollection", geometries: [null, 3] }),
    ];

    it("never throws and returns unreadable input unchanged", () => {
      for (const sample of samples) {
        expect(check(sample)).toEqual([]);
        expect(fix(sample)).toBe(sample);
      }
    });
  });

  describe("properties", () => {
    const coordinate = fc.integer({ min: 0, max: 1 });
    const position = fc.oneof(
      fc.tuple(coordinate, coordinate),
      fc.tuple(coordinate, coordinate, coordinate),
    );
    const lineCoordinates = fc.array(position, { minLength: 2, maxLength: 8 });
    const ringCoordinates = fc
      .array(position, { minLength: 3, maxLength: 8 })
      .map((positions) => [...positions, positions[0]]);
    const anyFeature = fc.oneof(
      lineCoordinates.map((coordinates) =>
        feature({ type: "LineString", coordinates }),
      ),
      fc
        .array(lineCoordinates, { minLength: 1, maxLength: 3 })
        .map((coordinates) =>
          feature({ type: "MultiLineString", coordinates }),
        ),
      fc
        .array(ringCoordinates, { minLength: 1, maxLength: 3 })
        .map((coordinates) => feature({ type: "Polygon", coordinates })),
    );

    it("fixes everything fixable, idempotently, without mutating", () => {
      void fc.assert(
        fc.property(anyFeature, (item) => {
          const frozen = deepFreeze(structuredClone(item));
          const before = check(frozen);
          const fixed = fix(frozen);
          const after = check(fixed);
          expect(after.every((finding) => !finding.fixable)).toBe(true);
          expect(after.length).toBe(
            before.filter((finding) => !finding.fixable).length,
          );
          if (before.every((finding) => finding.fixable)) {
            expect(after).toEqual([]);
          }
          expect(fix(fixed)).toBe(fixed);
          expect(frozen).toEqual(item);
        }),
      );
    });

    it("never leaves a line shorter than two positions or a ring than four", () => {
      void fc.assert(
        fc.property(anyFeature, (item) => {
          const geometry = (fix(item) as { geometry: { type: string } })
            .geometry;
          const coordinates = (
            geometry as unknown as { coordinates: unknown[] }
          ).coordinates;
          const runs =
            geometry.type === "LineString"
              ? [coordinates]
              : (coordinates as unknown[][]);
          const minimum = geometry.type === "Polygon" ? 4 : 2;
          for (const run of runs) {
            expect((run as unknown[]).length).toBeGreaterThanOrEqual(minimum);
          }
        }),
      );
    });
  });
});
