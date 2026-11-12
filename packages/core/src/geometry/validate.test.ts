// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Feature, Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { GeometryError } from "./errors";
import { isEmptyGeometry, validateGeometry } from "./validate";

const RING = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
];

/** The kind of error `input` raises, or `undefined` when it is accepted. */
function kindOf(input: unknown, geographic = true): string | undefined {
  try {
    validateGeometry(input, { geographic });
  } catch (error) {
    expect(error).toBeInstanceOf(GeometryError);
    return (error as GeometryError).kind;
  }
  return undefined;
}

describe("validateGeometry", () => {
  it("returns a valid geometry unchanged", () => {
    const polygon: Geometry = { type: "Polygon", coordinates: [RING] };
    expect(validateGeometry(polygon)).toBe(polygon);
  });

  it("unwraps a feature", () => {
    const geometry: Geometry = { type: "Point", coordinates: [2.35, 48.85] };
    const feature: Feature = { type: "Feature", properties: {}, geometry };
    expect(validateGeometry(feature)).toBe(geometry);
  });

  it("accepts every geometry type", () => {
    const geometries: Geometry[] = [
      { type: "Point", coordinates: [1, 2] },
      { type: "Point", coordinates: [1, 2, 3] },
      {
        type: "MultiPoint",
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
      {
        type: "LineString",
        coordinates: [
          [1, 2],
          [3, 4],
        ],
      },
      {
        type: "MultiLineString",
        coordinates: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      },
      { type: "Polygon", coordinates: [RING, RING] },
      { type: "MultiPolygon", coordinates: [[RING]] },
      {
        type: "GeometryCollection",
        geometries: [{ type: "Point", coordinates: [1, 2] }],
      },
    ];
    for (const geometry of geometries) {
      expect(validateGeometry(geometry)).toBe(geometry);
    }
  });

  it("accepts a line that closes on itself and a repeated point", () => {
    expect(
      kindOf({
        type: "LineString",
        coordinates: [
          [1, 1],
          [1, 1],
        ],
      }),
    ).toBeUndefined();
  });

  it("accepts the coordinates at the edges of the globe", () => {
    expect(
      kindOf({
        type: "MultiPoint",
        coordinates: [
          [-180, -90],
          [180, 90],
        ],
      }),
    ).toBeUndefined();
  });

  it("accepts empty geometries", () => {
    for (const geometry of [
      { type: "Point", coordinates: [] },
      { type: "LineString", coordinates: [] },
      { type: "Polygon", coordinates: [] },
      { type: "MultiPoint", coordinates: [] },
      { type: "MultiLineString", coordinates: [] },
      { type: "MultiPolygon", coordinates: [] },
      { type: "GeometryCollection", geometries: [] },
    ]) {
      expect(kindOf(geometry)).toBeUndefined();
    }
  });

  it("refuses a feature with no geometry as empty", () => {
    expect(kindOf({ type: "Feature", properties: {}, geometry: null })).toBe(
      "empty",
    );
  });

  it("refuses a collection of features as unsupported", () => {
    expect(kindOf({ type: "FeatureCollection", features: [] })).toBe(
      "unsupported",
    );
  });

  it("refuses anything that is not a geometry object", () => {
    for (const input of [
      null,
      undefined,
      0,
      "POINT (1 2)",
      [],
      {},
      { type: 5 },
      { type: "Circle", coordinates: [1, 2] },
      { type: "point", coordinates: [1, 2] },
      { type: "Point" },
      { type: "Point", coordinates: "1,2" },
      { type: "GeometryCollection" },
      { type: "GeometryCollection", geometries: "none" },
      { type: "Feature" },
    ]) {
      expect(kindOf(input)).toBe("invalid");
    }
  });

  it("refuses a position that is not two or three finite numbers", () => {
    for (const coordinates of [
      [1],
      [1, 2, 3, 4],
      ["1", "2"],
      [Number.NaN, 2],
      [1, Number.POSITIVE_INFINITY],
      [null, 2],
      [[1, 2]],
    ]) {
      expect(kindOf({ type: "Point", coordinates })).toBe("invalid");
    }
  });

  it("refuses a longitude or latitude out of range", () => {
    for (const coordinates of [
      [180.5, 0],
      [-181, 0],
      [0, 90.1],
      [0, -91],
    ]) {
      expect(kindOf({ type: "Point", coordinates })).toBe("invalid");
    }
  });

  it("leaves the range alone when the coordinates are not degrees", () => {
    expect(
      kindOf({ type: "Point", coordinates: [261845.8, 6250056] }, false),
    ).toBeUndefined();
    expect(kindOf({ type: "Point", coordinates: [Number.NaN, 1] }, false)).toBe(
      "invalid",
    );
  });

  it("refuses a line with a single position", () => {
    expect(kindOf({ type: "LineString", coordinates: [[1, 2]] })).toBe(
      "invalid",
    );
    expect(kindOf({ type: "MultiLineString", coordinates: [[[1, 2]]] })).toBe(
      "invalid",
    );
  });

  it("refuses a ring that is short or open", () => {
    const triangle = [
      [0, 0],
      [1, 0],
      [0, 0],
    ];
    const open = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const ring of [[], triangle, open]) {
      expect(kindOf({ type: "Polygon", coordinates: [ring] })).toBe("invalid");
      expect(kindOf({ type: "MultiPolygon", coordinates: [[ring]] })).toBe(
        "invalid",
      );
    }
  });

  it("refuses coordinates nested to the wrong depth", () => {
    expect(kindOf({ type: "Polygon", coordinates: RING })).toBe("invalid");
    expect(kindOf({ type: "MultiPoint", coordinates: [1, 2] })).toBe("invalid");
    expect(kindOf({ type: "MultiPolygon", coordinates: [RING] })).toBe(
      "invalid",
    );
  });

  it("refuses positions that mix two and three numbers in one shape", () => {
    expect(
      kindOf({
        type: "LineString",
        coordinates: [
          [1, 2],
          [3, 4, 5],
        ],
      }),
    ).toBe("invalid");
  });

  it("refuses a collection nested too deep", () => {
    let geometry: unknown = { type: "Point", coordinates: [1, 2] };
    for (let i = 0; i < 50_000; i += 1) {
      geometry = { type: "GeometryCollection", geometries: [geometry] };
    }
    expect(kindOf(geometry)).toBe("invalid");
  });

  it("refuses a collection member that is not an object", () => {
    expect(
      kindOf({ type: "GeometryCollection", geometries: [null, "POINT (1 2)"] }),
    ).toBe("invalid");
  });

  it("refuses a bad member inside a collection", () => {
    expect(
      kindOf({
        type: "GeometryCollection",
        geometries: [{ type: "Point", coordinates: [999, 0] }],
      }),
    ).toBe("invalid");
  });
});

describe("isEmptyGeometry", () => {
  it("is true for a geometry with no coordinates", () => {
    expect(isEmptyGeometry({ type: "Point", coordinates: [] })).toBe(true);
    expect(isEmptyGeometry({ type: "MultiPolygon", coordinates: [] })).toBe(
      true,
    );
    expect(
      isEmptyGeometry({ type: "GeometryCollection", geometries: [] }),
    ).toBe(true);
  });

  it("is true for a collection of only empty geometries", () => {
    expect(
      isEmptyGeometry({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [] },
          { type: "LineString", coordinates: [] },
        ],
      }),
    ).toBe(true);
  });

  it("is false for a geometry with a position", () => {
    expect(isEmptyGeometry({ type: "Point", coordinates: [1, 2] })).toBe(false);
    expect(
      isEmptyGeometry({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [] },
          { type: "Point", coordinates: [1, 2] },
        ],
      }),
    ).toBe(false);
  });
});
