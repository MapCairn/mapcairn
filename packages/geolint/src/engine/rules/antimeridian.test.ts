// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { RuleContext } from "../types.js";
import { antimeridianRule } from "./antimeridian.js";

const context: RuleContext = { regions: [], countries: undefined };
const check = (value: unknown) => antimeridianRule.check(value, context);
const feature = (geometry: unknown) => ({
  type: "Feature",
  properties: {},
  geometry,
});
const paths = (value: unknown) => check(value).map((finding) => finding.path);

const square = (west: number, east: number) => [
  [west, -18],
  [east, -18],
  [east, -16],
  [west, -16],
  [west, -18],
];

describe("antimeridian: shapes that cross it unsplit", () => {
  it("flags a ring that jumps from one side to the other, once for each jump", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [177.5, -18],
          [-179.5, -18],
          [-179.5, -16],
          [177.5, -16],
          [177.5, -18],
        ],
      ],
    };
    const findings = check(feature(geometry));
    expect(findings.map((f) => f.path)).toEqual([
      "/geometry/coordinates/0/1",
      "/geometry/coordinates/0/3",
    ]);
    expect(findings[0]).toMatchObject({
      severity: "warning",
      confidence: "medium",
    });
    expect(findings[0]?.message).toContain("177.5 to -179.5");
  });

  it("flags a line that jumps, and a MultiLineString", () => {
    expect(
      paths(
        feature({
          type: "LineString",
          coordinates: [
            [179, 0],
            [-179, 1],
          ],
        }),
      ),
    ).toEqual(["/geometry/coordinates/1"]);
    expect(
      paths(
        feature({
          type: "MultiLineString",
          coordinates: [
            [
              [0, 0],
              [1, 1],
            ],
            [
              [-170, 0],
              [170, 0],
            ],
          ],
        }),
      ),
    ).toEqual(["/geometry/coordinates/1/1"]);
  });

  it("stops after five jumps in one geometry", () => {
    const zigzag = Array.from({ length: 20 }, (_, i) => [
      i % 2 === 0 ? 170 : -170,
      i,
    ]);
    expect(
      check(feature({ type: "LineString", coordinates: zigzag })),
    ).toHaveLength(5);
  });
});

describe("antimeridian: what is fine", () => {
  it("accepts a shape split at 180 degrees, in two polygons", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [[square(177.5, 180)], [square(-180, -179.5)]],
    };
    expect(check(feature(geometry))).toEqual([]);
  });

  it("accepts a ring along the antimeridian itself and a ring around a pole", () => {
    expect(
      check(
        feature({
          type: "Polygon",
          coordinates: [
            [
              [-180, -90],
              [180, -90],
              [180, -70],
              [-180, -70],
              [-180, -90],
            ],
          ],
        }),
      ),
    ).toEqual([]);
    expect(
      check(
        feature({
          type: "Polygon",
          coordinates: [
            [
              [-180, 85],
              [-90, 89.995],
              [90, 89.995],
              [180, 89.995],
              [-180, 89.99],
              [-180, 85],
            ],
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("accepts a long step that is exactly 180 degrees", () => {
    expect(
      check(
        feature({
          type: "LineString",
          coordinates: [
            [-90, 0],
            [90, 0],
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("accepts points, 3D positions, null geometry and malformed input", () => {
    expect(
      check(feature({ type: "Point", coordinates: [179.9, 10, 5] })),
    ).toEqual([]);
    expect(check(feature(null))).toEqual([]);
    expect(check(null)).toEqual([]);
    expect(
      check(feature({ type: "LineString", coordinates: [[1], "x"] })),
    ).toEqual([]);
  });

  it("looks inside a GeometryCollection", () => {
    const geometry = {
      type: "GeometryCollection",
      geometries: [
        {
          type: "LineString",
          coordinates: [
            [179, 0],
            [-179, 1],
          ],
        },
      ],
    };
    expect(paths(feature(geometry))).toEqual([
      "/geometry/geometries/0/coordinates/1",
    ]);
  });
});

describe("antimeridian: longitudes past 180", () => {
  it("flags a 0 to 360 longitude, once for each geometry, and counts them", () => {
    const [finding] = check(
      feature({
        type: "MultiPoint",
        coordinates: [
          [10, 1],
          [190, 2],
          [200, 3],
        ],
      }),
    );
    expect(finding).toMatchObject({
      path: "/geometry/coordinates/1",
      data: { count: 2 },
    });
    expect(finding?.message).toContain("2 longitudes");
  });

  it("says a single longitude in the singular, for either side", () => {
    expect(
      check(feature({ type: "Point", coordinates: [190, 5] }))[0]?.message,
    ).toContain("A longitude is");
    expect(
      check(feature({ type: "Point", coordinates: [-190, 5] })),
    ).toHaveLength(1);
  });

  it("leaves projected coordinates and bad latitudes to the projected-coords rule", () => {
    expect(
      check(feature({ type: "Point", coordinates: [500000, 4000000] })),
    ).toEqual([]);
    expect(check(feature({ type: "Point", coordinates: [190, 95] }))).toEqual(
      [],
    );
    expect(check(feature({ type: "Point", coordinates: [400, 5] }))).toEqual(
      [],
    );
  });
});
