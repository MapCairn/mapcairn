// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inverseTransverseMercator, WGS84 } from "./crs/projections.js";
import { fixBytes } from "./fix.js";
import { type LintReport, lintBytes, lintText } from "./lint.js";
import { loadCountries } from "./regions/index.js";
import { rules } from "./rules/index.js";
import type { Finding } from "./types.js";

const TEST_DATA = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../test-data",
);

/** Lints a document (an object, or text kept as written) with the bundled country outlines. */
function lint(
  document: unknown,
  regions: readonly string[] = [],
): Promise<LintReport> {
  const text =
    typeof document === "string" ? document : JSON.stringify(document);
  return lintText(text, { regions, countries: loadCountries });
}

/** The rule id and document pointer of every finding, in report order. */
function marks(report: LintReport): string[] {
  return report.findings.map((finding) => `${finding.ruleId} ${finding.path}`);
}

function only(report: LintReport, ruleId: string): readonly Finding[] {
  return report.findings.filter((finding) => finding.ruleId === ruleId);
}

function testData(name: string): string {
  return readFileSync(path.join(TEST_DATA, name), "utf8");
}

const feature = (geometry: unknown, extra: object = {}) => ({
  type: "Feature",
  properties: {},
  geometry,
  ...extra,
});
const collection = (...features: unknown[]) => ({
  type: "FeatureCollection",
  features,
});
const pointFeature = (coordinates: readonly number[]) =>
  feature({ type: "Point", coordinates });
const onePoint = (longitude: number, latitude: number) =>
  collection(pointFeature([longitude, latitude]));

/** A counter-clockwise square ring (closed) with its lower left corner at x, y. */
const square = (x: number, y: number, size = 1): number[][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y],
];
const polygon = (...rings: number[][][]) => ({
  type: "Polygon",
  coordinates: rings,
});
const multiPolygon = (...polygons: number[][][][]) => ({
  type: "MultiPolygon",
  coordinates: polygons,
});

async function fixText(text: string): Promise<{
  output: string;
  changed: number;
  features: number;
}> {
  const bytes = new TextEncoder().encode(text);
  const stats = { features: 0, changed: 0 };
  let output = "";
  for await (const piece of fixBytes(
    (async function* () {
      yield bytes;
    })(),
    { regions: [], countries: undefined },
    rules,
    stats,
  )) {
    output += piece;
  }
  return { output, changed: stats.changed, features: stats.features };
}

/** Wraps a point in `depth` GeometryCollections. */
function nestedCollections(depth: number): unknown {
  let geometry: unknown = { type: "Point", coordinates: [30, 40] };
  for (let level = 0; level < depth; level++) {
    geometry = { type: "GeometryCollection", geometries: [geometry] };
  }
  return geometry;
}

describe("nested GeometryCollections", () => {
  const deep = (inner: unknown) => ({
    type: "GeometryCollection",
    geometries: [
      { type: "Point", coordinates: [10, 20] },
      {
        type: "GeometryCollection",
        geometries: [
          {
            type: "LineString",
            coordinates: [
              [1, 1],
              [2, 2],
              [3, 1],
            ],
          },
          {
            type: "GeometryCollection",
            geometries: [polygon(square(5, 5)), inner],
          },
        ],
      },
    ],
  });

  it("three deep with mixed valid members is clean", async () => {
    const report = await lint(
      collection(feature(deep({ type: "Point", coordinates: [7, 7] }))),
    );
    expect(report.findings).toEqual([]);
  });

  it("puts each defect at the pointer of the member that holds it", async () => {
    const wrongWay = [
      [5, 5],
      [5, 6],
      [6, 6],
      [6, 5],
      [5, 5],
    ];
    const report = await lint(
      collection(
        feature({
          type: "GeometryCollection",
          geometries: [
            { type: "Point", coordinates: [10, 20] },
            {
              type: "GeometryCollection",
              geometries: [
                {
                  type: "LineString",
                  coordinates: [
                    [1, 1],
                    [2, 2],
                    [2, 2],
                    [3, 1],
                  ],
                },
                {
                  type: "GeometryCollection",
                  geometries: [
                    polygon(wrongWay),
                    { type: "Point", coordinates: [0, 0] },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );
    expect(marks(report)).toEqual([
      "duplicate-vertices /features/0/geometry/geometries/1/geometries/0/coordinates/2",
      "winding-order /features/0/geometry/geometries/1/geometries/1/geometries/0/coordinates/0",
      "null-island /features/0/geometry/geometries/1/geometries/1/geometries/1/coordinates",
    ]);
    expect(only(report, "null-island")[0]?.severity).toBe("warning");
  });

  it("checks a hostile 31 levels and stops, with one finding, at 33", async () => {
    const at = (depth: number) =>
      lint(collection(feature(nestedCollections(depth))));
    expect((await at(31)).findings).toEqual([]);
    const tooDeep = await at(33);
    expect(tooDeep.findings.map((finding) => finding.ruleId)).toEqual([
      "structure",
    ]);
    expect(tooDeep.findings[0]?.message).toMatch(/nested too deeply/);
  });

  it("copes with 100,000 levels of nesting without throwing", async () => {
    const depth = 100_000;
    const report = await lint(
      `{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":${'{"type":"GeometryCollection","geometries":['.repeat(depth)}{"type":"Point","coordinates":[30,40]}${"]}".repeat(depth)}}]}`,
    );
    expect(report.inputError).toBeUndefined();
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "structure",
    ]);
  });
});

describe("MultiPolygons with holes", () => {
  const exterior = square(20, 20, 10);
  const hole = [
    [22, 22],
    [22, 24],
    [24, 24],
    [24, 22],
    [22, 22],
  ];

  it("a valid hole, wound clockwise, is clean", async () => {
    const report = await lint(
      collection(feature(multiPolygon([exterior, hole], [square(40, 20, 10)]))),
    );
    expect(report.findings).toEqual([]);
  });

  it("a hole wound counter-clockwise is a winding-order warning on the hole", async () => {
    const report = await lint(
      collection(
        feature(
          multiPolygon([square(40, 20, 10)], [exterior, square(22, 22, 2)]),
        ),
      ),
    );
    expect(marks(report)).toEqual([
      "winding-order /features/0/geometry/coordinates/1/1",
    ]);
    expect(report.findings[0]?.fixable).toBe(true);
  });

  it("a hole that crosses the exterior is a self-intersection error on the hole", async () => {
    const crossing = [
      [28, 22],
      [28, 24],
      [32, 24],
      [32, 22],
      [28, 22],
    ];
    const report = await lint(collection(feature(polygon(exterior, crossing))));
    expect(marks(report)).toEqual([
      "self-intersection /features/0/geometry/coordinates/1",
      "self-intersection /features/0/geometry/coordinates/1",
    ]);
    expect(
      report.findings.every((finding) => finding.severity === "error"),
    ).toBe(true);
  });

  it("a hole that touches the exterior at one vertex is valid and clean", async () => {
    const touching = [
      [20, 25],
      [22, 27],
      [22, 23],
      [20, 25],
    ];
    const report = await lint(collection(feature(polygon(exterior, touching))));
    expect(report.findings).toEqual([]);
  });

  // The README says holes that touch are fine but is silent on a hole that is
  // wholly outside its exterior, which RFC 7946 and OGC both call invalid.
  it("a hole wholly outside its exterior is not reported (a gap the README does not state)", async () => {
    const outside = [
      [60, 60],
      [60, 62],
      [62, 62],
      [62, 60],
      [60, 60],
    ];
    const report = await lint(collection(feature(polygon(exterior, outside))));
    expect(report.findings).toEqual([]);
  });

  it("a hole that shares an edge with the exterior is not reported", async () => {
    const edge = [
      [20, 22],
      [20, 24],
      [22, 24],
      [22, 22],
      [20, 22],
    ];
    const report = await lint(collection(feature(polygon(exterior, edge))));
    expect(marks(report)).toEqual([]);
  });
});

describe("3D and 4D positions", () => {
  it("altitude is accepted and kept by --fix", async () => {
    const text = JSON.stringify(
      collection(
        feature(
          polygon([
            [10, 10, 5],
            [10, 11, 6],
            [11, 11, 7],
            [11, 10, 8],
          ]),
        ),
      ),
    );
    const before = await lint(text);
    expect(marks(before)).toEqual([
      "unclosed-ring /features/0/geometry/coordinates/0",
      "winding-order /features/0/geometry/coordinates/0",
    ]);
    const fixed = await fixText(text);
    expect(JSON.parse(fixed.output)).toEqual(
      collection(
        feature(
          polygon([
            [10, 10, 5],
            [11, 10, 8],
            [11, 11, 7],
            [10, 11, 6],
            [10, 10, 5],
          ]),
        ),
      ),
    );
    expect((await lint(fixed.output)).findings).toEqual([]);
  });

  it("rounds an altitude to seven decimals with the longitude and latitude", async () => {
    const fixed = await fixText(
      JSON.stringify(onePoint(1.123456789012, 2.5)).replace(
        "2.5]",
        "2.5,100.123456789]",
      ),
    );
    expect(JSON.parse(fixed.output).features[0].geometry.coordinates).toEqual([
      1.1234568, 2.5, 100.1234568,
    ]);
  });

  it("a fourth number is a structure warning, and --fix leaves it as it was", async () => {
    const text = JSON.stringify(
      collection(pointFeature([1.5, 2.5, 3, 4.123456789012])),
    );
    const report = await lint(text);
    expect(marks(report)).toEqual([
      "structure /features/0/geometry/coordinates",
    ]);
    expect(report.findings[0]?.severity).toBe("warning");
    const fixed = await fixText(text);
    expect(fixed.changed).toBe(0);
  });

  it("an altitude does not stop a position at 0, 0 being Null Island", async () => {
    const report = await lint(collection(pointFeature([0, 0, 120])));
    expect(marks(report)).toEqual([
      "null-island /features/0/geometry/coordinates",
    ]);
  });
});

describe("empty and missing geometry", () => {
  it("a null geometry is information only", async () => {
    const report = await lint(collection(feature(null)));
    expect(marks(report)).toEqual(["empty-geometry /features/0/geometry"]);
    expect(report.findings[0]).toMatchObject({
      severity: "info",
      confidence: "medium",
    });
  });

  it("a feature with no geometry member is a structure error on the feature, and nothing else", async () => {
    const report = await lint(collection({ type: "Feature", properties: {} }));
    expect(marks(report)).toEqual(["structure /features/0"]);
  });

  it("an empty Polygon, an empty ring and an empty collection each report once", async () => {
    const report = await lint(
      collection(
        feature(polygon()),
        feature({ type: "GeometryCollection", geometries: [] }),
        feature(polygon([])),
      ),
    );
    expect(marks(report)).toEqual([
      "empty-geometry /features/0/geometry",
      "empty-geometry /features/1/geometry",
      "empty-geometry /features/2/geometry",
      "structure /features/2/geometry/coordinates/0",
    ]);
  });

  it("an empty member of a collection is reported at the member, and its sibling is not", async () => {
    const report = await lint(
      collection(
        feature({
          type: "GeometryCollection",
          geometries: [
            { type: "MultiPoint", coordinates: [] },
            { type: "Point", coordinates: [3, 4] },
          ],
        }),
      ),
    );
    expect(marks(report)).toEqual([
      "empty-geometry /features/0/geometry/geometries/0",
    ]);
  });

  it("an empty FeatureCollection is clean", async () => {
    const report = await lint(collection());
    expect(report).toMatchObject({ findings: [], featureCount: 0 });
  });
});

describe("points, touching polygons and rings that touch themselves", () => {
  it("a point exactly on a ring vertex is clean", async () => {
    const report = await lint(
      collection(
        feature({
          type: "GeometryCollection",
          geometries: [
            polygon(square(10, 10)),
            { type: "Point", coordinates: [11, 11] },
          ],
        }),
      ),
    );
    expect(report.findings).toEqual([]);
  });

  it("two polygons touching at exactly one point are valid and clean", async () => {
    const report = await lint(
      collection(feature(multiPolygon([square(10, 10)], [square(11, 11)]))),
    );
    expect(report.findings).toEqual([]);
  });

  // OGC calls polygons of a MultiPolygon that share a segment invalid; the
  // README only says that polygons which touch are not reported, so this pins
  // what happens.
  it("two polygons sharing a whole segment are not reported", async () => {
    const report = await lint(
      collection(feature(multiPolygon([square(10, 10)], [square(11, 10)]))),
    );
    expect(report.findings).toEqual([]);
  });

  // Likewise two polygons of one MultiPolygon that overlap in area: no rule
  // looks between polygons at all.
  it("two polygons of a MultiPolygon that overlap in area are not reported", async () => {
    const report = await lint(
      collection(
        feature(multiPolygon([square(10, 10, 2)], [square(11, 11, 2)])),
      ),
    );
    expect(report.findings).toEqual([]);
  });

  it("a ring touching itself at one vertex is one self-intersection warning at the ring", async () => {
    const bowTie = [
      [10, 10],
      [12, 10],
      [11, 11],
      [12, 12],
      [10, 12],
      [11, 11],
      [10, 10],
    ];
    const report = await lint(collection(feature(polygon(bowTie))));
    expect(marks(report)).toEqual([
      "self-intersection /features/0/geometry/coordinates/0",
    ]);
    expect(report.findings[0]).toMatchObject({
      severity: "warning",
      data: { kind: "touch", point: [11, 11] },
    });
  });

  it("a ring that crosses itself is an error with the crossing point", async () => {
    const cross = [
      [10, 10],
      [12, 12],
      [12, 10],
      [10, 12],
      [10, 10],
    ];
    const report = await lint(collection(feature(polygon(cross))));
    expect(marks(report)).toEqual([
      "self-intersection /features/0/geometry/coordinates/0",
    ]);
    expect(report.findings[0]).toMatchObject({
      severity: "error",
      data: { kind: "cross", point: [11, 11] },
    });
  });

  it("collinear and zero-area rings overlap themselves but have no winding to get wrong", async () => {
    const flat = await lint(
      collection(
        feature(
          polygon([
            [10, 10],
            [11, 10],
            [12, 10],
            [13, 10],
            [10, 10],
          ]),
        ),
      ),
    );
    expect(marks(flat)).toEqual([
      "self-intersection /features/0/geometry/coordinates/0",
      "self-intersection /features/0/geometry/coordinates/0",
      "self-intersection /features/0/geometry/coordinates/0",
    ]);
    expect(
      flat.findings.every((finding) => finding.severity === "warning"),
    ).toBe(true);
  });

  it("a ring of one repeated position is a duplicate-vertices finding and no more", async () => {
    const report = await lint(
      collection(
        feature(
          polygon([
            [5, 5],
            [5, 5],
            [5, 5],
            [5, 5],
          ]),
        ),
      ),
    );
    expect(marks(report)).toEqual([
      "duplicate-vertices /features/0/geometry/coordinates/0/1",
    ]);
    expect(report.findings[0]?.fixable).toBe(false);
  });

  it("a ring with a spike (out and back along one line) is reported as overlapping, not crossing", async () => {
    const report = await lint(
      collection(
        feature(
          polygon([
            [10, 10],
            [12, 10],
            [12, 12],
            [12, 10],
            [10, 10],
          ]),
        ),
      ),
    );
    expect(
      report.findings.every((finding) => finding.severity === "warning"),
    ).toBe(true);
    expect(report.findings.length).toBeGreaterThan(0);
  });
});

describe("the document root", () => {
  const structureAt = async (text: string) => marks(await lint(text));

  it("a bare geometry is linted, with pointers that start at the geometry", async () => {
    const report = await lint({
      type: "Polygon",
      coordinates: [
        [
          [10, 10],
          [10, 11],
          [11, 11],
          [11, 10],
          [10, 10],
        ],
      ],
    });
    expect(marks(report)).toEqual(["winding-order /coordinates/0"]);
    expect(report.featureCount).toBe(1);
  });

  it("a bare Point at 0, 0 is reported at /coordinates", async () => {
    const report = await lint({ type: "Point", coordinates: [0, 0] });
    expect(marks(report)).toEqual(["null-island /coordinates"]);
  });

  it("a root Feature is linted, with pointers that start at the feature", async () => {
    const report = await lint(
      feature({ type: "Point", coordinates: [200, 10] }),
    );
    expect(marks(report)).toEqual(["antimeridian /geometry/coordinates"]);
  });

  it.each([
    ["an array", "[]"],
    ["a string", '"hello"'],
    ["null", "null"],
    ["a number", "5"],
    ["an empty object", "{}"],
  ])(
    "a root that is %s is one structure error at the document",
    async (_name, text) => {
      const report = await lint(text);
      expect(report.inputError).toBeUndefined();
      expect(marks(report)).toEqual(["structure "]);
      expect(report.featureCount).toBe(0);
    },
  );

  it("a lower-case type is rejected, not guessed at", async () => {
    expect(
      await structureAt('{"type":"featurecollection","features":[]}'),
    ).toEqual(["structure /type"]);
  });

  it.each([
    ["an object", '{"type":"FeatureCollection","features":{}}'],
    ["missing", '{"type":"FeatureCollection"}'],
    ["null", '{"type":"FeatureCollection","features":null}'],
  ])(
    "a FeatureCollection whose features is %s is a structure error at /features",
    async (_name, text) => {
      expect(await structureAt(text)).toEqual(["structure /features"]);
    },
  );

  it("a FeatureCollection inside a FeatureCollection is reported at the inner type", async () => {
    expect(
      await structureAt(
        JSON.stringify(collection({ type: "FeatureCollection", features: [] })),
      ),
    ).toEqual(["structure /features/0/type"]);
  });

  it("a Feature used as a geometry is reported at the geometry type", async () => {
    const report = await lint(
      collection({
        type: "Feature",
        properties: null,
        geometry: { type: "Feature", properties: null, geometry: null },
      }),
    );
    expect(marks(report)).toEqual(["structure /features/0/geometry/type"]);
  });

  it("a crs member after the features is still found, at /crs", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[1,2]}}],"crs":{"type":"name","properties":{"name":"EPSG:27700"}}}',
    );
    expect(marks(report)).toEqual(["deprecated-crs-member /crs"]);
    expect(report.findings[0]?.severity).toBe("warning");
  });

  it.each([
    ["null", null, "info"],
    [
      "CRS84",
      { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      "info",
    ],
    ["EPSG:4326", { type: "name", properties: { name: "EPSG:4326" } }, "info"],
    [
      "EPSG::4326 as a URN",
      { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::4326" } },
      "info",
    ],
    [
      "EPSG:3857",
      { type: "name", properties: { name: "EPSG:3857" } },
      "warning",
    ],
    [
      "a link",
      {
        type: "link",
        properties: { href: "http://example.org/crs", type: "proj4" },
      },
      "warning",
    ],
    ["a string", "weird", "warning"],
    ["a number", 5, "warning"],
  ])("a crs of %s is %s", async (_name, crs, severity) => {
    const report = await lint(
      JSON.stringify({ type: "FeatureCollection", crs, features: [] }),
    );
    expect(marks(report)).toEqual(["deprecated-crs-member /crs"]);
    expect(report.findings[0]?.severity).toBe(severity);
  });

  it("a crs on a feature, and on a geometry, is found at its own pointer", async () => {
    const crs = { type: "name", properties: { name: "EPSG:3857" } };
    const report = await lint(
      collection(
        feature({ type: "Point", coordinates: [1, 2] }, { crs }),
        feature({ type: "Point", coordinates: [1, 2], crs }),
      ),
    );
    expect(marks(report)).toEqual([
      "deprecated-crs-member /features/0/crs",
      "deprecated-crs-member /features/1/geometry/crs",
    ]);
  });

  it("a duplicate type member: the last one wins, as in JSON.parse", async () => {
    const report = await lint(
      '{"type":"Feature","type":"Point","properties":null,"geometry":null}',
    );
    expect(marks(report)).toEqual(["structure /coordinates"]);
  });

  it("a UTF-8 byte order mark at the start is accepted", async () => {
    const report = await lint(`﻿${JSON.stringify(onePoint(18.4, -33.9))}`);
    expect(report).toMatchObject({ findings: [], featureCount: 1 });
    expect(report.inputError).toBeUndefined();
  });

  it("a byte order mark is accepted when it arrives alone in the first chunk", async () => {
    const body = new TextEncoder().encode(
      JSON.stringify(onePoint(18.4, -33.9)),
    );
    const report = await lintBytes(
      (async function* () {
        yield new Uint8Array([0xef, 0xbb, 0xbf]);
        yield body;
      })(),
    );
    expect(report.inputError).toBeUndefined();
    expect(report.featureCount).toBe(1);
  });

  it("an integer too large for a double is read, and flagged as outside longitude and latitude", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[12345678901234567890123,1]}}]}',
    );
    expect(marks(report)).toEqual([
      "projected-coords /features/0/geometry/coordinates",
    ]);
  });

  it.each([
    ["1e999", "[1e999,1]", "/features/0/geometry/coordinates/0"],
    ["-1e999", "[-1e999,1]", "/features/0/geometry/coordinates/0"],
  ])(
    "%s is read as infinity and reported as a structure error",
    async (_name, coordinates, pointer) => {
      const report = await lint(
        `{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":${coordinates}}}]}`,
      );
      expect(marks(report)).toEqual([`structure ${pointer}`]);
    },
  );

  it("a lone surrogate escape in a string is read without trouble", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"n":"\\ud800"},"geometry":null}]}',
    );
    expect(report.inputError).toBeUndefined();
    expect(marks(report)).toEqual(["empty-geometry /features/0/geometry"]);
  });

  it("a __proto__ member is data, and pollutes nothing", async () => {
    const report = await lint(
      '{"__proto__":{"type":"Point"},"type":"FeatureCollection","features":[{"type":"Feature","properties":{"__proto__":{"polluted":1}},"geometry":null,"__proto__":{"geometry":5}}]}',
    );
    expect(report.inputError).toBeUndefined();
    expect(marks(report)).toEqual(["empty-geometry /features/0/geometry"]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).geometry).toBeUndefined();
  });

  // A repeated features member: JSON.parse would keep the last, so an empty
  // decoy before the real array must not hide it. Lint and fix both use the
  // first array, and the repeat is reported and kept as written.
  describe("a document with two features members", () => {
    const real =
      '{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[1000,2000]}}';
    const text = `{"type":"FeatureCollection","features":[],"features":[${real}]}`;

    it("is linted and fixed on the same first array", async () => {
      const report = await lint(text);
      const fixed = await fixText(text);
      expect(report.featureCount).toBe(0);
      expect(report.featureCount).toBe(fixed.features);
    });

    it("reports the repeat as a structure error at /features", async () => {
      const report = await lint(text);
      expect(marks(report)).toEqual(["structure /features"]);
      expect(report.findings[0]).toMatchObject({ severity: "error" });
      expect(report.findings[0]?.message).toContain("repeated");
      expect(report.findings[0]?.message).toContain("first");
    });

    it("keeps the later array in the fixed copy, unchanged and unfixed", async () => {
      const fixed = await fixText(text);
      expect(fixed.output).toBe(text);
      expect(fixed.changed).toBe(0);
      expect(JSON.parse(fixed.output).features).toHaveLength(1);
    });

    it("fixes the first array and copies the later one as written", async () => {
      const unclosed =
        '{"type":"Feature","properties":null,"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}}';
      const spaced = `[ ${real} , ${real} ]`;
      const document = `{"features":[${unclosed}],"x":1,"features": ${spaced} ,"features":5}`;
      const fixed = await fixText(document);
      expect(fixed.features).toBe(1);
      const parsed = JSON.parse(fixed.output);
      expect(parsed.x).toBe(1);
      expect(fixed.output).toContain(`"features":[${real},${real}]`);
      expect(fixed.output.endsWith(',"features":5}')).toBe(true);
    });

    it("keeps a repeated array that follows a features member that is not an array", async () => {
      const document = `{"type":"FeatureCollection","features":null,"features":[${real},${real}],"after":1}`;
      const fixed = await fixText(document);
      expect(fixed.output).toBe(document);
      const report = await lint(document);
      expect(marks(report)).toEqual([
        "structure /features",
        "structure /features",
      ]);
    });

    it("rejects an invalid element in a repeated array", async () => {
      await expect(fixText('{"features":[],"features":[1,}')).rejects.toThrow();
      await expect(
        fixText('{"features":[],"features":[{"a":}]}'),
      ).rejects.toThrow();
    });

    it("keeps an empty repeated array at the end of the document", async () => {
      const document = '{"features":[],"features":[]}';
      const fixed = await fixText(document);
      expect(fixed.output).toBe(document);
    });
  });

  it.each([
    ["empty input", ""],
    ["whitespace only", "   "],
    ["trailing text", '{"type":"FeatureCollection","features":[]} x'],
    [
      "two roots",
      '{"type":"FeatureCollection","features":[]}{"type":"FeatureCollection","features":[]}',
    ],
    ["NaN", '{"type":"Point","coordinates":[NaN,1]}'],
    ["single quotes", "{'type':'Point'}"],
  ])("%s is an input error, not an exception", async (_name, text) => {
    const report = await lint(text);
    expect(report.inputError).toBeDefined();
    expect(report.inputError?.offset).toBeGreaterThanOrEqual(0);
    expect(report.inputError?.offset).toBeLessThanOrEqual(text.length);
  });
});

describe("a very large FeatureCollection", () => {
  const COUNT = 10_000;

  function bigCollection(): string {
    const parts: string[] = [];
    for (let index = 0; index < COUNT; index++) {
      const longitude = 10 + (index % 100) * 0.01;
      const latitude = 20 + Math.floor(index / 100) * 0.01;
      parts.push(
        `{"type":"Feature","properties":{"i":${index}},"geometry":{"type":"Point","coordinates":[${longitude},${latitude}]}}`,
      );
    }
    return `{"type":"FeatureCollection","features":[${parts.join(",")}]}`;
  }

  it("counts every feature and is clean", async () => {
    const report = await lint(bigCollection());
    expect(report.featureCount).toBe(COUNT);
    expect(report.findings).toEqual([]);
  });

  it("puts a finding in feature 9,999 at the right pointer, ordered by number and not by text", async () => {
    const features = JSON.parse(bigCollection()).features as unknown[];
    for (const index of [2, 10, 100, 1000, 9999]) {
      features[index] = feature({ type: "Point", coordinates: [0, 0] });
    }
    const report = await lint({ type: "FeatureCollection", features });
    expect(report.featureCount).toBe(COUNT);
    expect(marks(report)).toEqual(
      [2, 10, 100, 1000, 9999].map(
        (index) => `null-island /features/${index}/geometry/coordinates`,
      ),
    );
  });

  it("a single-byte-chunk read gives the same report as one chunk", async () => {
    const text = JSON.stringify({
      type: "FeatureCollection",
      features: Array.from({ length: 50 }, (_, index) =>
        index === 49
          ? feature({ type: "Point", coordinates: [0, 0] })
          : pointFeature([Number((10 + index * 0.1).toFixed(1)), 20]),
      ),
    });
    const bytes = new TextEncoder().encode(text);
    const bytewise = await lintBytes(
      (async function* () {
        for (const byte of bytes) {
          yield new Uint8Array([byte]);
        }
      })(),
    );
    expect(bytewise).toEqual(await lint(text));
    expect(marks(bytewise)).toEqual([
      "null-island /features/49/geometry/coordinates",
    ]);
  });
});

describe("the antimeridian, with real outlines", () => {
  it.each([
    ["Fiji, split at 180", "fiji-split.geojson"],
    ["Taveuni, split at 180", "fiji-taveuni-split.geojson"],
  ])("%s is clean, with and without --region FJ", async (_name, file) => {
    expect((await lint(testData(file))).findings).toEqual([]);
    expect((await lint(testData(file), ["FJ"])).findings).toEqual([]);
  });

  it.each([["eastern Russia, split at 180", "russia-chukotka-split.geojson"]])(
    "%s is clean, with and without --region RU",
    async (_name, file) => {
      expect((await lint(testData(file))).findings).toEqual([]);
      expect((await lint(testData(file), ["RU"])).findings).toEqual([]);
    },
  );

  it("Taveuni drawn as one ring across 180 is flagged at both long steps", async () => {
    const text = testData("fiji-unsplit.geojson");
    const expected = [
      "winding-order /features/0/geometry/coordinates/0",
      "antimeridian /features/0/geometry/coordinates/0/1",
      "antimeridian /features/0/geometry/coordinates/0/3",
    ];
    expect(marks(await lint(text))).toEqual(expected);
    expect(marks(await lint(text, ["FJ"]))).toEqual(expected);
  });

  it("Wrangel Island drawn as one ring across 180 is flagged, with and without --region RU", async () => {
    const text = testData("russia-wrangel-unsplit.geojson");
    const expected = [
      "winding-order /features/0/geometry/coordinates/0",
      "antimeridian /features/0/geometry/coordinates/0/1",
      "antimeridian /features/0/geometry/coordinates/0/3",
    ];
    expect(marks(await lint(text))).toEqual(expected);
    expect(marks(await lint(text, ["RU"]))).toEqual(expected);
  });

  it.each([
    [
      "Fiji",
      "fiji-0-360.geojson",
      "FJ",
      "/features/0/geometry/coordinates/2/0/0",
    ],
    [
      "Taveuni",
      "fiji-taveuni-0-360.geojson",
      "FJ",
      "/features/0/geometry/coordinates/0/1",
    ],
    [
      "eastern Russia",
      "russia-chukotka-0-360.geojson",
      "RU",
      "/features/0/geometry/coordinates/1/0/0",
    ],
  ])(
    "%s on a 0 to 360 scale is flagged at the first longitude past 180, with and without a region",
    async (_name, file, region, at) => {
      const expected = [`antimeridian ${at}`];
      expect(marks(await lint(testData(file)))).toEqual(expected);
      expect(marks(await lint(testData(file), [region]))).toEqual(expected);
    },
  );

  it("a longitude of exactly 180 is fine, 180.0000001 is not, and neither is -180.5", async () => {
    const edge = (longitude: number) =>
      lint(collection(pointFeature([longitude, 10])));
    expect((await edge(180)).findings).toEqual([]);
    expect((await edge(-180)).findings).toEqual([]);
    expect(marks(await edge(180.0000001))).toEqual([
      "antimeridian /features/0/geometry/coordinates",
    ]);
    expect(marks(await edge(-180.5))).toEqual([
      "antimeridian /features/0/geometry/coordinates",
    ]);
  });

  it("a step of exactly 180 degrees is not read as crossing (it could go either way)", async () => {
    const report = await lint(
      collection(
        feature({
          type: "LineString",
          coordinates: [
            [-90, 10],
            [90, 10],
          ],
        }),
      ),
    );
    expect(report.findings).toEqual([]);
  });

  it("a step of 181 degrees is", async () => {
    const report = await lint(
      collection(
        feature({
          type: "LineString",
          coordinates: [
            [-90.5, 10],
            [90.5, 10],
          ],
        }),
      ),
    );
    expect(marks(report)).toEqual([
      "antimeridian /features/0/geometry/coordinates/1",
    ]);
  });

  it("a Fiji outline checked against NZ stays quiet, because about half of its own vertices sit on the outline and are not placed", async () => {
    // Surprise: `locate` has no coastline allowance, so a position that is
    // exactly a vertex of an outline is often "inside" no country. A feature
    // drawn from the outline itself is then not placed in Fiji, and the
    // region-mismatch rule needs half of the positions placed.
    const countries = await loadCountries();
    const document = JSON.parse(testData("fiji-split.geojson"));
    const vertices: number[][] =
      document.features[0].geometry.coordinates.flat(2);
    const unplaced = vertices.filter(
      ([longitude, latitude]) =>
        countries.locate(longitude as number, latitude as number) === undefined,
    );
    expect(unplaced.length * 2).toBeGreaterThanOrEqual(vertices.length);
    expect(
      (await lint(testData("fiji-split.geojson"), ["NZ"])).findings,
    ).toEqual([]);
  });
});

describe("France and its overseas territories", () => {
  const at = (longitude: number, latitude: number, region = "FR") =>
    lint(onePoint(longitude, latitude), [region]);

  it("Paris, Ajaccio (Corsica) and Cayenne (French Guiana) are in the outline for FR", async () => {
    expect((await at(2.3522, 48.8566)).findings).toEqual([]);
    expect((await at(8.7386, 41.9192)).findings).toEqual([]);
    expect((await at(-52.3135, 4.9372)).findings).toEqual([]);
  });

  it("Saint-Denis (Reunion) is in no outline, so it is quiet for FR and for ZA alike", async () => {
    // Intended, and stated in the README: an island the outlines lack looks
    // like open sea, so nothing can be said about it.
    expect((await at(55.4551, -20.8789)).findings).toEqual([]);
    expect((await at(55.4551, -20.8789, "ZA")).findings).toEqual([]);
  });

  it("Fort-de-France (Martinique) and Mayotte are also quiet for FR", async () => {
    expect((await at(-61.0242, 14.6161)).findings).toEqual([]);
    expect((await at(45.2279, -12.7809)).findings).toEqual([]);
  });

  it("Papeete (French Polynesia) is reported against FR, because the outlines keep PF as its own country", async () => {
    // Surprise: legally France, but ISO 3166-1 gives it its own code, so it is
    // "inside another country's outline". Territories with their own ISO code
    // (PF, GL, PR) are other countries to this rule.
    const countries = await loadCountries();
    expect(countries.locate(-149.5585, -17.5516)).toBe("PF");
    expect(marks(await at(-149.5585, -17.5516))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
  });

  it("Cayenne is reported against ZA and against BR", async () => {
    expect(marks(await at(-52.3135, 4.9372, "ZA"))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
    expect(marks(await at(-52.3135, 4.9372, "BR"))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
  });

  it("a swapped Cayenne is a high-confidence coordinate-order warning for FR", async () => {
    const report = await at(4.9372, -52.3135);
    expect(marks(report)).toEqual([
      "coordinate-order /features/0/geometry/coordinates",
    ]);
    expect(report.findings[0]).toMatchObject({
      severity: "warning",
      confidence: "high",
    });
  });
});

describe("tiny countries", () => {
  const at = (longitude: number, latitude: number, region: string) =>
    lint(onePoint(longitude, latitude), [region]);
  const VATICAN: [number, number] = [12.4534, 41.9029];
  const MONACO: [number, number] = [7.4246, 43.7384];
  /** One kilometre of latitude, in degrees. */
  const KILOMETRE = 1 / 111.2;
  /** A latitude a number of kilometres north, to four decimals (so that the precision rule has nothing to say). */
  const north = (latitude: number, kilometres: number) =>
    Number((latitude + kilometres * KILOMETRE).toFixed(4));

  it("points inside Vatican City and Monaco are clean", async () => {
    expect((await at(...VATICAN, "VA")).findings).toEqual([]);
    expect((await at(...MONACO, "MC")).findings).toEqual([]);
  });

  it("a point 5 km outside is still clean, because the allowance (0.05 degrees) is larger than the country", async () => {
    expect((await at(VATICAN[0], north(VATICAN[1], 5), "VA")).findings).toEqual(
      [],
    );
    expect((await at(MONACO[0], north(MONACO[1], 5), "MC")).findings).toEqual(
      [],
    );
  });

  it("a point 10 km outside is reported against the tiny country", async () => {
    expect(marks(await at(VATICAN[0], north(VATICAN[1], 10), "VA"))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
    expect(marks(await at(MONACO[0], north(MONACO[1], 10), "MC"))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
  });

  it("Rome's centre is reported against VA", async () => {
    expect(marks(await at(12.4964, 41.9028, "VA"))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
  });

  it("Monaco counts as inside France and Italy too (the allowance reaches over the border)", async () => {
    expect((await at(...MONACO, "FR")).findings).toEqual([]);
    expect((await at(...MONACO, "IT")).findings).toEqual([]);
    expect((await at(...VATICAN, "IT")).findings).toEqual([]);
  });

  it("a swapped Monaco point and a swapped Vatican point are high-confidence swaps for their own region", async () => {
    for (const [region, [longitude, latitude]] of [
      ["MC", MONACO],
      ["VA", VATICAN],
    ] as const) {
      const report = await at(latitude, longitude, region);
      expect(marks(report)).toEqual([
        "coordinate-order /features/0/geometry/coordinates",
      ]);
      expect(report.findings[0]?.confidence).toBe("high");
    }
  });

  it("a swapped Monaco point without a region is silent (both orders are valid)", async () => {
    expect((await lint(onePoint(MONACO[1], MONACO[0]))).findings).toEqual([]);
  });
});

describe("swapped cities, with and without a region", () => {
  const swapped = (longitude: number, latitude: number, regions: string[]) =>
    lint(onePoint(latitude, longitude), regions);

  it("Perth swapped is info and low without a region, a high warning with AU", async () => {
    const without = await swapped(115.8605, -31.9505, []);
    expect(
      without.findings.map((f) => `${f.ruleId} ${f.severity}/${f.confidence}`),
    ).toEqual(["coordinate-order info/low"]);
    const withRegion = await swapped(115.8605, -31.9505, ["AU"]);
    expect(
      withRegion.findings.map(
        (f) => `${f.ruleId} ${f.severity}/${f.confidence}`,
      ),
    ).toEqual(["coordinate-order warning/high"]);
  });

  it("Sydney swapped is found the same way", async () => {
    const report = await swapped(151.2093, -33.8688, ["AU"]);
    expect(only(report, "coordinate-order")[0]).toMatchObject({
      severity: "warning",
      confidence: "high",
      path: "/features/0/geometry/coordinates",
    });
  });

  it("Cape Town swapped is silent without a region (README limitation) and found with ZA", async () => {
    expect((await swapped(18.4241, -33.9249, [])).findings).toEqual([]);
    const report = await swapped(18.4241, -33.9249, ["ZA"]);
    expect(marks(report)).toEqual([
      "coordinate-order /features/0/geometry/coordinates",
    ]);
    expect(report.findings[0]).toMatchObject({
      severity: "warning",
      confidence: "high",
    });
  });

  it("Cape Town swapped is silent when the region is wrong, too", async () => {
    expect((await swapped(18.4241, -33.9249, ["AU"])).findings).toEqual([]);
  });

  it("the true order for Perth, Sydney and Cape Town is clean with their own region", async () => {
    for (const [longitude, latitude, region] of [
      [115.8605, -31.9505, "AU"],
      [151.2093, -33.8688, "AU"],
      [18.4241, -33.9249, "ZA"],
    ] as const) {
      expect(
        (await lint(onePoint(longitude, latitude), [region])).findings,
      ).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Projection and places, for the guesses
// ---------------------------------------------------------------------------

const RADIANS = Math.PI / 180;
const EARTH_RADIUS = 6378137;

/** Web Mercator (EPSG:3857) metres from longitude and latitude. */
function webMercator(longitude: number, latitude: number): [number, number] {
  return [
    EARTH_RADIUS * longitude * RADIANS,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (latitude * RADIANS) / 2)),
  ];
}

interface UtmPosition {
  readonly easting: number;
  readonly northing: number;
  readonly zone: number;
  readonly north: boolean;
  readonly code: string;
}

/** WGS 84 / UTM from longitude and latitude, by the Kruger series to fourth order. */
function utm(longitude: number, latitude: number): UtmPosition {
  const zone = Math.floor((longitude + 180) / 6) + 1;
  const north = latitude >= 0;
  const flattening = 1 / 298.257223563;
  const n = flattening / (2 - flattening);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const rectifying = (EARTH_RADIUS / (1 + n)) * (1 + n2 / 4 + n4 / 64);
  const alpha = [
    n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440,
    (61 * n3) / 240 - (103 * n4) / 140,
    (49561 * n4) / 161280,
  ];
  const phi = latitude * RADIANS;
  const lambda = (longitude - (zone * 6 - 183)) * RADIANS;
  const c = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(
    Math.atanh(Math.sin(phi)) - c * Math.atanh(c * Math.sin(phi)),
  );
  const xiPrime = Math.atan2(t, Math.cos(lambda));
  const etaPrime = Math.atanh(Math.sin(lambda) / Math.sqrt(1 + t * t));
  let xi = xiPrime;
  let eta = etaPrime;
  alpha.forEach((coefficient, index) => {
    const order = 2 * (index + 1);
    xi += coefficient * Math.sin(order * xiPrime) * Math.cosh(order * etaPrime);
    eta +=
      coefficient * Math.cos(order * xiPrime) * Math.sinh(order * etaPrime);
  });
  return {
    easting: 500000 + 0.9996 * rectifying * eta,
    northing: (north ? 0 : 10000000) + 0.9996 * rectifying * xi,
    zone,
    north,
    code: `EPSG:${(north ? 32600 : 32700) + zone}`,
  };
}

interface Place {
  readonly name: string;
  readonly region: string;
  readonly longitude: number;
  readonly latitude: number;
}

const place = (
  name: string,
  region: string,
  longitude: number,
  latitude: number,
): Place => ({ name, region, longitude, latitude });

/** Well-known places on every inhabited continent, with their true longitude and latitude. */
const PLACES: readonly Place[] = [
  place("Cape Town", "ZA", 18.4241, -33.9249),
  place("Johannesburg", "ZA", 28.0473, -26.2041),
  place("Nairobi", "KE", 36.8219, -1.2921),
  place("Lagos", "NG", 3.3792, 6.5244),
  place("Cairo", "EG", 31.2357, 30.0444),
  place("Addis Ababa", "ET", 38.7578, 9.0054),
  place("Dakar", "SN", -17.4677, 14.7167),
  place("Accra", "GH", -0.187, 5.6037),
  place("London", "GB", -0.1276, 51.5072),
  place("Paris", "FR", 2.3522, 48.8566),
  place("Berlin", "DE", 13.405, 52.52),
  place("Madrid", "ES", -3.7038, 40.4168),
  place("Rome", "IT", 12.4964, 41.9028),
  place("Moscow", "RU", 37.6173, 55.7558),
  place("Oslo", "NO", 10.7522, 59.9139),
  place("Athens", "GR", 23.7275, 37.9838),
  place("Lisbon", "PT", -9.1393, 38.7223),
  place("Tokyo", "JP", 139.6917, 35.6895),
  place("Beijing", "CN", 116.4074, 39.9042),
  place("Delhi", "IN", 77.209, 28.6139),
  place("Jakarta", "ID", 106.8456, -6.2088),
  place("Bangkok", "TH", 100.5018, 13.7563),
  place("Seoul", "KR", 126.978, 37.5665),
  place("Dubai", "AE", 55.2708, 25.2048),
  place("Istanbul", "TR", 28.9784, 41.0082),
  place("Singapore", "SG", 103.8198, 1.3521),
  place("Manila", "PH", 120.9842, 14.5995),
  place("Perth", "AU", 115.8605, -31.9505),
  place("Sydney", "AU", 151.2093, -33.8688),
  place("Auckland", "NZ", 174.7633, -36.8485),
  place("Wellington", "NZ", 174.7762, -41.2865),
  place("Suva", "FJ", 178.4419, -18.1416),
  place("New York", "US", -74.006, 40.7128),
  place("Los Angeles", "US", -118.2437, 34.0522),
  place("Anchorage", "US", -149.9003, 61.2181),
  place("Honolulu", "US", -157.8583, 21.3069),
  place("Mexico City", "MX", -99.1332, 19.4326),
  place("Toronto", "CA", -79.3832, 43.6532),
  place("Vancouver", "CA", -123.1207, 49.2827),
  place("Sao Paulo", "BR", -46.6333, -23.5505),
  place("Buenos Aires", "AR", -58.3816, -34.6037),
  place("Lima", "PE", -77.0428, -12.0464),
  place("Bogota", "CO", -74.0721, 4.711),
  place("Santiago", "CL", -70.6693, -33.4489),
];

/** A region that is never the right one for any of the places, for the "wrong region" cases. */
function wrongRegion(entry: Place): string {
  return entry.region === "ZA" ? "NA" : "ZA";
}

async function findingsFor(
  coordinates: readonly number[],
  regions: readonly string[],
): Promise<readonly Finding[]> {
  return (await lint(collection(pointFeature(coordinates)), regions)).findings;
}

/** The names of the places for which `test` holds. */
async function namesWhere(
  test: (entry: Place) => Promise<boolean>,
): Promise<string[]> {
  const names: string[] = [];
  for (const entry of PLACES) {
    if (await test(entry)) {
      names.push(entry.name);
    }
  }
  return names;
}

const has = (findings: readonly Finding[], ruleId: string) =>
  findings.some((finding) => finding.ruleId === ruleId);

function candidatesOf(findings: readonly Finding[]): string[] {
  const found = findings.find(
    (finding) => finding.ruleId === "projected-coords",
  );
  const candidates = found?.data?.candidates as { code: string }[] | undefined;
  return candidates === undefined ? [] : candidates.map(({ code }) => code);
}

describe("the projection helpers in this file", () => {
  it("agree with the engine's inverse to a millimetre, so the cases below are honest", () => {
    for (const entry of PLACES) {
      const projected = utm(entry.longitude, entry.latitude);
      const [longitude, latitude] = inverseTransverseMercator(
        {
          ellipsoid: WGS84,
          centralMeridian: projected.zone * 6 - 183,
          latitudeOfOrigin: 0,
          scale: 0.9996,
          falseEasting: 500000,
          falseNorthing: projected.north ? 0 : 10000000,
        },
        projected.easting,
        projected.northing,
      );
      expect(Math.abs(longitude - entry.longitude)).toBeLessThan(1e-8);
      expect(Math.abs(latitude - entry.latitude)).toBeLessThan(1e-8);
    }
  });

  it("put Cape Town in zone 34 south, at the known easting and northing", () => {
    const capeTown = utm(18.4241, -33.9249);
    expect(capeTown.code).toBe("EPSG:32734");
    expect(Math.round(capeTown.easting)).toBeCloseTo(261878, -2);
    expect(Math.round(capeTown.northing)).toBeCloseTo(6243185, -3);
  });
});

describe("the heuristic rules on 44 real places", () => {
  it("has the places it says it has", () => {
    expect(PLACES).toHaveLength(44);
  });

  describe("coordinate-order", () => {
    it("never fires on the true order (no false positive), with or without the right region", async () => {
      const firing = await namesWhere(async (entry) => {
        const none = await findingsFor([entry.longitude, entry.latitude], []);
        const own = await findingsFor(
          [entry.longitude, entry.latitude],
          [entry.region],
        );
        return has(none, "coordinate-order") || has(own, "coordinate-order");
      });
      expect(firing).toEqual([]);
    });

    it("without a region, finds exactly the swaps whose second number is above 90 (17 of 44)", async () => {
      const found = await namesWhere(async (entry) =>
        has(
          await findingsFor([entry.latitude, entry.longitude], []),
          "coordinate-order",
        ),
      );
      expect(found).toEqual(
        PLACES.filter((entry) => Math.abs(entry.longitude) > 90).map(
          (entry) => entry.name,
        ),
      );
      expect(found).toHaveLength(17);
    });

    it("without a region, every swap it finds is info severity and low confidence", async () => {
      for (const entry of PLACES) {
        const found = (
          await findingsFor([entry.latitude, entry.longitude], [])
        ).filter((finding) => finding.ruleId === "coordinate-order");
        for (const finding of found) {
          expect(finding).toMatchObject({
            severity: "info",
            confidence: "low",
          });
        }
      }
    });

    it("with the right region, finds every swap but Cairo's (43 of 44), all as high-confidence warnings", async () => {
      const missed = await namesWhere(async (entry) => {
        const found = (
          await findingsFor([entry.latitude, entry.longitude], [entry.region])
        ).filter((finding) => finding.ruleId === "coordinate-order");
        for (const finding of found) {
          expect(finding).toMatchObject({
            severity: "warning",
            confidence: "high",
          });
        }
        return found.length === 0;
      });
      expect(missed).toEqual(["Cairo"]);
    });

    // README: "A position that is inside the region in both orders ... is never reported."
    it("the Cairo miss is the both-orders limitation: 31.2357, 30.0444 and its swap are both inside Egypt", async () => {
      const countries = await loadCountries();
      expect(countries.contains("EG", 31.2357, 30.0444)).toBe(true);
      expect(countries.contains("EG", 30.0444, 31.2357)).toBe(true);
    });

    it("with the wrong region, a swap is only found when it lands in that region (none of these do)", async () => {
      const found = await namesWhere(async (entry) =>
        has(
          await findingsFor(
            [entry.latitude, entry.longitude],
            [wrongRegion(entry)],
          ),
          "coordinate-order",
        ),
      );
      expect(found).toEqual([]);
    });
  });

  describe("region-mismatch", () => {
    it("never fires on the true order with the right region (no false positive)", async () => {
      expect(
        await namesWhere(async (entry) =>
          has(
            await findingsFor(
              [entry.longitude, entry.latitude],
              [entry.region],
            ),
            "region-mismatch",
          ),
        ),
      ).toEqual([]);
    });

    it("fires with a wrong region for every place but Istanbul (43 of 44)", async () => {
      const missed = await namesWhere(
        async (entry) =>
          !has(
            await findingsFor(
              [entry.longitude, entry.latitude],
              [wrongRegion(entry)],
            ),
            "region-mismatch",
          ),
      );
      expect(missed).toEqual(["Istanbul"]);
    });

    it("misses Istanbul because the Bosphorus is a gap between the 1:110m outlines of Turkey, and so reads as open sea", async () => {
      const countries = await loadCountries();
      expect(countries.locate(28.9784, 41.0082)).toBeUndefined();
      expect(countries.contains("TR", 28.9784, 41.0082)).toBe(true);
    });

    it("stays quiet on a swap, which coordinate-order owns, so the two rules do not both fire", async () => {
      const both = await namesWhere(async (entry) => {
        const found = await findingsFor(
          [entry.latitude, entry.longitude],
          [entry.region],
        );
        return has(found, "region-mismatch") && has(found, "coordinate-order");
      });
      expect(both).toEqual([]);
    });
  });

  describe("projected-coords", () => {
    it("never fires on the true order", async () => {
      expect(
        await namesWhere(async (entry) =>
          has(
            await findingsFor(
              [entry.longitude, entry.latitude],
              [entry.region],
            ),
            "projected-coords",
          ),
        ),
      ).toEqual([]);
    });

    it("fires on Web Mercator and UTM positions for every place, and lists the true system for every place when no region is given", async () => {
      const wrong = await namesWhere(async (entry) => {
        const [x, y] = webMercator(entry.longitude, entry.latitude);
        const mercator = candidatesOf(await findingsFor([x, y], []));
        const projected = utm(entry.longitude, entry.latitude);
        const grid = candidatesOf(
          await findingsFor([projected.easting, projected.northing], []),
        );
        return !(
          mercator.includes("EPSG:3857") &&
          grid.includes("EPSG:326xx or EPSG:327xx")
        );
      });
      expect(wrong).toEqual([]);
    });

    it("without a region, names Web Mercator first for Web Mercator data in all 44 places", async () => {
      const wrongFirst = await namesWhere(async (entry) => {
        const [x, y] = webMercator(entry.longitude, entry.latitude);
        return candidatesOf(await findingsFor([x, y], []))[0] !== "EPSG:3857";
      });
      expect(wrongFirst).toEqual([]);
    });

    it("without a region, UTM data is also named Web Mercator first in all 44 places (the rule says it cannot choose)", async () => {
      const mercatorFirst = await namesWhere(async (entry) => {
        const projected = utm(entry.longitude, entry.latitude);
        const candidates = candidatesOf(
          await findingsFor([projected.easting, projected.northing], []),
        );
        return candidates[0] === "EPSG:3857";
      });
      expect(mercatorFirst).toHaveLength(PLACES.length);
    });

    it("with the right region, Web Mercator data is named Web Mercator first in all 44 places", async () => {
      const wrongFirst = await namesWhere(async (entry) => {
        const [x, y] = webMercator(entry.longitude, entry.latitude);
        return (
          candidatesOf(await findingsFor([x, y], [entry.region]))[0] !==
          "EPSG:3857"
        );
      });
      expect(wrongFirst).toEqual([]);
    });

    it("with the right region, UTM data names the right zone first in some places and among the three in most", async () => {
      const notFirst: string[] = [];
      const notInThree: string[] = [];
      for (const entry of PLACES) {
        const projected = utm(entry.longitude, entry.latitude);
        const candidates = candidatesOf(
          await findingsFor(
            [projected.easting, projected.northing],
            [entry.region],
          ),
        );
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.length).toBeLessThanOrEqual(3);
        if (candidates[0] !== projected.code) {
          notFirst.push(entry.name);
        }
        if (!candidates.includes(projected.code)) {
          notInThree.push(entry.name);
        }
      }
      expect({ notFirst, notInThree }).toEqual({
        notFirst: [
          "Johannesburg",
          "Lagos",
          "Cairo",
          "Paris",
          "Berlin",
          "Moscow",
          "Tokyo",
          "Beijing",
          "Sydney",
          "New York",
          "Anchorage",
          "Mexico City",
          "Sao Paulo",
          "Buenos Aires",
        ],
        notInThree: ["Beijing", "Sydney", "New York"],
      });
    });
  });

  it("coordinate-order and region-mismatch stay silent on the Web Mercator and UTM forms of every place, with the right region and without", async () => {
    const noisy: string[] = [];
    for (const entry of PLACES) {
      const [x, y] = webMercator(entry.longitude, entry.latitude);
      const projected = utm(entry.longitude, entry.latitude);
      for (const regions of [[], [entry.region]]) {
        for (const coordinates of [
          [x, y],
          [projected.easting, projected.northing],
        ]) {
          const found = await findingsFor(coordinates, regions);
          if (has(found, "coordinate-order") || has(found, "region-mismatch")) {
            noisy.push(`${entry.name} ${regions.join("")}`);
          }
        }
      }
    }
    expect(noisy).toEqual([]);
  });

  it("Cape Town in UTM zone 34 south, checked against ZA, is named zone 34 south first", async () => {
    const capeTown = utm(18.4241, -33.9249);
    const report = await lint(
      collection(
        pointFeature([
          Number(capeTown.easting.toFixed(3)),
          Number(capeTown.northing.toFixed(3)),
        ]),
      ),
      ["ZA"],
    );
    expect(marks(report)).toEqual([
      "projected-coords /features/0/geometry/coordinates",
    ]);
    expect(candidatesOf(report.findings)).toEqual(["EPSG:32734", "EPSG:32735"]);
  });

  it("Cape Town in UTM zone 34 south with no region lists Web Mercator, then UTM (zone not known)", async () => {
    const capeTown = utm(18.4241, -33.9249);
    const report = await lint(
      collection(pointFeature([capeTown.easting, capeTown.northing])),
    );
    expect(candidatesOf(report.findings)).toEqual([
      "EPSG:3857",
      "EPSG:326xx or EPSG:327xx",
      "EPSG:2154",
    ]);
  });
});

describe("limitations the README states, confirmed", () => {
  it("a swapped Nairobi checked against Tanzania is not recognised, because the swap lands in Kenya", async () => {
    expect((await lint(onePoint(-1.2921, 36.8219), ["TZ"])).findings).toEqual(
      [],
    );
  });

  it("and the true Nairobi is reported against Tanzania", async () => {
    expect(marks(await lint(onePoint(36.8219, -1.2921), ["TZ"]))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
  });

  it("Marion Island, true or swapped, is quiet for ZA: the outlines lack the island", async () => {
    expect((await lint(onePoint(37.7459, -46.9), ["ZA"])).findings).toEqual([]);
    expect((await lint(onePoint(-46.9, 37.7459), ["ZA"])).findings).toEqual([]);
  });

  it("a mid-Atlantic position, in open sea, is reported as swapped for ZA because its swap lands in South Africa", async () => {
    const report = await lint(onePoint(-30, 25), ["ZA"]);
    expect(marks(report)).toEqual([
      "coordinate-order /features/0/geometry/coordinates",
    ]);
    expect(report.findings[0]).toMatchObject({
      severity: "warning",
      confidence: "high",
    });
  });

  it("60 N, 60 E is inside Russia in both orders and is never reported", async () => {
    expect((await lint(onePoint(60, 60), ["RU"])).findings).toEqual([]);
  });

  it("a two-point line from Windhoek to Maputo is reported against ZA though it crosses the country", async () => {
    const line = collection(
      feature({
        type: "LineString",
        coordinates: [
          [17.0832, -22.5609],
          [32.5732, -25.9692],
        ],
      }),
    );
    expect(marks(await lint(line, ["ZA"]))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
    expect((await lint(line, ["NA"])).findings).toEqual([]);
  });

  it("a ring whose bounding box swallows the region is exempt, and a ring beside it is not", async () => {
    const aroundLesotho = collection(
      feature(
        polygon([
          [26.8, -31.8],
          [29.8, -31.8],
          [29.8, -28.3],
          [26.8, -28.3],
          [26.8, -31.8],
        ]),
      ),
    );
    expect((await lint(aroundLesotho, ["LS"])).findings).toEqual([]);
    const beside = collection(
      feature(
        polygon([
          [24, -33],
          [24.5, -33],
          [24.5, -32.5],
          [24, -32.5],
          [24, -33],
        ]),
      ),
    );
    expect(marks(await lint(beside, ["LS"]))).toEqual([
      "region-mismatch /features/0/geometry",
    ]);
  });

  describe("a partly swapped feature", () => {
    const south = [
      [18.4, -33.9],
      [28.0, -26.2],
      [31.0, -29.9],
      [25.6, -33.9],
      [24.7, -28.7],
      [27.9, -26.1],
      [22.9, -33.9],
      [29.2, -25.5],
      [30.4, -29.0],
      [26.2, -29.1],
    ];
    const swapFirst = (count: number) =>
      collection(
        feature({
          type: "LineString",
          coordinates: south.map((position, index) =>
            index < count ? [position[1], position[0]] : position,
          ),
        }),
      );

    it("is not reported at 4 of 10 or at exactly half", async () => {
      expect((await lint(swapFirst(4), ["ZA"])).findings).toEqual([]);
      expect((await lint(swapFirst(5), ["ZA"])).findings).toEqual([]);
    });

    it("is a medium-confidence warning at 6 of 10, and high at 10 of 10", async () => {
      const six = await lint(swapFirst(6), ["ZA"]);
      expect(six.findings[0]).toMatchObject({
        ruleId: "coordinate-order",
        confidence: "medium",
        path: "/features/0/geometry/coordinates/0",
      });
      const all = await lint(swapFirst(10), ["ZA"]);
      expect(all.findings[0]).toMatchObject({ confidence: "high" });
    });
  });

  it("a longitude beyond 180 is the antimeridian rule's; 360.5 and beyond is projected-coords'", async () => {
    expect(marks(await lint(onePoint(200, 10)))).toEqual([
      "antimeridian /features/0/geometry/coordinates",
    ]);
    expect(marks(await lint(onePoint(360.5, 10)))).toEqual([
      "projected-coords /features/0/geometry/coordinates",
    ]);
  });
});

describe("what the guesses do with a latitude that is merely out of range", () => {
  // The behaviour of projected-coords on a pair that is valid when swapped
  // changed while these tests were being written (the rule was edited): it used
  // to report a swapped Tokyo (35.7, 139.7) as projected data, an error with
  // high confidence beside the coordinate-order note. It now leaves such a pair
  // to coordinate-order. These pin the current behaviour.
  it("a swapped Tokyo is a coordinate-order note and nothing else", async () => {
    const report = await lint(onePoint(35.6895, 139.6917));
    expect(
      report.findings.map((f) => `${f.ruleId} ${f.severity}/${f.confidence}`),
    ).toEqual(["coordinate-order info/low"]);
  });

  it("a latitude of 90.0000001 is read as a swap, not as projected data", async () => {
    expect(
      (await lint(onePoint(10, 90.0000001))).findings.map(
        (finding) => finding.ruleId,
      ),
    ).toEqual(["coordinate-order"]);
  });

  it.each([
    ["a longitude above 360", [361, 10]],
    ["both numbers above 90", [95, 100]],
    ["a latitude past 180", [10, 181]],
    ["a first number past 90 and a second past 90", [200, 95]],
  ])("%s is projected data", async (_name, position) => {
    const report = await lint(collection(pointFeature(position as number[])));
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "projected-coords",
    ]);
  });
});

describe("each rule, with inputs a sensible person would expect to be handled", () => {
  it("seven decimals are clean, eight are not, and the exponent form is counted the same way", async () => {
    expect((await lint(onePoint(12.1234567, 20.1234567))).findings).toEqual([]);
    expect(marks(await lint(onePoint(12.12345678, 20.5)))).toEqual([
      "precision /features/0/geometry/coordinates",
    ]);
    expect(
      marks(await lint('{"type":"Point","coordinates":[1.5e-8,20.5]}')),
    ).toEqual(["precision /coordinates"]);
    expect((await lint(onePoint(1.5e-7, 20.5))).findings).toEqual([
      expect.objectContaining({ ruleId: "precision" }),
    ]);
  });

  it("a sum such as 0.1 + 0.2 carries float noise and is flagged, and --fix cleans it", async () => {
    const text = JSON.stringify(onePoint(10 + 0.1 + 0.2, 20));
    expect(marks(await lint(text))).toEqual([
      "precision /features/0/geometry/coordinates",
    ]);
    const fixed = await fixText(text);
    expect((await lint(fixed.output)).findings).toEqual([]);
  });

  it("-0 is read as 0, so a point at -0, -0 is Null Island", async () => {
    expect(marks(await lint('{"type":"Point","coordinates":[-0,-0]}'))).toEqual(
      ["null-island /coordinates"],
    );
  });

  it("two positions that differ only in altitude are not duplicates", async () => {
    const report = await lint(
      collection(
        feature({
          type: "LineString",
          coordinates: [
            [10, 10, 5],
            [10, 10, 6],
            [11, 11, 6],
          ],
        }),
      ),
    );
    expect(report.findings).toEqual([]);
  });

  it("a ring whose last position differs from the first only in altitude is open", async () => {
    const text = JSON.stringify(
      collection(
        feature(
          polygon([
            [10, 10, 1],
            [11, 10, 1],
            [11, 11, 1],
            [10, 11, 1],
            [10, 10, 2],
          ]),
        ),
      ),
    );
    expect(marks(await lint(text))).toEqual([
      "unclosed-ring /features/0/geometry/coordinates/0",
    ]);
    const fixed = await fixText(text);
    expect(
      JSON.parse(fixed.output).features[0].geometry.coordinates[0],
    ).toEqual([
      [10, 10, 1],
      [11, 10, 1],
      [11, 11, 1],
      [10, 11, 1],
      [10, 10, 1],
    ]);
  });

  it("a three-position open ring is a structure error and an unclosed ring, and --fix closes it", async () => {
    const text = JSON.stringify(
      collection(
        feature(
          polygon([
            [10, 10],
            [11, 10],
            [10, 11],
          ]),
        ),
      ),
    );
    expect(marks(await lint(text))).toEqual([
      "structure /features/0/geometry/coordinates/0",
      "unclosed-ring /features/0/geometry/coordinates/0",
    ]);
    const fixed = await fixText(text);
    expect((await lint(fixed.output)).findings).toEqual([]);
  });

  it("rounding that makes two close vertices equal leaves a duplicate that --fix cannot remove, and says so", async () => {
    // [10, 10], [11, 10.0000000001], [11, 10.0000000002], [10, 10] rounds to a ring of three distinct positions plus a repeat.
    const text = JSON.stringify(
      collection(
        feature(
          polygon([
            [10, 10],
            [11, 10.0000000001],
            [11, 10.0000000002],
            [10, 10],
          ]),
        ),
      ),
    );
    const fixed = await fixText(text);
    const after = await lint(fixed.output);
    expect(after.findings.filter((finding) => finding.fixable)).toEqual([]);
    expect(marks(after)).toContain(
      "duplicate-vertices /features/0/geometry/coordinates/0/2",
    );
    expect((await fixText(fixed.output)).changed).toBe(0);
  });

  it("a ring that goes clockwise only because of float noise is judged exactly", async () => {
    // A sliver, 1e-9 degrees wide, wound clockwise.
    const sliver = [
      [10, 10],
      [10, 11],
      [10.000000001, 10.5],
      [10, 10],
    ];
    expect(marks(await lint(collection(feature(polygon(sliver)))))).toContain(
      "winding-order /features/0/geometry/coordinates/0",
    );
  });

  it("an open ring reports fewer crossings than its closed form, because the closing edge is not part of it (so --fix can reveal more)", async () => {
    const ring = [
      [10, 10],
      [8, 10],
      [9, 9],
      [9, 10],
      [8, 9],
    ];
    const crossings = async (positions: number[][]) =>
      only(
        await lint(collection(feature(polygon(positions)))),
        "self-intersection",
      ).filter((finding) => finding.severity === "error").length;
    expect(await crossings(ring)).toBe(1);
    expect(await crossings([...ring, [10, 10]])).toBe(3);
  });

  it("a line that crosses itself is valid and is not reported", async () => {
    const report = await lint(
      collection(
        feature({
          type: "LineString",
          coordinates: [
            [10, 10],
            [12, 12],
            [12, 10],
            [10, 12],
          ],
        }),
      ),
    );
    expect(report.findings).toEqual([]);
  });

  it("a polygon at 1e200 does not throw, whatever the other rules say of it", async () => {
    const report = await lint(
      collection(
        feature(
          polygon([
            [1e200, 1e200],
            [1e200, 2e200],
            [2e200, 2e200],
            [1e200, 1e200],
          ]),
        ),
      ),
    );
    expect(report.inputError).toBeUndefined();
    expect(report.findings.map((finding) => finding.ruleId)).toContain(
      "projected-coords",
    );
  });

  it("a polygon at 1e-200 does not throw", async () => {
    const report = await lint(
      collection(
        feature(
          polygon([
            [0, 0],
            [1e-200, 0],
            [1e-200, 1e-200],
            [0, 1e-200],
            [0, 0],
          ]),
        ),
      ),
    );
    expect(report.inputError).toBeUndefined();
  });

  it("steps along a pole, and a step of exactly 360 at one latitude, are not antimeridian crossings", async () => {
    const line = (coordinates: number[][]) =>
      lint(collection(feature({ type: "LineString", coordinates })));
    expect(
      (
        await line([
          [-170, 89.995],
          [170, 89.995],
        ])
      ).findings,
    ).toEqual([]);
    expect(
      (
        await line([
          [-180, 10],
          [180, 10],
        ])
      ).findings,
    ).toEqual([]);
    expect(
      marks(
        await line([
          [-180, 10],
          [180, 11],
        ]),
      ),
    ).toEqual(["antimeridian /features/0/geometry/coordinates/1"]);
  });

  it("more than five long steps in one geometry are cut off at five", async () => {
    const zigzag = Array.from({ length: 12 }, (_, index) => [
      index % 2 === 0 ? 170 : -170,
      10,
    ]);
    const report = await lint(
      collection(feature({ type: "LineString", coordinates: zigzag })),
    );
    expect(
      report.findings.filter((finding) => finding.ruleId === "antimeridian"),
    ).toHaveLength(5);
  });

  it("thirty bad positions give twenty structure findings and one that counts the rest, at the feature", async () => {
    const bad = Array.from({ length: 30 }, () => ["x", "y"]);
    const report = await lint(
      collection(feature({ type: "LineString", coordinates: bad })),
    );
    const found = only(report, "structure");
    expect(found).toHaveLength(21);
    expect(found.find((finding) => finding.data !== undefined)).toMatchObject({
      path: "/features/0",
      data: { suppressed: 10 },
    });
  });

  it("members of the features array that are not objects are each one structure error at their own index", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[null,5,"x",[],true]}',
    );
    expect(marks(report)).toEqual(
      [0, 1, 2, 3, 4].map((index) => `structure /features/${index}`),
    );
  });

  it("a geometry that is an array is a structure error at the geometry", async () => {
    const report = await lint(collection(feature([])));
    expect(marks(report)).toEqual(["structure /features/0/geometry"]);
  });

  it("a position of strings is reported at the first bad element, not at the position", async () => {
    const report = await lint(
      collection(pointFeature([1, "2" as unknown as number])),
    );
    expect(marks(report)).toEqual([
      "structure /features/0/geometry/coordinates/1",
    ]);
  });

  it("a region code in lower case is accepted, and an unknown one is a usage error and not a report", async () => {
    expect((await lint(onePoint(18.4241, -33.9249), ["za"])).findings).toEqual(
      [],
    );
    await expect(lint(onePoint(1, 2), ["ZZ"])).rejects.toThrow(
      /No outline for region ZZ/,
    );
  });

  it("invalid UTF-8 inside a feature is an input error that names where it stopped", async () => {
    const head = new TextEncoder().encode(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"n":"',
    );
    const tail = new TextEncoder().encode('"},"geometry":null}]}');
    const report = await lintBytes(
      (async function* () {
        yield new Uint8Array([...head, 0xff, 0xfe, ...tail]);
      })(),
    );
    expect(report.inputError).toMatchObject({
      message: expect.stringMatching(/UTF-8/),
    });
    expect(report.featureCount).toBe(0);
  });

  it("features before a syntax error are still linted and reported", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[0,0]}},{"type":"Feature",,}]}',
    );
    expect(report.inputError).toBeDefined();
    expect(report.featureCount).toBe(1);
    expect(marks(report)).toContain(
      "null-island /features/0/geometry/coordinates",
    );
  });

  it("a Windows line ending and a tab between members are whitespace", async () => {
    const report = await lint(
      '{\r\n\t"type": "FeatureCollection",\r\n\t"features": [\r\n\t\t{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[18.4,-33.9]}}\r\n\t]\r\n}\r\n',
    );
    expect(report).toMatchObject({ findings: [], featureCount: 1 });
  });

  it("a property key that looks like a pointer ('a/b', '~') does not disturb the pointers of other members", async () => {
    const report = await lint(
      collection(
        feature(
          { type: "Point", coordinates: [0, 0] },
          { properties: { "a/b": 1, "~": 2 } },
        ),
      ),
    );
    expect(marks(report)).toEqual([
      "null-island /features/0/geometry/coordinates",
    ]);
  });
});

describe("the reader, with documents laid out unusually", () => {
  const origin =
    '{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[0,0]}}';
  const originAt = "null-island /features/0/geometry/coordinates";

  it("finds the features member when its name is written with an escape", async () => {
    const report = await lint(
      `{"type":"FeatureCollection","featu\\u0072es":[${origin}]}`,
    );
    expect(marks(report)).toEqual([originAt]);
  });

  it("reads a type member whose name or value is written with an escape", async () => {
    expect(
      marks(
        await lint(`{"typ\\u0065":"FeatureCollection","features":[${origin}]}`),
      ),
    ).toEqual([originAt]);
    expect(
      marks(
        await lint(`{"type":"Feature\\u0043ollection","features":[${origin}]}`),
      ),
    ).toEqual([originAt]);
  });

  it("does not take a features member inside properties, or after other members, for the collection's", async () => {
    expect(
      marks(
        await lint(
          '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"features":[{"x":1}]},"geometry":null}]}',
        ),
      ),
    ).toEqual(["empty-geometry /features/0/geometry"]);
    expect(
      marks(
        await lint(
          `{"type":"FeatureCollection","name":"x","features":[${origin}],"extra":{"features":[1]}}`,
        ),
      ),
    ).toEqual([originAt]);
  });

  it("a root Feature whose properties hold a features array is still one feature", async () => {
    const report = await lint(
      '{"type":"Feature","properties":{"features":[1,2,3]},"geometry":{"type":"Point","coordinates":[0,0]}}',
    );
    expect(report.featureCount).toBe(1);
    expect(marks(report)).toEqual(["null-island /geometry/coordinates"]);
  });

  it("is not confused by braces, brackets and quotes inside a string", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"s":"}],\\"features\\":["},"geometry":null}]}',
    );
    expect(report.inputError).toBeUndefined();
    expect(report.featureCount).toBe(1);
  });

  it("reads a root member nested 100,000 levels deep without trouble", async () => {
    const depth = 100_000;
    const report = await lint(
      `{"type":"FeatureCollection","features":[],"x":${'{"a":'.repeat(depth)}1${"}".repeat(depth)}}`,
    );
    expect(report.inputError).toBeUndefined();
    expect(report.findings).toEqual([]);
  });

  it.each([
    ["a leading zero", "[01,2]"],
    ["a plus sign", "[+1,2]"],
    ["a hexadecimal number", "[0x10,2]"],
  ])(
    "%s in a number is an input error that names the member",
    async (_name, coordinates) => {
      const report = await lint(
        `{"type":"Point","coordinates":${coordinates}}`,
      );
      expect(report.inputError?.message).toMatch(/coordinates/);
    },
  );

  it("a root array of features is not GeoJSON, and is not read as a collection", async () => {
    const report = await lint(`[${origin}]`);
    expect(marks(report)).toEqual(["structure "]);
    expect(report.featureCount).toBe(0);
  });

  it("two documents one after the other (NDJSON) are an input error at the second", async () => {
    const report = await lint(`${origin}\n${origin}`);
    expect(report.inputError?.offset).toBe(origin.length + 1);
  });
});

describe("--fix on documents laid out unusually", () => {
  const origin =
    '{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[1.123456789012,2]}}';
  const clockwise = [
    [10, 10],
    [10, 11],
    [11, 11],
    [11, 10],
    [10, 10],
  ];

  it("fixes a bare geometry at the root and writes a bare geometry back", async () => {
    const fixed = await fixText(JSON.stringify(polygon(clockwise)));
    expect(JSON.parse(fixed.output)).toEqual(
      polygon([
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
        [10, 10],
      ]),
    );
    expect(fixed.changed).toBe(1);
  });

  it("fixes a root Feature and writes a Feature back", async () => {
    const fixed = await fixText(JSON.stringify(feature(polygon(clockwise))));
    expect(JSON.parse(fixed.output)).toMatchObject({
      type: "Feature",
      geometry: {
        coordinates: [
          [
            [10, 10],
            [11, 10],
            [11, 11],
            [10, 11],
            [10, 10],
          ],
        ],
      },
    });
  });

  it("keeps every other member in its order and value, rounding only coordinates", async () => {
    const fixed = await fixText(
      `{"b":1,"type":"FeatureCollection","a":{"x":1.123456789012},"features":[{"type":"Feature","properties":{"p":1.123456789012},"geometry":{"type":"Point","coordinates":[1.123456789012,2]}}],"c":2}`,
    );
    expect(fixed.output).toBe(
      '{"b":1,"type":"FeatureCollection","a":{"x":1.123456789012},"features":[{"type":"Feature","properties":{"p":1.123456789012},"geometry":{"type":"Point","coordinates":[1.1234568,2]}}],"c":2}',
    );
  });

  it("keeps a member that follows the features, even one that holds a features array", async () => {
    const fixed = await fixText(
      `{"type":"FeatureCollection","features":[${origin}],"c":{"features":[1]}}`,
    );
    expect(fixed.output).toBe(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[1.1234568,2]}}],"c":{"features":[1]}}',
    );
  });

  it("finds a features member written with an escape, and writes it as features", async () => {
    const fixed = await fixText(
      `{"type":"FeatureCollection","featu\\u0072es":[${origin}]}`,
    );
    expect(fixed.changed).toBe(1);
    expect(JSON.parse(fixed.output).features).toHaveLength(1);
  });

  it("drops the byte order mark, and says nothing was changed for an empty collection", async () => {
    const fixed = await fixText(
      '\ufeff{"type":"FeatureCollection","features":[]}',
    );
    expect(fixed.output).toBe('{"type":"FeatureCollection","features":[]}');
    expect(fixed.changed).toBe(0);
  });

  it("refuses an array root and a truncated document with a FixError, not another error", async () => {
    await expect(fixText("[1]")).rejects.toMatchObject({ name: "FixError" });
    await expect(fixText('{"type":"Feature",')).rejects.toMatchObject({
      name: "FixError",
      message: expect.stringMatching(/byte 18/),
    });
  });

  it("leaves a root that is an object of another type exactly as it was", async () => {
    const fixed = await fixText('{"type":"Foo"}');
    expect(fixed.output).toBe('{"type":"Foo"}');
    expect(fixed.changed).toBe(0);
  });
});

describe("very large single geometries", () => {
  it("a 100,000-vertex ring is linted in a moment, and a 1,000,000-position line too", async () => {
    const ring: number[][] = [];
    for (let index = 0; index < 100_000; index++) {
      const angle = (2 * Math.PI * index) / 100_000;
      ring.push([
        Number((20 + 10 * Math.cos(angle)).toFixed(6)),
        Number((20 + 10 * Math.sin(angle)).toFixed(6)),
      ]);
    }
    ring.push(ring[0] as number[]);
    const started = performance.now();
    const circle = await lint(collection(feature(polygon(ring))));
    expect(circle.findings).toEqual([]);
    const line = await lint(
      collection(
        feature({
          type: "LineString",
          coordinates: Array.from({ length: 1_000_000 }, (_, index) => [
            Number((10 + (index % 1000) * 0.001).toFixed(3)),
            Number((20 + Math.floor(index / 1000) * 0.001).toFixed(3)),
          ]),
        }),
      ),
      ["ZA"],
    );
    expect(marks(line)).toEqual(["region-mismatch /features/0/geometry"]);
    expect(performance.now() - started).toBeLessThan(30_000);
  }, 60_000);

  it("a ring whose closing edge crosses 1,500 others is cut off at ten findings, quickly", async () => {
    const ring: number[][] = [];
    for (let index = 0; index < 3000; index++) {
      ring.push([index % 2 === 0 ? 10 : 100, 10 + index * 0.01]);
    }
    ring.push([10, 10]);
    const report = await lint(collection(feature(polygon(ring))));
    expect(
      only(report, "self-intersection").filter(
        (finding) => finding.severity === "error",
      ),
    ).toHaveLength(10);
  });
});

describe("other defects found, each kept as a skipped test", () => {
  const deepCoordinates = (depth: number) =>
    `{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":${"[".repeat(depth)}${"]".repeat(depth)}}}]}`;

  // Defect: empty-geometry's holdsNoPosition recurses once for each level of
  // nesting in `coordinates`, so a document that JSON.parse reads comfortably
  // makes lintText throw a RangeError (stack overflow) between 4,000 and 5,000 levels.
  it("deeply nested coordinates arrays do not make lintText throw", async () => {
    const report = await lint(deepCoordinates(200_000));
    expect(report.inputError).toBeUndefined();
  });

  it("deeply nested coordinates are fine up to 4,000 levels", async () => {
    const report = await lint(deepCoordinates(4000));
    expect(report.inputError).toBeUndefined();
  });

  // Defect: a root Feature with a crs member is reported twice at /crs, once as
  // a document member and once as a feature member.
  it("a root Feature's crs is reported once", async () => {
    const report = await lint({
      type: "Feature",
      properties: null,
      geometry: null,
      crs: null,
    });
    expect(only(report, "deprecated-crs-member")).toHaveLength(1);
  });

  // Defect: invalid JSON adds a second, misleading finding ("not GeoJSON: its
  // root must be an object with a type member") on top of the input error.
  it("a syntax error reports only the input error", async () => {
    const report = await lint("{'type':'Point'}");
    expect(report.inputError).toBeDefined();
    expect(report.findings).toEqual([]);
  });

  // Defect (cosmetic): the message for an infinite coordinate reads
  // "must be finite numbers, not number".
  it("the message for 1e999 says what is wrong with it", async () => {
    const report = await lint(
      '{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":{"type":"Point","coordinates":[1e999,1]}}]}',
    );
    expect(report.findings[0]?.message).not.toMatch(/not number\./);
  });
});
