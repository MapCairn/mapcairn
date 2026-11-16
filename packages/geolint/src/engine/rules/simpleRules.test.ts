// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { DocumentInfo, RuleContext } from "../types.js";
import { deprecatedCrsMemberRule } from "./deprecated-crs-member.js";
import { emptyGeometryRule } from "./empty-geometry.js";
import { nullIslandRule } from "./null-island.js";

const context: RuleContext = { regions: [], countries: undefined };

const feature = (geometry: unknown, extra: object = {}) => ({
  type: "Feature",
  properties: {},
  geometry,
  ...extra,
});

const documentWith = (members: Record<string, unknown>): DocumentInfo => ({
  rootType: "FeatureCollection",
  members,
  hasFeatures: true,
  rootIsFeature: false,
  duplicateMembers: [],
});

describe("deprecated-crs-member", () => {
  const check = (value: unknown) =>
    deprecatedCrsMemberRule.check(value, context);
  const named = (name: string) => ({ type: "name", properties: { name } });

  it("warns about a crs member that names another system", () => {
    const [finding] =
      deprecatedCrsMemberRule.checkDocument?.(
        documentWith({ crs: named("urn:ogc:def:crs:EPSG::32633") }),
        context,
      ) ?? [];
    expect(finding).toMatchObject({
      path: "/crs",
      severity: "warning",
      data: { crs: "urn:ogc:def:crs:EPSG::32633" },
    });
    expect(finding?.message).toContain("reproject");
  });

  it.each([
    "urn:ogc:def:crs:OGC:1.3:CRS84",
    "urn:ogc:def:crs:EPSG::4326",
    "EPSG:4326",
    "CRS84",
  ])("only informs when the crs is WGS 84 (%s)", (name) => {
    const findings = check(feature(null, { crs: named(name) }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("info");
  });

  it("leaves a root crs to the feature check when the root was read as a feature", () => {
    const root = { ...documentWith({ crs: null }), rootIsFeature: true };
    expect(deprecatedCrsMemberRule.checkDocument?.(root, context)).toEqual([]);
  });

  it("reads the name from a link crs, and copes with a crs that names nothing", () => {
    expect(
      check(
        feature(null, {
          crs: { type: "link", properties: { href: "http://x/y.prj" } },
        }),
      )[0]?.data,
    ).toEqual({ crs: "http://x/y.prj" });
    expect(check(feature(null, { crs: {} }))[0]).toMatchObject({
      severity: "warning",
      data: undefined,
    });
    expect(check(feature(null, { crs: null }))[0]?.severity).toBe("info");
    expect(
      check(feature(null, { crs: { properties: { name: 4 } } }))[0]?.severity,
    ).toBe("warning");
  });

  it("finds a crs on a geometry as well as on a feature", () => {
    const paths = check(
      feature(
        { type: "Point", coordinates: [1, 2], crs: named("EPSG:3857") },
        { crs: named("EPSG:3857") },
      ),
    ).map((finding) => finding.path);
    expect(paths).toEqual(["/crs", "/geometry/crs"]);
  });

  it("finds nothing without a crs, and tolerates any value", () => {
    expect(check(feature({ type: "Point", coordinates: [1, 2] }))).toEqual([]);
    expect(check(null)).toEqual([]);
    expect(check("text")).toEqual([]);
    expect(
      deprecatedCrsMemberRule.checkDocument?.(documentWith({}), context),
    ).toEqual([]);
  });
});

describe("empty-geometry", () => {
  const check = (value: unknown) => emptyGeometryRule.check(value, context);

  it("reports a null geometry as information", () => {
    expect(check(feature(null))).toMatchObject([
      { path: "/geometry", severity: "info", confidence: "medium" },
    ]);
  });

  it.each([
    ["Point", []],
    ["MultiPoint", []],
    ["LineString", []],
    ["MultiLineString", [[]]],
    ["Polygon", [[]]],
    ["MultiPolygon", [[[]]]],
  ])("reports an empty %s", (type, coordinates) => {
    expect(check(feature({ type, coordinates }))).toMatchObject([
      { path: "/geometry", severity: "warning", confidence: "high" },
    ]);
  });

  it("looks as deep as valid coordinates go, and no deeper", () => {
    expect(
      check(feature({ type: "MultiPolygon", coordinates: [[[[]]]] })),
    ).toHaveLength(1);
    expect(
      check(feature({ type: "MultiPolygon", coordinates: [[[[[]]]]] })),
    ).toEqual([]);
  });

  it("accepts geometries that hold a position", () => {
    expect(check(feature({ type: "Point", coordinates: [1, 2] }))).toEqual([]);
    expect(
      check(
        feature({
          type: "MultiLineString",
          coordinates: [
            [
              [1, 2],
              [3, 4],
            ],
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("looks inside a GeometryCollection, nested ones too", () => {
    const geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [1, 2] },
        {
          type: "GeometryCollection",
          geometries: [{ type: "LineString", coordinates: [] }],
        },
        { type: "GeometryCollection", geometries: [] },
      ],
    };
    expect(check(feature(geometry)).map((finding) => finding.path)).toEqual([
      "/geometry/geometries/1/geometries/0",
      "/geometry/geometries/2",
    ]);
  });

  it("stops following nested collections at the depth limit", () => {
    let geometry: unknown = { type: "Point", coordinates: [] };
    for (let i = 0; i < 100; i++) {
      geometry = { type: "GeometryCollection", geometries: [geometry] };
    }
    expect(check(feature(geometry))).toEqual([]);
  });

  it("ignores what it cannot read", () => {
    expect(check(null)).toEqual([]);
    expect(check({ type: "Point", coordinates: [] })).toEqual([]);
    expect(check(feature("text"))).toEqual([]);
    expect(check(feature({ type: "Mystery", coordinates: [] }))).toEqual([]);
    expect(check(feature({ type: "Point" }))).toEqual([]);
    expect(
      check(feature({ type: "GeometryCollection", geometries: 4 })),
    ).toEqual([]);
    expect(check(feature({ type: "GeometryCollection" }))).toEqual([]);
  });
});

describe("null-island", () => {
  const check = (value: unknown) => nullIslandRule.check(value, context);

  it("warns about a Point at exactly 0, 0", () => {
    expect(
      check(feature({ type: "Point", coordinates: [0, 0] })),
    ).toMatchObject([
      {
        path: "/geometry/coordinates",
        severity: "warning",
        confidence: "medium",
        data: { count: 1 },
      },
    ]);
  });

  it("counts every position in a MultiPoint and says how many", () => {
    const [finding] = check(
      feature({
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [1, 1],
          [0, 0],
        ],
      }),
    );
    expect(finding).toMatchObject({
      path: "/geometry/coordinates/0",
      data: { count: 2 },
    });
    expect(finding?.message).toContain("2 positions");
  });

  it("is only information, at low confidence, for a vertex of a line or ring", () => {
    expect(
      check(
        feature({
          type: "LineString",
          coordinates: [
            [1, 1],
            [0, 0],
          ],
        }),
      ),
    ).toMatchObject([
      { path: "/geometry/coordinates/1", severity: "info", confidence: "low" },
    ]);
  });

  it("keeps 3D positions and nested collections", () => {
    const geometry = {
      type: "GeometryCollection",
      geometries: [{ type: "Point", coordinates: [0, 0, 12] }],
    };
    expect(check(feature(geometry))[0]?.path).toBe(
      "/geometry/geometries/0/coordinates",
    );
  });

  it("accepts a position that only has one coordinate at zero, or is near it", () => {
    expect(check(feature({ type: "Point", coordinates: [0, 10] }))).toEqual([]);
    expect(check(feature({ type: "Point", coordinates: [0.0001, 0] }))).toEqual(
      [],
    );
    expect(
      check(feature({ type: "Point", coordinates: [-0, 0] })),
    ).toHaveLength(1);
  });

  it("ignores null geometry and malformed input", () => {
    expect(check(feature(null))).toEqual([]);
    expect(check(undefined)).toEqual([]);
    expect(check(feature({ type: "Point", coordinates: ["0", "0"] }))).toEqual(
      [],
    );
  });
});
