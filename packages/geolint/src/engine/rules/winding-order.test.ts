// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Finding, RuleContext } from "../types.js";
import { windingOrderRule } from "./winding-order.js";

const CONTEXT: RuleContext = { regions: [], countries: undefined };

function readFixture(name: string): unknown[] {
  const url = new URL(
    `../../../fixtures/winding-order/${name}`,
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

function paths(findings: readonly Finding[]): string[] {
  return findings.map((finding) => finding.path);
}

const CCW = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
  [0, 0],
];
const CW = [
  [0, 0],
  [0, 2],
  [2, 2],
  [2, 0],
  [0, 0],
];

describe("windingOrderRule", () => {
  it("describes itself", () => {
    expect(windingOrderRule).toMatchObject({
      id: "winding-order",
      severity: "warning",
      confidence: "high",
      fixable: true,
      needsRegion: false,
    });
    expect(windingOrderRule.summary).toMatch(/\.$/);
  });

  describe("fixtures", () => {
    it("reports nothing on the pass fixture", () => {
      for (const item of readFixture("pass.geojson")) {
        expect(windingOrderRule.check(item, CONTEXT)).toEqual([]);
      }
    });

    it("reports the expected findings on the fail fixture, in order", () => {
      const reported = readFixture("fail.geojson").flatMap((item, index) =>
        windingOrderRule.check(item, CONTEXT).map((finding) => ({
          path: `/features/${index}${finding.path}`,
          severity: finding.severity,
        })),
      );
      expect(reported).toEqual(readFixture("fail.expected.json"));
    });

    it("leaves no finding after the fix on the fail fixture", () => {
      for (const item of readFixture("fail.geojson")) {
        const fixed = windingOrderRule.fix?.(item, CONTEXT);
        expect(windingOrderRule.check(fixed, CONTEXT)).toEqual([]);
      }
    });
  });

  describe("check", () => {
    it("accepts a counter-clockwise exterior and a clockwise hole", () => {
      const item = polygon(CCW, [
        [0.5, 0.5],
        [0.5, 1],
        [1, 1],
        [1, 0.5],
        [0.5, 0.5],
      ]);
      expect(windingOrderRule.check(item, CONTEXT)).toEqual([]);
    });

    it("reports a clockwise exterior at the ring", () => {
      const findings = windingOrderRule.check(polygon(CW), CONTEXT);
      expect(findings).toEqual([
        {
          ruleId: "winding-order",
          severity: "warning",
          confidence: "high",
          path: "/geometry/coordinates/0",
          message:
            "The outer ring runs clockwise, but RFC 7946 asks for counter-clockwise.",
          fixable: true,
        },
      ]);
    });

    it("reports a counter-clockwise hole at the ring", () => {
      const findings = windingOrderRule.check(
        polygon(CCW, [
          [0.5, 0.5],
          [1, 0.5],
          [1, 1],
          [0.5, 1],
          [0.5, 0.5],
        ]),
        CONTEXT,
      );
      expect(paths(findings)).toEqual(["/geometry/coordinates/1"]);
      expect(findings[0]?.message).toBe(
        "A hole runs counter-clockwise, but RFC 7946 asks for clockwise.",
      );
    });

    it("treats the first ring of each polygon of a MultiPolygon as its exterior", () => {
      const findings = windingOrderRule.check(
        feature({
          type: "MultiPolygon",
          coordinates: [[CCW], [CW]],
        }),
        CONTEXT,
      );
      expect(paths(findings)).toEqual(["/geometry/coordinates/1/0"]);
    });

    it("reads geometries inside nested collections", () => {
      const findings = windingOrderRule.check(
        feature({
          type: "GeometryCollection",
          geometries: [
            {
              type: "GeometryCollection",
              geometries: [{ type: "Polygon", coordinates: [CW] }],
            },
          ],
        }),
        CONTEXT,
      );
      expect(paths(findings)).toEqual([
        "/geometry/geometries/0/geometries/0/coordinates/0",
      ]);
    });

    it("reads a bare geometry", () => {
      const findings = windingOrderRule.check(
        { type: "Polygon", coordinates: [CW] },
        CONTEXT,
      );
      expect(paths(findings)).toEqual(["/coordinates/0"]);
    });

    it("judges a very thin ring by its exact turn", () => {
      const sliver = [
        [0, 0],
        [2, 1],
        [4, 2.0000000000000004],
        [0, 0],
      ];
      expect(windingOrderRule.check(polygon(sliver), CONTEXT)).toEqual([]);
      expect(
        windingOrderRule.check(polygon([...sliver].reverse()), CONTEXT),
      ).toHaveLength(1);
    });

    it("skips a ring with fewer than four positions or with no area", () => {
      const threePositions = [
        [0, 0],
        [0, 1],
        [0, 0],
      ];
      const flat = [
        [0, 0],
        [1, 1],
        [2, 2],
        [0, 0],
      ];
      expect(windingOrderRule.check(polygon(threePositions), CONTEXT)).toEqual(
        [],
      );
      expect(windingOrderRule.check(polygon(flat), CONTEXT)).toEqual([]);
    });

    it("ignores lines and points", () => {
      const line = feature({ type: "LineString", coordinates: CW });
      expect(windingOrderRule.check(line, CONTEXT)).toEqual([]);
      expect(windingOrderRule.fix?.(line, CONTEXT)).toBe(line);
    });
  });

  describe("a ring across the antimeridian", () => {
    const ACROSS = [
      [178, -18],
      [-178, -18],
      [-178, -16],
      [178, -16],
      [178, -18],
    ];

    it("is not judged, because the planar test cannot tell its winding", () => {
      expect(windingOrderRule.check(polygon(ACROSS), CONTEXT)).toEqual([]);
    });

    it("is left as it is by the fix", () => {
      const item = polygon(ACROSS);
      expect(windingOrderRule.fix?.(item, CONTEXT)).toBe(item);
    });
  });

  describe("fix", () => {
    it("reverses a wrong ring, keeps it closed and keeps altitude", () => {
      const item = polygon([
        [0, 0, 5],
        [0, 2, 6],
        [2, 2, 7],
        [0, 0, 5],
      ]);
      expect(windingOrderRule.fix?.(item, CONTEXT)).toEqual(
        polygon([
          [0, 0, 5],
          [2, 2, 7],
          [0, 2, 6],
          [0, 0, 5],
        ]),
      );
    });

    it("reverses only the rings that are wrong, in a MultiPolygon with holes", () => {
      const hole = [
        [0.5, 0.5],
        [1, 0.5],
        [1, 1],
        [0.5, 1],
        [0.5, 0.5],
      ];
      const item = feature({
        type: "MultiPolygon",
        coordinates: [
          [CCW, [...hole].reverse()],
          [CW, hole],
        ],
      });
      expect(windingOrderRule.fix?.(item, CONTEXT)).toEqual(
        feature({
          type: "MultiPolygon",
          coordinates: [
            [CCW, [...hole].reverse()],
            [[...CW].reverse(), [...hole].reverse()],
          ],
        }),
      );
    });

    it("returns the same object when nothing is wrong", () => {
      const item = polygon(CCW);
      expect(windingOrderRule.fix?.(item, CONTEXT)).toBe(item);
    });

    it("shares what it did not change", () => {
      const item = feature({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [1, 1] },
          { type: "Polygon", coordinates: [CW] },
        ],
      }) as { properties: unknown; geometry: { geometries: unknown[] } };
      const fixed = windingOrderRule.fix?.(item, CONTEXT) as typeof item;
      expect(fixed).not.toBe(item);
      expect(fixed.properties).toBe(item.properties);
      expect(fixed.geometry.geometries[0]).toBe(item.geometry.geometries[0]);
    });

    it("does not mutate a frozen input", () => {
      const item = deepFreeze(polygon(CW));
      expect(() => windingOrderRule.fix?.(item, CONTEXT)).not.toThrow();
    });
  });

  describe("a ring that touches itself at its lowest vertex", () => {
    const spike = [
      [0, 0],
      [-1, -4],
      [-1, 0],
      [-1, -4],
      [0, 0],
    ];

    it("is reported as not fixable, because reversing it cannot settle its winding", () => {
      const item = polygon(spike);
      const findings = windingOrderRule.check(item, CONTEXT);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.fixable).toBe(false);
      expect(windingOrderRule.fix?.(item, CONTEXT)).toBe(item);
    });
  });

  describe("malformed input", () => {
    const deepCollection = (depth: number): unknown =>
      depth === 0
        ? { type: "Polygon", coordinates: [CW] }
        : {
            type: "GeometryCollection",
            geometries: [deepCollection(depth - 1)],
          };
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
      feature({ type: "Polygon", coordinates: [[null]] }),
      feature({ type: "Polygon", coordinates: [[["a", "b"]]] }),
      feature({
        type: "Polygon",
        coordinates: [[[0, 0], [1], [2, 2], [0, 0]]],
      }),
      feature({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
          ],
        ],
      }),
      feature({ type: "MultiPolygon", coordinates: "text" }),
      feature({ type: "MultiPolygon", coordinates: [null, "text", [null]] }),
      feature({ type: "GeometryCollection", geometries: "text" }),
      feature({ type: "GeometryCollection", geometries: [null, 3] }),
      feature(deepCollection(40)),
    ];

    it("never throws and finds nothing it cannot read", () => {
      for (const sample of samples) {
        expect(() => windingOrderRule.check(sample, CONTEXT)).not.toThrow();
        expect(() => windingOrderRule.fix?.(sample, CONTEXT)).not.toThrow();
      }
      expect(
        windingOrderRule.check(feature(deepCollection(40)), CONTEXT),
      ).toEqual([]);
    });

    it("returns malformed input unchanged", () => {
      for (const sample of samples) {
        expect(windingOrderRule.fix?.(sample, CONTEXT)).toBe(sample);
      }
    });

    it("still fixes the readable rings next to unreadable ones", () => {
      const item = feature({
        type: "Polygon",
        coordinates: [CW, "text", [[0, 0], [1]]],
      });
      const fixed = windingOrderRule.fix?.(item, CONTEXT) as {
        geometry: { coordinates: unknown[] };
      };
      expect(fixed.geometry.coordinates).toEqual([
        [...CW].reverse(),
        "text",
        [[0, 0], [1]],
      ]);
    });
  });

  describe("properties", () => {
    const coordinate = fc.integer({ min: -6, max: 6 });
    const ring = fc
      .array(fc.tuple(coordinate, coordinate), { minLength: 3, maxLength: 8 })
      .map((positions) => [...positions, positions[0]]);
    const rings = fc.array(ring, { minLength: 1, maxLength: 3 });
    const anyFeature = fc.oneof(
      rings.map((coordinates) => feature({ type: "Polygon", coordinates })),
      fc
        .array(rings, { minLength: 1, maxLength: 3 })
        .map((coordinates) => feature({ type: "MultiPolygon", coordinates })),
      rings.map((coordinates) =>
        feature({
          type: "GeometryCollection",
          geometries: [{ type: "Polygon", coordinates }],
        }),
      ),
    );

    it("fixes what it reports as fixable, idempotently, without mutating", () => {
      void fc.assert(
        fc.property(anyFeature, (item) => {
          const frozen = deepFreeze(structuredClone(item));
          const before = windingOrderRule.check(frozen, CONTEXT);
          const fixed = windingOrderRule.fix?.(frozen, CONTEXT);
          const after = windingOrderRule.check(fixed, CONTEXT);
          expect(after.every((finding) => !finding.fixable)).toBe(true);
          expect(after).toHaveLength(
            before.filter((finding) => !finding.fixable).length,
          );
          expect(windingOrderRule.fix?.(fixed, CONTEXT)).toBe(fixed);
          expect(frozen).toEqual(item);
        }),
      );
    });

    it("fixes every triangle, whichever way it runs", () => {
      const triangle = fc
        .tuple(
          fc.tuple(coordinate, coordinate),
          fc.tuple(coordinate, coordinate),
          fc.tuple(coordinate, coordinate),
        )
        .filter(([a, b, c]) => {
          const cross =
            (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
          return cross !== 0;
        })
        .map(([a, b, c]) =>
          feature({
            type: "Polygon",
            coordinates: [[a, b, c, a]],
          }),
        );
      void fc.assert(
        fc.property(triangle, (item) => {
          const fixed = windingOrderRule.fix?.(item, CONTEXT);
          expect(
            windingOrderRule.check(item, CONTEXT).every((f) => f.fixable),
          ).toBe(true);
          expect(windingOrderRule.check(fixed, CONTEXT)).toEqual([]);
        }),
      );
    });

    it("returns the same object when it has no findings", () => {
      void fc.assert(
        fc.property(anyFeature, (item) => {
          if (windingOrderRule.check(item, CONTEXT).length === 0) {
            expect(windingOrderRule.fix?.(item, CONTEXT)).toBe(item);
          }
        }),
      );
    });
  });
});
