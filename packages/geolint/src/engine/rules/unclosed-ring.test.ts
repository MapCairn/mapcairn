// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Finding, RuleContext } from "../types.js";
import { unclosedRingRule } from "./unclosed-ring.js";
import { windingOrderRule } from "./winding-order.js";

const CONTEXT: RuleContext = { regions: [], countries: undefined };

function readFixture(name: string): unknown[] {
  const url = new URL(
    `../../../fixtures/unclosed-ring/${name}`,
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

function polygon(...rings: unknown[]): unknown {
  return feature({ type: "Polygon", coordinates: rings });
}

function ringOf(item: unknown): unknown {
  return (item as { geometry: { coordinates: unknown[] } }).geometry
    .coordinates[0];
}

function paths(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.path);
}

describe("unclosedRingRule", () => {
  it("describes itself", () => {
    expect(unclosedRingRule).toMatchObject({
      id: "unclosed-ring",
      severity: "error",
      confidence: "high",
      fixable: true,
      needsRegion: false,
    });
    expect(unclosedRingRule.summary).toMatch(/\.$/);
  });

  describe("fixtures", () => {
    it("reports nothing on the pass fixture", () => {
      for (const item of readFixture("pass.geojson")) {
        expect(unclosedRingRule.check(item, CONTEXT)).toEqual([]);
      }
    });

    it("reports the expected findings on the fail fixture, in order", () => {
      const reported = readFixture("fail.geojson").flatMap((item, index) =>
        unclosedRingRule.check(item, CONTEXT).map((finding) => ({
          path: `/features/${index}${finding.path}`,
          severity: finding.severity,
        })),
      );
      expect(reported).toEqual(readFixture("fail.expected.json"));
    });

    it("leaves no finding after the fix on the fail fixture", () => {
      for (const item of readFixture("fail.geojson")) {
        const fixed = unclosedRingRule.fix?.(item, CONTEXT);
        expect(unclosedRingRule.check(fixed, CONTEXT)).toEqual([]);
      }
    });
  });

  describe("check", () => {
    it("reports an open ring at the ring", () => {
      const findings = unclosedRingRule.check(
        polygon([
          [0, 0],
          [1, 0],
          [1, 1],
        ]),
        CONTEXT,
      );
      expect(findings).toEqual([
        {
          ruleId: "unclosed-ring",
          severity: "error",
          confidence: "high",
          path: "/geometry/coordinates/0",
          message:
            "The ring is not closed: its last position is not the same as its first.",
          fixable: true,
        },
      ]);
    });

    it("reports every open ring of a MultiPolygon, holes included", () => {
      const open = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      const findings = unclosedRingRule.check(
        feature({ type: "MultiPolygon", coordinates: [[open, open], [open]] }),
        CONTEXT,
      );
      expect(paths(findings)).toEqual([
        "/geometry/coordinates/0/0",
        "/geometry/coordinates/0/1",
        "/geometry/coordinates/1/0",
      ]);
    });

    it("reads geometries inside nested collections", () => {
      const findings = unclosedRingRule.check(
        feature({
          type: "GeometryCollection",
          geometries: [
            {
              type: "GeometryCollection",
              geometries: [
                {
                  type: "Polygon",
                  coordinates: [
                    [
                      [0, 0],
                      [1, 0],
                      [1, 1],
                    ],
                  ],
                },
              ],
            },
          ],
        }),
        CONTEXT,
      );
      expect(paths(findings)).toEqual([
        "/geometry/geometries/0/geometries/0/coordinates/0",
      ]);
    });

    it("counts a differing altitude as not closed", () => {
      const findings = unclosedRingRule.check(
        polygon([
          [0, 0, 1],
          [1, 0, 1],
          [1, 1, 1],
          [0, 0, 2],
        ]),
        CONTEXT,
      );
      expect(findings).toHaveLength(1);
    });

    it("leaves a ring with fewer than three positions to the structure rule", () => {
      const item = polygon(
        [],
        [[0, 0]],
        [
          [0, 0],
          [1, 1],
        ],
      );
      expect(unclosedRingRule.check(item, CONTEXT)).toEqual([]);
      expect(unclosedRingRule.fix?.(item, CONTEXT)).toBe(item);
    });

    it("ignores lines that are not closed", () => {
      const line = feature({
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
          [2, 0],
        ],
      });
      expect(unclosedRingRule.check(line, CONTEXT)).toEqual([]);
      expect(unclosedRingRule.fix?.(line, CONTEXT)).toBe(line);
    });
  });

  describe("fix", () => {
    it("appends a copy of the first position, altitude included", () => {
      const first = [0, 0, 7];
      const fixed = unclosedRingRule.fix?.(
        polygon([first, [1, 0, 8], [1, 1, 9]]),
        CONTEXT,
      );
      const ring = ringOf(fixed) as number[][];
      expect(ring).toEqual([
        [0, 0, 7],
        [1, 0, 8],
        [1, 1, 9],
        [0, 0, 7],
      ]);
      expect(ring[3]).not.toBe(ring[0]);
    });

    it("replaces a last position that differs from the first only in altitude", () => {
      const fixed = unclosedRingRule.fix?.(
        polygon([
          [0, 0, 1],
          [1, 0, 2],
          [1, 1, 3],
          [0, 0, 9],
        ]),
        CONTEXT,
      );
      expect(ringOf(fixed)).toEqual([
        [0, 0, 1],
        [1, 0, 2],
        [1, 1, 3],
        [0, 0, 1],
      ]);
    });

    it("closes only the open rings and shares the rest", () => {
      const closedRing = [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 0],
      ];
      const item = polygon(closedRing, [
        [1, 1],
        [2, 1],
        [2, 2],
      ]) as { geometry: { coordinates: unknown[] }; properties: unknown };
      const fixed = unclosedRingRule.fix?.(item, CONTEXT) as typeof item;
      expect(fixed.geometry.coordinates[0]).toBe(closedRing);
      expect(fixed.geometry.coordinates[1]).toEqual([
        [1, 1],
        [2, 1],
        [2, 2],
        [1, 1],
      ]);
      expect(fixed.properties).toBe(item.properties);
    });

    it("returns the same object when every ring is closed", () => {
      const item = polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]);
      expect(unclosedRingRule.fix?.(item, CONTEXT)).toBe(item);
    });

    it("does not change the winding the winding rule reports", () => {
      const clockwiseOpen = polygon([
        [0, 0],
        [0, 2],
        [2, 2],
        [2, 0],
      ]);
      const before = windingOrderRule.check(clockwiseOpen, CONTEXT);
      const after = windingOrderRule.check(
        unclosedRingRule.fix?.(clockwiseOpen, CONTEXT),
        CONTEXT,
      );
      expect(before).toHaveLength(1);
      expect(after).toEqual(before);
    });

    it("does not mutate a frozen input", () => {
      const item = deepFreeze(
        polygon([
          [0, 0],
          [1, 0],
          [1, 1],
        ]),
      );
      expect(() => unclosedRingRule.fix?.(item, CONTEXT)).not.toThrow();
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
      feature({ type: "Polygon" }),
      feature({ type: "Polygon", coordinates: "text" }),
      feature({ type: "Polygon", coordinates: [null] }),
      feature({ type: "Polygon", coordinates: [[null, null, null]] }),
      feature({
        type: "Polygon",
        coordinates: [
          [
            ["a", "b"],
            [0, 0],
            [1, 1],
          ],
        ],
      }),
      feature({ type: "Polygon", coordinates: [[[0, 0], [1], [2, 2]]] }),
      feature({ type: "MultiPolygon", coordinates: "text" }),
      feature({ type: "MultiPolygon", coordinates: [null, "text", [null]] }),
      feature({ type: "GeometryCollection", geometries: "text" }),
      feature({ type: "GeometryCollection", geometries: [null, 3] }),
    ];

    it("never throws and returns unreadable input unchanged", () => {
      for (const sample of samples) {
        expect(unclosedRingRule.check(sample, CONTEXT)).toEqual([]);
        expect(unclosedRingRule.fix?.(sample, CONTEXT)).toBe(sample);
      }
    });
  });

  describe("properties", () => {
    const coordinate = fc.integer({ min: -6, max: 6 });
    const position = fc.oneof(
      fc.tuple(coordinate, coordinate),
      fc.tuple(coordinate, coordinate, coordinate),
    );
    const ring = fc
      .tuple(fc.array(position, { minLength: 3, maxLength: 8 }), fc.boolean())
      .map(([positions, close]) =>
        close ? [...positions, positions[0]] : positions,
      );
    const rings = fc.array(ring, { minLength: 1, maxLength: 3 });
    const anyFeature = fc.oneof(
      rings.map((coordinates) => feature({ type: "Polygon", coordinates })),
      fc
        .array(rings, { minLength: 1, maxLength: 3 })
        .map((coordinates) => feature({ type: "MultiPolygon", coordinates })),
    );

    it("fixes to a feature with no findings, idempotently, without mutating", () => {
      void fc.assert(
        fc.property(anyFeature, (item) => {
          const frozen = deepFreeze(structuredClone(item));
          const fixed = unclosedRingRule.fix?.(frozen, CONTEXT);
          expect(unclosedRingRule.check(fixed, CONTEXT)).toEqual([]);
          expect(unclosedRingRule.fix?.(fixed, CONTEXT)).toBe(fixed);
          expect(frozen).toEqual(item);
        }),
      );
    });

    it("keeps every ring of four or more positions at the winding it had", () => {
      const bigRing = fc
        .array(fc.tuple(coordinate, coordinate), {
          minLength: 4,
          maxLength: 8,
        })
        .map((positions) =>
          feature({ type: "Polygon", coordinates: [positions] }),
        );
      void fc.assert(
        fc.property(bigRing, (item) => {
          const fixed = unclosedRingRule.fix?.(item, CONTEXT);
          expect(paths(windingOrderRule.check(fixed, CONTEXT))).toEqual(
            paths(windingOrderRule.check(item, CONTEXT)),
          );
        }),
      );
    });
  });
});
