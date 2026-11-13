// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { shapesToCsv, shapesToGeoJson, shapesToWkt } from "./export";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_DEPTH,
  MAX_IMPORT_POINTS,
  MAX_IMPORT_SHAPE_POINTS,
  MAX_IMPORT_SHAPES,
  parseShapeFile,
  type ShapeImport,
  shapeInputBounds,
} from "./import";
import type { DrawShapeInput } from "./reducer";
import type { DrawShape } from "./types";

const p = (lng: number, lat: number) => ({ lat, lng });

const SQUARE = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

function json(value: unknown): string {
  return JSON.stringify(value);
}

function feature(geometry: unknown, properties: unknown = {}): unknown {
  return { type: "Feature", geometry, properties };
}

function collection(...features: unknown[]): string {
  return json({ type: "FeatureCollection", features });
}

function shapesOf(result: ShapeImport): readonly DrawShapeInput[] {
  if (!result.ok) {
    throw new Error(`Refused: ${result.refusal}`);
  }
  return result.shapes;
}

function finished(input: DrawShapeInput, index: number): DrawShape {
  return {
    ...input,
    id: `shape-${index + 1}`,
    label: `Shape ${index + 1}`,
    done: true,
  };
}

describe("parseShapeFile with GeoJSON", () => {
  it("reads a point, a line and a polygon from a FeatureCollection", () => {
    const result = parseShapeFile(
      collection(
        feature({ type: "Point", coordinates: [18.4, -33.9] }),
        feature({
          type: "LineString",
          coordinates: [
            [18.4, -33.9],
            [18.5, -33.8],
          ],
        }),
        feature({ type: "Polygon", coordinates: [SQUARE] }),
      ),
    );
    expect(result).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(18.4, -33.9)] },
        { kind: "line", vertices: [p(18.4, -33.9), p(18.5, -33.8)] },
        {
          kind: "polygon",
          vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)],
        },
      ],
      skipped: {},
      holesDropped: 0,
    });
  });

  it("reads a single Feature and a bare geometry", () => {
    expect(
      shapesOf(
        parseShapeFile(json(feature({ type: "Point", coordinates: [1, 2] }))),
      ),
    ).toEqual([{ kind: "point", vertices: [p(1, 2)] }]);
    expect(
      shapesOf(parseShapeFile(json({ type: "Point", coordinates: [1, 2] }))),
    ).toEqual([{ kind: "point", vertices: [p(1, 2)] }]);
  });

  it("ignores an altitude", () => {
    expect(
      shapesOf(
        parseShapeFile(json({ type: "Point", coordinates: [1, 2, 300] })),
      ),
    ).toEqual([{ kind: "point", vertices: [p(1, 2)] }]);
  });

  it("keeps a ring that is not closed, and drops only a closing position", () => {
    const open = SQUARE.slice(0, 4);
    expect(
      shapesOf(parseShapeFile(json({ type: "Polygon", coordinates: [open] }))),
    ).toEqual([
      { kind: "polygon", vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)] },
    ]);
  });

  it("splits Multi geometries into one shape per part", () => {
    const shapes = shapesOf(
      parseShapeFile(
        collection(
          feature({
            type: "MultiPoint",
            coordinates: [
              [1, 1],
              [2, 2],
            ],
          }),
          feature({
            type: "MultiLineString",
            coordinates: [
              [
                [0, 0],
                [1, 1],
              ],
              [
                [2, 2],
                [3, 3],
              ],
            ],
          }),
          feature({ type: "MultiPolygon", coordinates: [[SQUARE], [SQUARE]] }),
        ),
      ),
    );
    expect(shapes.map((shape) => shape.kind)).toEqual([
      "point",
      "point",
      "line",
      "line",
      "polygon",
      "polygon",
    ]);
  });

  it("flattens a GeometryCollection one level and skips one nested inside it", () => {
    const result = parseShapeFile(
      json({
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: [1, 1] },
          {
            type: "GeometryCollection",
            geometries: [{ type: "Point", coordinates: [2, 2] }],
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(1, 1)] }],
      skipped: { unsupported: 1 },
    });
  });

  it("keeps a polygon's outer ring and counts the holes it left out", () => {
    const hole = [
      [0.2, 0.2],
      [0.4, 0.2],
      [0.4, 0.4],
      [0.2, 0.2],
    ];
    const result = parseShapeFile(
      json({ type: "Polygon", coordinates: [SQUARE, hole, hole] }),
    );
    expect(result).toMatchObject({
      ok: true,
      shapes: [{ kind: "polygon" }],
      holesDropped: 1,
    });
  });

  it("reads a circle back from the properties the exporter writes", () => {
    const circle: DrawShape = {
      id: "shape-1",
      kind: "circle",
      label: "Circle 1",
      vertices: [p(36.8219, -1.2921)],
      radiusMetres: 500,
      done: true,
    };
    expect(shapesOf(parseShapeFile(json(shapesToGeoJson([circle]))))).toEqual([
      { kind: "circle", vertices: [p(36.8219, -1.2921)], radiusMetres: 500 },
    ]);
  });

  it("imports a circle whose properties cannot be read as the polygon it is drawn as", () => {
    const result = parseShapeFile(
      json(
        feature(
          { type: "Polygon", coordinates: [SQUARE] },
          { type: "circle", radius_m: "500", centre: [1, 1] },
        ),
      ),
    );
    expect(shapesOf(result)[0]?.kind).toBe("polygon");
  });

  it("reads a circle whose radius is not above zero as the polygon it is written as", () => {
    // Earlier exports wrote a radius of 0 for a circle under 5 mm.
    for (const radius of [0, -3]) {
      const result = parseShapeFile(
        json(
          feature(
            { type: "Polygon", coordinates: [SQUARE] },
            { type: "circle", radius_m: radius, centre: [0.5, 0.5] },
          ),
        ),
      );
      expect(result).toMatchObject({ ok: true, skipped: {} });
      expect(shapesOf(result).map((shape) => shape.kind)).toEqual(["polygon"]);
    }
  });

  it("reads a circle of a few centimetres back exactly, from where it was written", () => {
    const circle: DrawShape = {
      id: "shape-1",
      kind: "circle",
      label: "Circle 1",
      vertices: [p(36.82190123456789, -1.29210987654321)],
      radiusMetres: 0.0123,
      done: true,
    };
    expect(shapesOf(parseShapeFile(json(shapesToGeoJson([circle]))))).toEqual([
      {
        kind: "circle",
        vertices: [p(36.82190123456789, -1.29210987654321)],
        radiusMetres: 0.0123,
      },
    ]);
  });

  it("skips shapes that break the draw rules and says why", () => {
    const result = parseShapeFile(
      collection(
        feature({
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [1, 1],
              [1, 0],
              [0, 1],
              [0, 0],
            ],
          ],
        }),
        feature({
          type: "LineString",
          coordinates: [
            [1, 1],
            [1, 1],
          ],
        }),
        feature({ type: "LineString", coordinates: [[1, 1]] }),
        feature(null),
        feature({ type: "Point", coordinates: [200, 0] }),
        feature({ type: "Point", coordinates: ["1", 2] }),
        feature({ type: "Point", coordinates: [1, 2] }),
        feature(
          { type: "Point", coordinates: [0, 0] },
          { type: "circle", radius_m: 20_000_000, centre: [0, 0] },
        ),
        { type: "Topology" },
      ),
    );
    expect(result).toEqual({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(1, 2)] }],
      skipped: {
        "self-intersecting": 1,
        degenerate: 1,
        "too-few-vertices": 1,
        unsupported: 2,
        "out-of-range": 1,
        malformed: 1,
        "radius-too-large": 1,
      },
      holesDropped: 0,
    });
  });

  it("skips a shape with more points than one shape may have", () => {
    const line = Array.from(
      { length: MAX_IMPORT_SHAPE_POINTS + 1 },
      (_, index) => [index / 10_000, 0],
    );
    expect(
      parseShapeFile(json({ type: "LineString", coordinates: line })),
    ).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { "too-many-points": 1 },
    });
  });

  it("skips a polygon whose open ring has more points than one shape may have", () => {
    const ring = Array.from(
      { length: MAX_IMPORT_SHAPE_POINTS + 1 },
      (_, index) => {
        const angle = (2 * Math.PI * index) / (MAX_IMPORT_SHAPE_POINTS + 1);
        return [Math.cos(angle), Math.sin(angle)];
      },
    );
    expect(
      parseShapeFile(json({ type: "Polygon", coordinates: [ring] })),
    ).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { "too-many-points": 1 },
    });
    const closed = [...ring.slice(0, -1), ring[0]];
    expect(
      shapesOf(
        parseShapeFile(json({ type: "Polygon", coordinates: [closed] })),
      ),
    ).toHaveLength(1);
  });

  it("reads malformed positions as skips, never throws", () => {
    for (const coordinates of [
      null,
      "1,2",
      [1],
      [null, 2],
      { 0: 1, 1: 2 },
      [[1, 2]],
    ]) {
      expect(
        parseShapeFile(json({ type: "Point", coordinates })),
      ).toMatchObject({ ok: true, shapes: [], skipped: { malformed: 1 } });
    }
    for (const type of ["LineString", "MultiPoint", "MultiPolygon"]) {
      expect(
        parseShapeFile(json({ type, coordinates: { 0: [1, 2] } })),
      ).toMatchObject({ ok: true, shapes: [], skipped: { malformed: 1 } });
    }
    expect(
      parseShapeFile(
        json({
          type: "GeometryCollection",
          geometries: [{ type: "Topology", coordinates: [] }],
        }),
      ),
    ).toMatchObject({ ok: true, shapes: [], skipped: { unsupported: 1 } });
    for (const coordinates of [null, [[1, 2], 3], [[]], [], 5]) {
      expect(
        parseShapeFile(json({ type: "Polygon", coordinates })),
      ).toMatchObject({ ok: true, shapes: [] });
    }
  });

  it("treats Infinity from a huge number as not a number", () => {
    expect(
      parseShapeFile('{"type":"Point","coordinates":[1e999,0]}'),
    ).toMatchObject({ ok: true, shapes: [], skipped: { malformed: 1 } });
  });

  it("reads __proto__ and inherited names as plain keys", () => {
    const text =
      '{"__proto__":{"type":"Point","coordinates":[1,1]},"type":"FeatureCollection","features":[{"type":"Feature","__proto__":{"geometry":{"type":"Point","coordinates":[2,2]}},"properties":{"__proto__":{"type":"circle"}}}]}';
    const result = parseShapeFile(text);
    expect(result).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { unsupported: 1 },
    });
    expect(({} as Record<string, unknown>).type).toBeUndefined();
    expect(
      parseShapeFile('{"type":"constructor","coordinates":[1,1]}'),
    ).toEqual({ ok: false, refusal: "not-recognised" });
    expect(parseShapeFile('{"type":"FeatureCollection"}')).toEqual({
      ok: false,
      refusal: "not-recognised",
    });
  });

  it("refuses text that is not GeoJSON", () => {
    for (const text of [
      "[1,2]",
      "{",
      '{"type":"Feature"',
      "null",
      '{"features":[]}',
      "hello",
      '"string"',
    ]) {
      expect(parseShapeFile(text)).toEqual({
        ok: false,
        refusal: "not-recognised",
      });
    }
  });

  it("strips a byte order mark and white space before the text", () => {
    expect(
      shapesOf(
        parseShapeFile(`﻿ \n${json({ type: "Point", coordinates: [1, 1] })}`),
      ),
    ).toHaveLength(1);
  });

  it("returns an empty import for an empty collection", () => {
    expect(parseShapeFile(collection())).toEqual({
      ok: true,
      shapes: [],
      skipped: {},
      holesDropped: 0,
    });
  });
});

describe("parseShapeFile refusals", () => {
  it("refuses an empty file", () => {
    expect(parseShapeFile("")).toEqual({ ok: false, refusal: "empty" });
    expect(parseShapeFile(" \r\n﻿")).toEqual({
      ok: false,
      refusal: "empty",
    });
  });

  it("refuses text longer than the size cap before reading it", () => {
    const text = `{"type":"Point","coordinates":[1,1]}${" ".repeat(MAX_IMPORT_BYTES)}`;
    expect(parseShapeFile(text)).toEqual({ ok: false, refusal: "too-large" });
  });

  it("refuses nesting deeper than the cap, without recursion", () => {
    const deep = `${"[".repeat(MAX_IMPORT_DEPTH + 1)}${"]".repeat(MAX_IMPORT_DEPTH + 1)}`;
    expect(parseShapeFile(`{"type":"Point","coordinates":${deep}}`)).toEqual({
      ok: false,
      refusal: "too-deep",
    });
    const huge = `{"a":${"[".repeat(400_000)}`;
    expect(parseShapeFile(huge)).toEqual({ ok: false, refusal: "too-deep" });
  });

  it("does not count brackets inside strings as nesting", () => {
    const name = "[".repeat(MAX_IMPORT_DEPTH * 2);
    const text = json(
      feature({ type: "Point", coordinates: [1, 1] }, { name: `\\"${name}` }),
    );
    expect(shapesOf(parseShapeFile(text))).toHaveLength(1);
  });

  it("refuses a file with more shapes than the cap, counting skipped ones", () => {
    const many = Array.from({ length: MAX_IMPORT_SHAPES + 1 }, () =>
      feature(null),
    );
    expect(parseShapeFile(collection(...many))).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
    const parts = Array.from({ length: MAX_IMPORT_SHAPES + 1 }, () => [0, 0]);
    expect(
      parseShapeFile(json({ type: "MultiPoint", coordinates: parts })),
    ).toEqual({ ok: false, refusal: "too-many-shapes" });
  });

  it("refuses a file with more points than the cap", () => {
    const line = Array.from({ length: MAX_IMPORT_SHAPE_POINTS }, (_, index) => [
      index / 10_000,
      0,
    ]);
    const lines = Array.from(
      { length: MAX_IMPORT_POINTS / MAX_IMPORT_SHAPE_POINTS + 1 },
      () => line,
    );
    expect(
      parseShapeFile(json({ type: "MultiLineString", coordinates: lines })),
    ).toEqual({ ok: false, refusal: "too-many-points" });
  });

  it("refuses a file whose points pass the cap on a point read last", () => {
    const line = Array.from({ length: MAX_IMPORT_SHAPE_POINTS }, (_, index) => [
      index / 10_000,
      0,
    ]);
    const lines = Array.from(
      { length: MAX_IMPORT_POINTS / MAX_IMPORT_SHAPE_POINTS },
      () => ({ type: "LineString", coordinates: line }),
    );
    for (const last of [
      { type: "Point", coordinates: [1, 1] },
      { type: "Polygon", coordinates: [SQUARE] },
    ]) {
      expect(
        parseShapeFile(
          json({ type: "GeometryCollection", geometries: [...lines, last] }),
        ),
      ).toEqual({ ok: false, refusal: "too-many-points" });
    }
  });

  it("refuses text that is neither GeoJSON nor the draw tool's CSV", () => {
    expect(parseShapeFile("name,lat,lng\r\nA,1,2")).toEqual({
      ok: false,
      refusal: "not-recognised",
    });
  });
});

describe("parseShapeFile with CSV", () => {
  const SHAPES: DrawShape[] = [
    finished({ kind: "point", vertices: [p(2.3522, 48.8566)] }, 0),
    finished({ kind: "line", vertices: [p(2.35, 48.85), p(2.36, 48.86)] }, 1),
    finished(
      {
        kind: "polygon",
        vertices: [p(0, 0), p(0.01, 0), p(0.01, 0.01), p(0, 0.01)],
      },
      2,
    ),
    finished(
      { kind: "circle", vertices: [p(36.8219, -1.2921)], radiusMetres: 500 },
      3,
    ),
  ];

  it("reads back every kind of shape the exporter wrote, circles included", () => {
    expect(shapesOf(parseShapeFile(shapesToCsv(SHAPES)))).toEqual(
      SHAPES.map(({ kind, vertices, radiusMetres }) =>
        radiusMetres === undefined
          ? { kind, vertices }
          : { kind, vertices, radiusMetres },
      ),
    );
  });

  it("reads the older five-column CSV, where a circle comes back as its polygon", () => {
    const legacy = shapesToCsv(SHAPES)
      .split("\r\n")
      .map((row) => row.replace(/,[^,"]*,[^,"]*,[^,"]*$/, ""))
      .join("\n");
    const shapes = shapesOf(parseShapeFile(legacy));
    expect(shapes.map((shape) => shape.kind)).toEqual([
      "point",
      "line",
      "polygon",
      "polygon",
    ]);
  });

  it("skips rows it cannot read and keeps the rest", () => {
    const header = shapesToCsv([]);
    const rows = [
      header,
      'shape-1,point,,,"{""type"":""Point"",""coordinates"":[1,2]}",,,',
      "shape-2,point,,,not json,,,",
      "shape-3,point",
      'shape-4,circle,,,"{""type"":""Point"",""coordinates"":[1,2]}",0x10,1,2',
      'shape-5,line,,,"{""type"":""LineString"",""coordinates"":[[0,0],[1,1]]}",,,',
      `shape-6,point,,,"${"[".repeat(MAX_IMPORT_DEPTH + 2)}",,,`,
      "",
    ];
    expect(parseShapeFile(rows.join("\r\n"))).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 2)] },
        { kind: "point", vertices: [p(1, 2)] },
        { kind: "line", vertices: [p(0, 0), p(1, 1)] },
      ],
      skipped: { malformed: 3 },
      holesDropped: 0,
    });
  });

  it("reads a circle row whose centre is outside the world as its geometry", () => {
    const header = shapesToCsv([]);
    const row =
      'c,circle,,,"{""type"":""Point"",""coordinates"":[1,2]}",500,200,0';
    expect(shapesOf(parseShapeFile(`${header}\n${row}`))).toEqual([
      { kind: "point", vertices: [p(1, 2)] },
    ]);
  });

  it("reads a circle row whose radius is not above zero as its geometry", () => {
    const header = shapesToCsv([]);
    const rows = ["0", "-3"].map(
      (radius) =>
        `c,circle,,,"{""type"":""Point"",""coordinates"":[1,2]}",${radius},1,2`,
    );
    expect(parseShapeFile([header, ...rows].join("\r\n"))).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 2)] },
        { kind: "point", vertices: [p(1, 2)] },
      ],
      skipped: {},
      holesDropped: 0,
    });
  });

  it("reads a circle of a few centimetres back exactly, from where it was written", () => {
    const circle = finished(
      {
        kind: "circle",
        vertices: [p(36.82190123456789, -1.29210987654321)],
        radiusMetres: 0.004,
      },
      0,
    );
    expect(shapesOf(parseShapeFile(shapesToCsv([circle])))).toEqual([
      {
        kind: "circle",
        vertices: [p(36.82190123456789, -1.29210987654321)],
        radiusMetres: 0.004,
      },
    ]);
  });

  it("reads a CSV that starts with a byte order mark", () => {
    const text = `﻿${shapesToCsv(SHAPES.slice(0, 1))}`;
    expect(shapesOf(parseShapeFile(text))).toHaveLength(1);
  });

  it("reads quoted fields with commas, quotes and new lines", () => {
    const header = shapesToCsv([]);
    const text = `${header}\n"shape,""1""\nx",point,,,"{""type"":""Point"",""coordinates"":[1,2]}",,,`;
    expect(shapesOf(parseShapeFile(text))).toHaveLength(1);
  });

  it("skips a row whose quote never closes", () => {
    const header = shapesToCsv([]);
    expect(parseShapeFile(`${header}\nshape-1,point,,,"{`)).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { malformed: 1 },
    });
  });

  it("refuses a CSV with more rows than the shape cap", () => {
    const header = shapesToCsv([]);
    const row = 'a,point,,,"{""type"":""Point"",""coordinates"":[1,2]}",,,';
    const text = [header, ...Array(MAX_IMPORT_SHAPES + 1).fill(row)].join("\n");
    expect(parseShapeFile(text)).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
  });
});

describe("parseShapeFile with WKT text", () => {
  it("reads a point, a line and a polygon, with the closing position dropped", () => {
    expect(shapesOf(parseShapeFile("POINT (2 48)"))).toEqual([
      { kind: "point", vertices: [p(2, 48)] },
    ]);
    expect(shapesOf(parseShapeFile("LINESTRING (0 0, 1 1)"))).toEqual([
      { kind: "line", vertices: [p(0, 0), p(1, 1)] },
    ]);
    expect(
      shapesOf(parseShapeFile("POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))")),
    ).toEqual([
      { kind: "polygon", vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)] },
    ]);
  });

  it("reads one geometry or several, in any layout, case and spacing", () => {
    const text =
      "point(1 2)\r\nLineString (\n 0 0,\n 1 1\n)\n\n  POINT Z (3 4 100)  ";
    expect(shapesOf(parseShapeFile(text))).toEqual([
      { kind: "point", vertices: [p(1, 2)] },
      { kind: "line", vertices: [p(0, 0), p(1, 1)] },
      { kind: "point", vertices: [p(3, 4)] },
    ]);
  });

  it("splits Multi geometries into one shape per part and counts the holes it left out", () => {
    const result = parseShapeFile(
      "MULTIPOINT ((1 1), (2 2))\nMULTILINESTRING ((0 0, 1 1), (2 2, 3 3))\nMULTIPOLYGON (((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 1 2, 2 2, 2 1, 1 1)), ((10 10, 11 10, 11 11, 10 10)))",
    );
    expect(shapesOf(result).map((shape) => shape.kind)).toEqual([
      "point",
      "point",
      "line",
      "line",
      "polygon",
      "polygon",
    ]);
    expect(result).toMatchObject({ holesDropped: 1 });
  });

  it("flattens a GEOMETRYCOLLECTION once and skips one nested inside it", () => {
    const result = parseShapeFile(
      "GEOMETRYCOLLECTION (POINT (1 1), LINESTRING (0 0, 1 1), GEOMETRYCOLLECTION (POINT (2 2)))",
    );
    expect(shapesOf(result).map((shape) => shape.kind)).toEqual([
      "point",
      "line",
    ]);
    expect(result).toMatchObject({ skipped: { unsupported: 1 } });
  });

  it("reads longitude then latitude unless told the text is latitude first", () => {
    expect(shapesOf(parseShapeFile("POINT (100 2)"))).toEqual([
      { kind: "point", vertices: [p(100, 2)] },
    ]);
    expect(
      shapesOf(parseShapeFile("POINT (2 100)", { wktAxisOrder: "lat-lng" })),
    ).toEqual([{ kind: "point", vertices: [p(100, 2)] }]);
    expect(
      parseShapeFile("POINT (100 2)", { wktAxisOrder: "lat-lng" }),
    ).toMatchObject({ shapes: [], skipped: { "out-of-range": 1 } });
  });

  it("reads an EWKT SRID prefix of 4326, one for each geometry", () => {
    expect(shapesOf(parseShapeFile("SRID=4326;POINT (2 48)"))).toEqual([
      { kind: "point", vertices: [p(2, 48)] },
    ]);
    expect(
      shapesOf(
        parseShapeFile(
          "SRID=4326;POINT (1 1)\nSRID=4326;LINESTRING (0 0, 1 1)",
        ),
      ),
    ).toEqual([
      { kind: "point", vertices: [p(1, 1)] },
      { kind: "line", vertices: [p(0, 0), p(1, 1)] },
    ]);
  });

  it("refuses the whole file for any other SRID, with a plain message", () => {
    expect(parseShapeFile("SRID=3857;POINT (261845.8 6250056)")).toEqual({
      ok: false,
      refusal: "wkt-unreadable",
      detail: "Only SRID 4326 (WGS 84) is supported, not SRID 3857.",
    });
  });

  it("refuses the whole file when a later geometry has another SRID", () => {
    expect(
      parseShapeFile("SRID=4326;POINT (1 2)\nSRID=3857;POINT (3 4)"),
    ).toEqual({
      ok: false,
      refusal: "wkt-unreadable",
      detail: "Only SRID 4326 (WGS 84) is supported, not SRID 3857.",
    });
  });

  it("refuses SRID 0, which says no system at all", () => {
    expect(parseShapeFile("SRID=0;POINT (1 2)")).toEqual({
      ok: false,
      refusal: "wkt-unreadable",
      detail: "Only SRID 4326 (WGS 84) is supported, not SRID 0.",
    });
  });

  it("reads a prefix after a byte order mark and white space", () => {
    expect(shapesOf(parseShapeFile("﻿ \n\tSRID=4326;POINT (2 48)"))).toEqual([
      { kind: "point", vertices: [p(2, 48)] },
    ]);
  });

  it("takes a damaged EWKT prefix for WKT, with the reader's position", () => {
    expect(parseShapeFile("SRID=;POINT (1 2)")).toMatchObject({
      ok: false,
      refusal: "wkt-unreadable",
      detail: expect.stringMatching(/ at position \d+\.$/),
    });
  });

  it("skips shapes that break the draw rules and says why", () => {
    expect(
      parseShapeFile(
        "POINT (200 0)\nLINESTRING (1 1)\nPOLYGON ((0 0, 2 2, 2 0, 0 2, 0 0))\nPOINT (5 5)",
      ),
    ).toEqual({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(5, 5)] }],
      skipped: {
        "out-of-range": 1,
        "too-few-vertices": 1,
        "self-intersecting": 1,
      },
      holesDropped: 0,
    });
  });

  it("skips an empty shape without refusing the file", () => {
    expect(
      parseShapeFile("POINT EMPTY\nPOLYGON EMPTY\nPOINT (1 2)"),
    ).toMatchObject({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(1, 2)] }],
      skipped: { malformed: 2 },
    });
    expect(parseShapeFile("MULTIPOINT EMPTY")).toMatchObject({
      ok: true,
      shapes: [],
      skipped: {},
    });
  });

  it("refuses the whole file for a measure or a curve, even beside valid lines, and says why", () => {
    const measure = "Coordinates with a measure (M) are not supported.";
    const curve = "The WKT type CIRCULARSTRING is not supported.";
    for (const [text, detail] of [
      ["POINT M (1 2 3)", measure],
      ["POINT ZM (1 2 3 4)", measure],
      ["POINT (1 1)\nLINESTRING (0 0, 1 1)\nPOINT M (1 2 3)", measure],
      ["CIRCULARSTRING (0 0, 1 1, 2 0)", curve],
    ] as const) {
      expect(parseShapeFile(text)).toEqual({
        ok: false,
        refusal: "wkt-unreadable",
        detail,
      });
    }
  });

  it("strips a byte order mark and white space before the text", () => {
    expect(shapesOf(parseShapeFile("﻿ \nPOINT (1 1)"))).toHaveLength(1);
  });

  it("refuses the whole file for text that starts like WKT but is not, with the reader's own position", () => {
    for (const text of [
      "POINT (1",
      "POINT (1 2) x",
      "POINT (1 2), POINT (3 4)",
      "POINT (a b)",
      "POINT (1 2 3 4 5)",
      "POINT (1 1)\nLINESTRING (0 0, 1 1",
      `${"GEOMETRYCOLLECTION (".repeat(40)}POINT (1 1)${")".repeat(40)}`,
    ]) {
      const result = parseShapeFile(text);
      expect(result).toMatchObject({ ok: false, refusal: "wkt-unreadable" });
      expect(result).toMatchObject({
        detail: expect.stringMatching(/ at position \d+\.$/),
      });
    }
  });

  it("names the position of the fault in the words of the refusal", () => {
    expect(parseShapeFile("POINT (1 1)\nLINESTRING (0 0, 1 1")).toEqual({
      ok: false,
      refusal: "wkt-unreadable",
      detail: 'Expected ")" at position 33.',
    });
  });

  it("does not take text that does not start with a WKT type for WKT", () => {
    for (const text of ["name,lat,lng\nA,1,2", "(1 2)"]) {
      expect(parseShapeFile(text)).toEqual({
        ok: false,
        refusal: "not-recognised",
      });
    }
  });

  it("refuses a file with more shapes than the cap, counting skipped ones", () => {
    const points = Array(MAX_IMPORT_SHAPES + 1).fill("POINT (1 1)");
    expect(parseShapeFile(points.join("\n"))).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
  });

  it("refuses a file with more points than the cap", () => {
    const line = `LINESTRING (${Array(MAX_IMPORT_SHAPE_POINTS).fill("1 1").join(", ")})`;
    const lines = Array(MAX_IMPORT_POINTS / MAX_IMPORT_SHAPE_POINTS + 1).fill(
      line,
    );
    expect(parseShapeFile(lines.join("\n"))).toEqual({
      ok: false,
      refusal: "too-many-points",
    });
  });

  it("skips a shape with more points than one shape may have", () => {
    const line = `LINESTRING (${Array(MAX_IMPORT_SHAPE_POINTS + 1)
      .fill("1 1")
      .join(", ")})`;
    expect(parseShapeFile(line)).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { "too-many-points": 1 },
    });
  });

  it("refuses text longer than the size cap before reading it", () => {
    expect(
      parseShapeFile(`POINT (1 1)${" ".repeat(MAX_IMPORT_BYTES)}`),
    ).toEqual({ ok: false, refusal: "too-large" });
  });
});

describe("parseShapeFile with a WKT column", () => {
  const rows = (...lines: string[]) => lines.join("\r\n");

  it("reads the cells of a column named wkt, wherever it is and however it is cased", () => {
    const text = rows(
      "name,WKT,note",
      'a,"POINT (1 2)",first',
      'b,"LINESTRING (0 0, 1 1)",second',
      'c,"MULTIPOINT ((3 3), (4 4))",third',
    );
    expect(shapesOf(parseShapeFile(text))).toEqual([
      { kind: "point", vertices: [p(1, 2)] },
      { kind: "line", vertices: [p(0, 0), p(1, 1)] },
      { kind: "point", vertices: [p(3, 3)] },
      { kind: "point", vertices: [p(4, 4)] },
    ]);
    expect(shapesOf(parseShapeFile(rows(" wkt ", "POINT (1 2)")))).toEqual([
      { kind: "point", vertices: [p(1, 2)] },
    ]);
  });

  it("applies the axis order to the cells", () => {
    const text = rows("wkt", "POINT (2 100)");
    expect(shapesOf(parseShapeFile(text, { wktAxisOrder: "lat-lng" }))).toEqual(
      [{ kind: "point", vertices: [p(100, 2)] }],
    );
  });

  it("reads an EWKT cell of SRID 4326 and skips a cell of another SRID by its own reason", () => {
    const text = rows("wkt", "SRID=4326;POINT (1 2)", "SRID=3857;POINT (3 4)");
    expect(parseShapeFile(text)).toMatchObject({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(1, 2)] }],
      skipped: { "other-srid": 1 },
    });
  });

  it("counts a curve or a measure as unsupported, not as another SRID", () => {
    const text = rows(
      "wkt",
      '"CIRCULARSTRING (0 0, 1 1, 2 0)"',
      "POINT M (1 2 3)",
    );
    expect(parseShapeFile(text)).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { unsupported: 2 },
    });
  });

  it("skips a row it cannot read, by the reason, and keeps the rest", () => {
    const text = rows(
      "id,wkt",
      '1,"POINT (1 2)"',
      '2,"POINT (1"',
      '3,"POINT M (1 2 3)"',
      "4,",
      '5,"POINT (500 0)"',
      "6,LINESTRING (0 0, 1 1)",
      "7",
      '8,"POINT (5 6)"',
      "",
    );
    expect(parseShapeFile(text)).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 2)] },
        { kind: "point", vertices: [p(5, 6)] },
      ],
      skipped: { malformed: 4, unsupported: 1, "out-of-range": 1 },
      holesDropped: 0,
    });
  });

  it("skips a row whose quote never closes", () => {
    expect(parseShapeFile(rows("wkt", '"POINT (1 2)'))).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { malformed: 1 },
    });
  });

  it("refuses a file with more rows than the shape cap", () => {
    const text = rows(
      "wkt",
      ...Array(MAX_IMPORT_SHAPES + 1).fill("POINT (1 1)"),
    );
    expect(parseShapeFile(text)).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
  });

  it("does not take any other column for WKT", () => {
    for (const text of [
      rows("name,geometry", 'a,"POINT (1 2)"'),
      rows("name,lat,lng", "A,1,2"),
    ]) {
      expect(parseShapeFile(text)).toEqual({
        ok: false,
        refusal: "not-recognised",
      });
    }
  });
});

describe("export then import", () => {
  it("brings WKT back as the same shapes, a circle as its polygon", () => {
    const shapes: DrawShape[] = [
      finished({ kind: "point", vertices: [p(1, 2)] }, 0),
      finished({ kind: "line", vertices: [p(1, 2), p(3, 4)] }, 1),
      finished(
        { kind: "polygon", vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)] },
        2,
      ),
      finished({ kind: "circle", vertices: [p(1, 2)], radiusMetres: 100 }, 3),
    ];
    const read = shapesOf(parseShapeFile(shapesToWkt(shapes)));
    expect(read.map((shape) => shape.kind)).toEqual([
      "point",
      "line",
      "polygon",
      "polygon",
    ]);
    expect(
      shapesToGeoJson(read.map(finished)).features.map((f) => f.geometry),
    ).toEqual(shapesToGeoJson(shapes).features.map((f) => f.geometry));
  });

  it("brings back a circle of half a metre, from WKT and CSV, as a polygon that is kept", () => {
    const shapes: DrawShape[] = [
      finished({ kind: "circle", vertices: [p(1, 2)], radiusMetres: 0.5 }, 0),
    ];
    const fromWkt = parseShapeFile(shapesToWkt(shapes));
    expect(fromWkt).toMatchObject({ ok: true, skipped: {} });
    expect(shapesOf(fromWkt).map((shape) => shape.kind)).toEqual(["polygon"]);
    expect(shapesOf(parseShapeFile(shapesToCsv(shapes)))).toEqual([
      { kind: "circle", vertices: [p(1, 2)], radiusMetres: 0.5 },
    ]);
  });

  it("brings GeoJSON back as the same shapes", () => {
    const shapes: DrawShape[] = [
      finished({ kind: "point", vertices: [p(1, 2)] }, 0),
      finished({ kind: "circle", vertices: [p(1, 2)], radiusMetres: 100 }, 1),
    ];
    const read = shapesOf(parseShapeFile(json(shapesToGeoJson(shapes))));
    expect(shapesToGeoJson(read.map(finished))).toEqual(
      shapesToGeoJson(shapes),
    );
  });
});

describe("shapeInputBounds", () => {
  it("holds every vertex, and the whole of a circle", () => {
    const bounds = shapeInputBounds([
      { kind: "point", vertices: [p(1, 2)] },
      { kind: "circle", vertices: [p(10, 0)], radiusMetres: 111_195 },
    ]);
    expect(bounds?.south).toBeCloseTo(-1, 3);
    expect(bounds?.north).toBeCloseTo(2, 6);
    expect(bounds?.west).toBeCloseTo(1, 6);
    expect(bounds?.east).toBeCloseTo(11, 3);
  });

  it("spans the antimeridian the short way", () => {
    expect(
      shapeInputBounds([{ kind: "line", vertices: [p(179, 1), p(-179, 2)] }]),
    ).toEqual({ south: 1, west: 179, north: 2, east: 181 });
  });

  it("is undefined with nothing to hold", () => {
    expect(shapeInputBounds([])).toBeUndefined();
  });
});
