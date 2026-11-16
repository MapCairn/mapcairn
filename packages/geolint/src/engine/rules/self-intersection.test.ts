// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleContext } from "../types.js";
import { selfIntersectionRule } from "./self-intersection.js";

const CONTEXT: RuleContext = { regions: [], countries: undefined };
const CIRCLE_DEGREES = 360;
const STAR_POINTS = 21;
const ZIGZAG_SEGMENTS = 14;

interface Expected {
  readonly path: string;
  readonly severity: string;
}

function fixture(name: string): unknown {
  const url = new URL(
    `../../../fixtures/self-intersection/${name}`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, "utf8"));
}

function check(feature: unknown) {
  return selfIntersectionRule.check(feature, CONTEXT);
}

function polygonFeature(...rings: number[][][]): unknown {
  return {
    type: "Feature",
    properties: null,
    geometry: { type: "Polygon", coordinates: rings },
  };
}

const BOW_TIE = [
  [0, 0],
  [10, 10],
  [10, 0],
  [0, 10],
  [0, 0],
];

const SQUARE = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
  [0, 0],
];

/** A regular star polygon with `points` vertices, joining every `step`th: crossing many times. */
function star(points: number, step: number): number[][] {
  const ring: number[][] = [];
  for (let i = 0; i < points; i++) {
    const angle = (((i * step) % points) * CIRCLE_DEGREES) / points;
    const radians = (angle * Math.PI) / 180;
    ring.push([Math.cos(radians) * 10, Math.sin(radians) * 10]);
  }
  ring.push(ring[0] as number[]);
  return ring;
}

/** A simple hole that zigzags across the line x = 10, crossing it once for each segment. */
function zigzagHole(segments: number): number[][] {
  const hole: number[][] = [[8, 0.5]];
  for (let i = 0; i <= segments; i++) {
    hole.push([i % 2 === 0 ? 9 : 11, 1 + i]);
  }
  const top = (hole[hole.length - 1] as number[])[1] as number;
  hole.push([8, top], [8, 0.5]);
  return hole;
}

function documentFindings(collection: unknown) {
  const features = (collection as { features: unknown[] }).features;
  return features.flatMap((feature, index) =>
    check(feature).map((finding) => ({
      path: `/features/${index}${finding.path}`,
      severity: finding.severity,
    })),
  );
}

describe("selfIntersectionRule", () => {
  it("describes itself", () => {
    expect(selfIntersectionRule).toMatchObject({
      id: "self-intersection",
      severity: "error",
      confidence: "high",
      needsRegion: false,
      fixable: false,
    });
    expect(selfIntersectionRule.summary).toMatch(/ring/);
    expect(selfIntersectionRule.fix).toBeUndefined();
  });

  it("finds nothing in the pass fixture", () => {
    expect(documentFindings(fixture("pass.geojson"))).toEqual([]);
  });

  it("finds what the fail fixture lists, in order", () => {
    expect(documentFindings(fixture("fail.geojson"))).toEqual(
      fixture("fail.expected.json") as Expected[],
    );
  });

  it("reports a bow-tie as an error with the crossing and its edges", () => {
    expect(check(polygonFeature(BOW_TIE))).toEqual([
      {
        ruleId: "self-intersection",
        severity: "error",
        confidence: "high",
        path: "/geometry/coordinates/0",
        message: "Ring crosses itself at 5, 5.",
        fixable: false,
        data: { point: [5, 5], kind: "cross", edges: [0, 2] },
      },
    ]);
  });

  it("writes a crossing that is not representable to nine decimal places", () => {
    const [finding] = check(
      polygonFeature([
        [0, 0],
        [3, 1],
        [3, 0],
        [0, 1],
        [0, 0],
      ]),
    );
    expect(finding?.message).toBe("Ring crosses itself at 1.5, 0.5.");
    const [thirds] = check(
      polygonFeature([
        [0, 0],
        [1, 1],
        [1, 0],
        [0, 2 / 3],
        [0, 0],
      ]),
    );
    expect(thirds?.message).toMatch(
      /^Ring crosses itself at 0\.\d{1,9}, 0\.\d{1,9}\.$/,
    );
  });

  it("reports a ring that touches itself at a vertex once, as a warning", () => {
    const findings = check(
      polygonFeature([
        [0, 0],
        [4, 0],
        [2, 2],
        [4, 4],
        [0, 4],
        [2, 2],
        [0, 0],
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "warning",
      confidence: "high",
      message: "Ring touches itself at 2, 2.",
      data: { point: [2, 2], kind: "touch", edges: [1, 4] },
    });
  });

  it("reports a vertex that lies exactly on another edge as a warning", () => {
    const findings = check(
      polygonFeature([
        [0, 0],
        [8, 0],
        [8, 8],
        [4, 0],
        [4, -4],
        [0, -4],
        [0, 0],
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "warning",
      data: { point: [4, 0], kind: "touch", edges: [0, 2] },
    });
  });

  it("reports a spike, where a ring doubles back over itself, as a warning", () => {
    const findings = check(
      polygonFeature([
        [0, 0],
        [8, 0],
        [4, 0],
        [4, 4],
        [0, 4],
        [0, 0],
      ]),
    );
    const overlap = findings.find(
      (finding) => finding.data?.kind === "overlap",
    );
    expect(overlap).toMatchObject({
      severity: "warning",
      message: "Ring overlaps itself along a segment starting at 4, 0.",
      data: { point: [4, 0], kind: "overlap", edges: [0, 1] },
    });
  });

  it("does not report a repeated position, a collinear vertex or a closing vertex", () => {
    expect(
      check(
        polygonFeature([
          [0, 0],
          [0, 0],
          [5, 0],
          [10, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ]),
      ),
    ).toEqual([]);
  });

  it("reads only longitude and latitude, so altitude does not hide a crossing", () => {
    const findings = check(
      polygonFeature(
        BOW_TIE.map(([x, y], index) => [x as number, y as number, index * 7]),
      ),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.data).toEqual({
      point: [5, 5],
      kind: "cross",
      edges: [0, 2],
    });
  });

  it("reports a ring that is not closed, if it crosses itself", () => {
    expect(check(polygonFeature(BOW_TIE.slice(0, 4)))).toHaveLength(1);
  });

  it("finds a ring inside a nested GeometryCollection", () => {
    const feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [1, 1] },
          {
            type: "GeometryCollection",
            geometries: [{ type: "Polygon", coordinates: [BOW_TIE] }],
          },
        ],
      },
    };
    expect(check(feature).map((finding) => finding.path)).toEqual([
      "/geometry/geometries/1/geometries/0/coordinates/0",
    ]);
  });

  it("checks a bare geometry as well as a feature", () => {
    expect(
      check({ type: "Polygon", coordinates: [BOW_TIE] }).map(
        (finding) => finding.path,
      ),
    ).toEqual(["/coordinates/0"]);
  });

  it("checks every polygon of a MultiPolygon, with holes, and points to the right ring", () => {
    const feature = {
      type: "Feature",
      properties: null,
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            SQUARE,
            [
              [2, 2],
              [6, 2],
              [6, 6],
              [2, 6],
              [2, 2],
            ],
          ],
          [
            SQUARE,
            [
              [18, 8],
              [22, 8],
              [22, 12],
              [18, 12],
              [18, 8],
            ],
          ],
          [BOW_TIE],
        ],
      },
    };
    const findings = check(feature);
    expect(findings.map((finding) => finding.path)).toEqual([
      "/geometry/coordinates/1/1",
      "/geometry/coordinates/1/1",
      "/geometry/coordinates/2/0",
    ]);
    expect(findings[0]?.message).toBe(
      "Ring crosses another ring of the same polygon at 20, 8.",
    );
    expect(findings[0]?.data).toEqual({
      point: [20, 8],
      kind: "cross",
      edges: [1, 0],
      rings: [0, 1],
    });
    expect(findings[1]?.data?.point).toEqual([20, 12]);
  });

  it("does not report rings of one polygon that merely touch", () => {
    expect(
      check(
        polygonFeature(
          SQUARE,
          [
            [0, 10],
            [5, 5],
            [5, 15],
            [0, 10],
          ],
          [
            [5, 5],
            [10, 3],
            [10, 7],
            [5, 5],
          ],
        ),
      ),
    ).toEqual([]);
  });

  it("does not report two polygons of a MultiPolygon that touch at one point", () => {
    expect(
      check({
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4],
              [0, 0],
            ],
          ],
          [
            [
              [4, 4],
              [8, 4],
              [8, 8],
              [4, 8],
              [4, 4],
            ],
          ],
        ],
      }),
    ).toEqual([]);
  });

  it("does not report a line that crosses itself", () => {
    expect(check({ type: "LineString", coordinates: BOW_TIE })).toEqual([]);
    expect(check({ type: "MultiLineString", coordinates: [BOW_TIE] })).toEqual(
      [],
    );
  });

  it("reports a ring's own crossing and a hole that crosses the exterior, each at its own ring", () => {
    const findings = check(
      polygonFeature(BOW_TIE, [
        [-5, 4],
        [-5, 6],
        [15, 6],
        [15, 4],
        [-5, 4],
      ]),
    );
    const paths = findings.map((finding) => finding.path);
    expect(paths[0]).toBe("/geometry/coordinates/0");
    expect(paths.slice(1)).toEqual(Array(8).fill("/geometry/coordinates/1"));
  });

  it("leaves the check between rings alone when a ring is cut off at the cap", () => {
    const findings = check(
      polygonFeature(star(STAR_POINTS, 10), [
        [-30, 0],
        [-30, 1],
        [30, 1],
        [30, 0],
        [-30, 0],
      ]),
    );
    expect(findings).toHaveLength(10);
    expect(
      findings.every((finding) => finding.path === "/geometry/coordinates/0"),
    ).toBe(true);
  });

  it("skips a repeated position when checking rings against each other", () => {
    const findings = check(
      polygonFeature(
        [
          [0, 0],
          [10, 0],
          [10, 0],
          [10, 20],
          [0, 20],
          [0, 0],
        ],
        [
          [8, 4],
          [8, 6],
          [12, 6],
          [12, 4],
          [8, 4],
        ],
      ),
    );
    expect(findings.map((finding) => finding.path)).toEqual([
      "/geometry/coordinates/1",
      "/geometry/coordinates/1",
    ]);
  });

  it("reports at most ten crossings in a ring, and says when there are more", () => {
    const findings = check(polygonFeature(star(STAR_POINTS, 10)));
    expect(findings).toHaveLength(10);
    expect(findings.every((finding) => finding.severity === "error")).toBe(
      true,
    );
    const messages = findings.map((finding) => finding.message);
    expect(
      messages.slice(0, -1).every((message) => message.endsWith(".")),
    ).toBe(true);
    expect(
      messages.slice(0, -1).some((message) => message.includes("more")),
    ).toBe(false);
    expect(messages[9]).toMatch(
      /Ring crosses itself at .*\. This ring has more intersections than are listed\.$/,
    );
  });

  it("reports a crossing that comes after more overlaps than the cap", () => {
    const findings = check(
      polygonFeature([
        [0, 0],
        [0, 1],
        [0, 0],
        [0, 1],
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    );
    expect(findings.length).toBeLessThanOrEqual(10);
    const crossing = findings.filter((finding) => finding.severity === "error");
    expect(crossing).toHaveLength(1);
    expect(crossing[0]?.message).toContain("Ring crosses itself at 0.5, 0.5.");
    expect(
      findings.filter((finding) => finding.message.includes("more")),
    ).toHaveLength(1);
  });

  it("keeps a crossing in the ten reported when touches and overlaps would fill them", () => {
    const spurs: number[][] = [];
    for (let index = 1; index <= 14; index++) {
      spurs.push([-1, index / 20], [0, 0]);
    }
    const findings = check(
      polygonFeature([[0, 0], ...spurs, [0, 1], [1, 0], [1, 1], [0, 0]]),
    );
    expect(findings.some((finding) => finding.severity === "error")).toBe(true);
    expect(findings.length).toBeLessThanOrEqual(10);
  });

  it("reports only warnings, and says there are more, for a ring that overlaps itself many times and never crosses", () => {
    const run: number[][] = [];
    for (let index = 0; index < 12; index++) {
      run.push([0, 1], [0, 0]);
    }
    const findings = check(polygonFeature([[0, 0], ...run, [1, 1], [0, 0]]));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.severity === "warning")).toBe(
      true,
    );
    expect(
      findings.some((finding) =>
        finding.message.includes("more intersections"),
      ),
    ).toBe(true);
  });

  it("does not claim more when a ring has fewer crossings than the cap", () => {
    const findings = check(polygonFeature(star(9, 2)));
    expect(findings).toHaveLength(9);
    expect(findings.some((finding) => finding.message.includes("more"))).toBe(
      false,
    );
  });

  it("reports one finding for several crossings at the same point", () => {
    const findings = check(
      polygonFeature([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
        [5, 10],
        [5, 0],
        [0, 0],
      ]),
    );
    const points = findings.map((finding) => String(finding.data?.point));
    expect(new Set(points).size).toBe(points.length);
  });

  it("reports at most ten crossings between rings of a polygon, and says when there are more", () => {
    const findings = check(
      polygonFeature(
        [
          [0, 0],
          [10, 0],
          [10, 20],
          [0, 20],
          [0, 0],
        ],
        zigzagHole(ZIGZAG_SEGMENTS),
      ),
    );
    expect(findings).toHaveLength(10);
    expect(
      findings.every((finding) => finding.path === "/geometry/coordinates/1"),
    ).toBe(true);
    expect(findings[9]?.message).toMatch(
      /This polygon has more crossings between its rings than are listed\.$/,
    );
    expect(findings[0]?.message).not.toMatch(/more/);
  });

  it("reports every crossing between rings when there are fewer than the cap", () => {
    const findings = check(
      polygonFeature(
        [
          [0, 0],
          [10, 0],
          [10, 20],
          [0, 20],
          [0, 0],
        ],
        zigzagHole(4),
      ),
    );
    expect(findings).toHaveLength(4);
    expect(findings.some((finding) => finding.message.includes("more"))).toBe(
      false,
    );
  });

  it("is deterministic", () => {
    const feature = polygonFeature(star(STAR_POINTS, 10));
    expect(check(feature)).toEqual(check(feature));
  });

  it("skips rings of fewer than four positions", () => {
    expect(
      check(
        polygonFeature([
          [0, 0],
          [5, 5],
          [0, 0],
        ]),
      ),
    ).toEqual([]);
    expect(
      check(
        polygonFeature(
          [[0, 0]],
          [
            [1, 1],
            [2, 2],
          ],
          [],
          BOW_TIE,
        ),
      ),
    ).toHaveLength(1);
  });

  it("does not throw on malformed input, and finds nothing in it", () => {
    const hostile: unknown[] = [
      undefined,
      null,
      true,
      0,
      "text",
      [],
      [BOW_TIE],
      {},
      { type: "Feature" },
      { type: "Feature", geometry: null },
      { type: "Feature", geometry: "Polygon" },
      { type: "Feature", geometry: { type: "Polygon" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: null } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: "x" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [null] } },
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [["a", "b"]] },
      },
      {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[0], [1], [2], [3]]] },
      },
      { type: "Feature", geometry: { type: "MultiPolygon" } },
      {
        type: "Feature",
        geometry: { type: "MultiPolygon", coordinates: [null, 3, [[]]] },
      },
      { type: "Feature", geometry: { type: "GeometryCollection" } },
      {
        type: "Feature",
        geometry: { type: "GeometryCollection", geometries: [null, "x", 4] },
      },
      {
        type: "Feature",
        geometry: { type: "Unknown", coordinates: [BOW_TIE] },
      },
    ];
    for (const value of hostile) {
      expect(() => check(value), JSON.stringify(value)).not.toThrow();
      expect(check(value), JSON.stringify(value)).toEqual([]);
    }
  });

  it("skips a ring whose coordinates were written as null in place of a number that is not finite", () => {
    const nan = JSON.parse(
      '{"type":"Polygon","coordinates":[[[0,0],[10,10],[10,0],[0,null],[0,0]]]}',
    );
    const infinity = JSON.parse(
      '{"type":"Polygon","coordinates":[[[0,0],[10,10],[10,0],[null,10],[0,0]]]}',
    );
    expect(check(nan)).toEqual([]);
    expect(check(infinity)).toEqual([]);
    expect(
      check({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [Number.NaN, 10],
            [10, 0],
            [Number.POSITIVE_INFINITY, 10],
            [0, 0],
          ],
        ],
      }),
    ).toEqual([]);
  });
});
