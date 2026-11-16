// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DocumentInfo, RuleContext } from "../types.js";
import { MAX_PROBLEMS_PER_FEATURE, structureRule } from "./structure.js";

const context: RuleContext = { regions: [], countries: undefined };
const check = (value: unknown) => structureRule.check(value, context);
const paths = (value: unknown) => check(value).map((finding) => finding.path);
const feature = (geometry: unknown, extra: object = {}) => ({
  type: "Feature",
  properties: {},
  geometry,
  ...extra,
});
const ring = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
];

describe("structure: a valid feature", () => {
  it.each([
    ["Point", [1, 2]],
    ["Point", [1, 2, 3]],
    [
      "MultiPoint",
      [
        [1, 2],
        [3, 4],
      ],
    ],
    [
      "LineString",
      [
        [1, 2],
        [3, 4],
      ],
    ],
    [
      "MultiLineString",
      [
        [
          [1, 2],
          [3, 4],
        ],
      ],
    ],
    ["Polygon", [ring]],
    ["MultiPolygon", [[ring], [ring, ring]]],
  ])("accepts a %s", (type, coordinates) => {
    expect(check(feature({ type, coordinates }))).toEqual([]);
  });

  it("accepts null geometry, nested collections, an id and a bbox", () => {
    expect(check(feature(null))).toEqual([]);
    const geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 2] },
        {
          type: "GeometryCollection",
          geometries: [
            {
              type: "LineString",
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          ],
        },
      ],
      bbox: [0, 0, 1, 1],
    };
    expect(
      check(feature(geometry, { id: "a", bbox: [0, 0, 0, 1, 1, 1] })),
    ).toEqual([]);
    expect(check(feature(null, { id: 7, properties: null }))).toEqual([]);
  });
});

describe("structure: what it reports", () => {
  it("rejects a feature that is not an object", () => {
    expect(paths("x")).toEqual([""]);
    expect(paths(null)).toEqual([""]);
    expect(paths([1])).toEqual([""]);
  });

  it("rejects a wrong or missing type, and a bare geometry in a feature list", () => {
    expect(paths({ type: "Point", coordinates: [1, 2] })).toEqual(["/type"]);
    expect(paths({ geometry: null, properties: null })).toEqual(["/type"]);
    expect(check({ type: "Feature" })[0]?.path).toBe("");
  });

  it("needs geometry and properties members", () => {
    expect(paths({ type: "Feature", properties: null })).toEqual([""]);
    expect(paths({ type: "Feature", geometry: null })).toEqual([""]);
    expect(paths(feature(null, { properties: 4 }))).toEqual(["/properties"]);
    expect(paths(feature(null, { properties: [] }))).toEqual(["/properties"]);
  });

  it("checks id and bbox", () => {
    expect(paths(feature(null, { id: {} }))).toEqual(["/id"]);
    expect(paths(feature(null, { id: null }))).toEqual(["/id"]);
    expect(paths(feature(null, { bbox: [1, 2, 3] }))).toEqual(["/bbox"]);
    expect(paths(feature(null, { bbox: "x" }))).toEqual(["/bbox"]);
    expect(
      paths(feature({ type: "Point", coordinates: [1, 2], bbox: [1] })),
    ).toEqual(["/geometry/bbox"]);
  });

  it("rejects geometry that is not an object or has no usable type", () => {
    expect(paths(feature("x"))).toEqual(["/geometry"]);
    expect(paths(feature([]))).toEqual(["/geometry"]);
    expect(paths(feature({ coordinates: [1, 2] }))).toEqual(["/geometry/type"]);
    expect(paths(feature({ type: 4, coordinates: [1, 2] }))).toEqual([
      "/geometry/type",
    ]);
    expect(paths(feature({ type: "Circle", coordinates: [1, 2] }))).toEqual([
      "/geometry/type",
    ]);
    expect(paths(feature({ type: "Feature" }))).toEqual(["/geometry/type"]);
    expect(paths(feature({ type: "FeatureCollection" }))).toEqual([
      "/geometry/type",
    ]);
  });

  it("checks positions: shape, length, element types", () => {
    expect(paths(feature({ type: "Point" }))).toEqual([
      "/geometry/coordinates",
    ]);
    expect(paths(feature({ type: "Point", coordinates: 1 }))).toEqual([
      "/geometry/coordinates",
    ]);
    expect(paths(feature({ type: "Point", coordinates: [1] }))).toEqual([
      "/geometry/coordinates",
    ]);
    expect(paths(feature({ type: "Point", coordinates: [1, null] }))).toEqual([
      "/geometry/coordinates/1",
    ]);
    expect(paths(feature({ type: "Point", coordinates: ["1", 2] }))).toEqual([
      "/geometry/coordinates/0",
    ]);
    const long = check(feature({ type: "Point", coordinates: [1, 2, 3, 4] }));
    expect(long).toMatchObject([
      { severity: "warning", path: "/geometry/coordinates" },
    ]);
  });

  it("checks line and ring lengths", () => {
    expect(
      paths(feature({ type: "LineString", coordinates: [[1, 2]] })),
    ).toEqual(["/geometry/coordinates"]);
    expect(paths(feature({ type: "LineString", coordinates: "x" }))).toEqual([
      "/geometry/coordinates",
    ]);
    expect(
      paths(
        feature({
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        }),
      ),
    ).toEqual(["/geometry/coordinates/0"]);
    expect(paths(feature({ type: "Polygon", coordinates: "x" }))).toEqual([
      "/geometry/coordinates",
    ]);
    expect(paths(feature({ type: "Polygon", coordinates: [4] }))).toEqual([
      "/geometry/coordinates/0",
    ]);
    expect(
      paths(feature({ type: "MultiLineString", coordinates: {} })),
    ).toEqual(["/geometry/coordinates"]);
    expect(
      paths(feature({ type: "MultiPolygon", coordinates: [[[[1]]]] }))[0],
    ).toBe("/geometry/coordinates/0/0");
    expect(paths(feature({ type: "MultiPolygon", coordinates: null }))).toEqual(
      ["/geometry/coordinates"],
    );
    expect(
      paths(feature({ type: "MultiPoint", coordinates: [[1, 2], "x"] })),
    ).toEqual(["/geometry/coordinates/1"]);
  });

  it("checks a GeometryCollection's members, and its depth", () => {
    expect(
      paths(
        feature({
          type: "GeometryCollection",
          geometries: [{ type: "Point", coordinates: [] }],
        }),
      ),
    ).toEqual(["/geometry/geometries/0/coordinates"]);
    expect(paths(feature({ type: "GeometryCollection" }))).toEqual([
      "/geometry/geometries",
    ]);
    let deep: unknown = { type: "Point", coordinates: [1, 2] };
    for (let i = 0; i < 100; i++) {
      deep = { type: "GeometryCollection", geometries: [deep] };
    }
    expect(check(feature(deep))[0]?.message).toContain("nested too deeply");
  });

  it("stops after a cap and says how many more there were", () => {
    const coordinates = Array.from(
      { length: MAX_PROBLEMS_PER_FEATURE + 5 },
      () => "x",
    );
    const findings = check(feature({ type: "MultiPoint", coordinates }));
    expect(findings).toHaveLength(MAX_PROBLEMS_PER_FEATURE + 1);
    expect(findings.at(-1)).toMatchObject({
      path: "",
      data: { suppressed: 5 },
    });
  });

  it("describes what it found in the message", () => {
    expect(
      check(feature({ type: "Point", coordinates: "x" }))[0]?.message,
    ).toContain("string");
    expect(
      check(feature({ type: "Point", coordinates: null }))[0]?.message,
    ).toContain("null");
    expect(
      check(feature({ type: "Point", coordinates: {} }))[0]?.message,
    ).toContain("object");
    expect(
      check(feature({ type: "LineString", coordinates: {} }))[0]?.message,
    ).toContain("object");
    expect(
      check(feature({ type: "Polygon", coordinates: [[]] }))[0]?.message,
    ).toContain("at least 4");
    expect(check({ type: 4 })[0]?.message).toContain("number");
    expect(check({ type: [] })[0]?.message).toContain("array");
  });

  it("says what is wrong with a position element that is not a finite number", () => {
    const messageFor = (element: unknown) =>
      check(feature({ type: "Point", coordinates: [element, 1] }))[0]?.message;
    expect(messageFor(Number.POSITIVE_INFINITY)).toBe(
      "Position elements must be finite numbers, but this one is too large to be a number.",
    );
    expect(messageFor(Number.NEGATIVE_INFINITY)).toContain("too large");
    expect(messageFor(Number.NaN)).toBe(
      "Position elements must be finite numbers, but this one is NaN.",
    );
    expect(messageFor("1")).toBe(
      "Position elements must be finite numbers, not string.",
    );
    expect(messageFor(null)).toBe(
      "Position elements must be finite numbers, not null.",
    );
  });

  it("never throws, whatever it is given", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(() => check(value)).not.toThrow();
      }),
    );
  });
});

describe("structure: the document", () => {
  const document = (
    rootType: string | undefined,
    hasFeatures = true,
    duplicateMembers: readonly string[] = [],
  ): DocumentInfo => ({
    rootType,
    members: {},
    hasFeatures,
    rootIsFeature: false,
    duplicateMembers,
  });
  const run = (info: DocumentInfo) =>
    structureRule.checkDocument?.(info, context) ?? [];

  it("accepts every GeoJSON root type", () => {
    for (const type of [
      "FeatureCollection",
      "Feature",
      "Point",
      "GeometryCollection",
    ]) {
      expect(run(document(type))).toEqual([]);
    }
  });

  it("reports a root that is not GeoJSON", () => {
    expect(run(document(undefined))[0]?.path).toBe("");
    expect(run(document("Banana"))[0]?.path).toBe("/type");
  });

  it("reports a repeated features member once, at the document level", () => {
    expect(run(document("FeatureCollection", true, ["features"]))).toEqual([
      {
        ruleId: "structure",
        severity: "error",
        confidence: "high",
        path: "/features",
        message:
          "The features member is repeated. Only the first one is checked, so the features in a later one are not.",
        fixable: false,
      },
    ]);
  });

  it("does not report another repeated member as a repeated features member", () => {
    expect(run(document("FeatureCollection", true, ["name"]))).toEqual([]);
  });

  it("reports a repeated features member along with a problem with the root", () => {
    const messages = run(
      document("FeatureCollection", false, ["features"]),
    ).map((finding) => finding.message);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain("needs a features member");
    expect(messages[1]).toContain("is repeated");
  });

  it("needs a features array in a FeatureCollection", () => {
    expect(run(document("FeatureCollection", false))[0]?.path).toBe(
      "/features",
    );
  });
});
