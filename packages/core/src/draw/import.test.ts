// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import { formatMessage } from "../messages/formatMessage";
import { shapesToCsv, shapesToGeoJson, shapesToWkt } from "./export";
import {
  MAX_AXIS_SCAN_CHARACTERS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_DEPTH,
  MAX_IMPORT_POINTS,
  MAX_IMPORT_SHAPE_POINTS,
  MAX_IMPORT_SHAPES,
  parseShapeFile,
  type ShapeImport,
  shapeInputBounds,
  suggestWktAxisOrder,
} from "./import";
import type { DrawShapeInput } from "./reducer";
import type { DrawShape } from "./types";

/** A result with the reader's `detail` in English, as the live region would say it. */
function readable(result: ShapeImport) {
  return result.ok || result.detail === undefined
    ? result
    : {
        ...result,
        detail: formatMessage(new FakeMessageCatalogue(), result.detail),
      };
}

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
    expect(
      readable(parseShapeFile("SRID=3857;POINT (261845.8 6250056)")),
    ).toEqual({
      ok: false,
      refusal: "wkt-unreadable",
      detail: "Only SRID 4326 (WGS 84) is supported, not SRID 3857.",
    });
  });

  it("skips a later geometry in another SRID, counts it, and keeps the others", () => {
    expect(
      parseShapeFile(
        "SRID=4326;POINT (1 2)\nSRID=3857;POINT (3 4)\nSRID=4326;POINT (5 6)",
      ),
    ).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 2)] },
        { kind: "point", vertices: [p(5, 6)] },
      ],
      skipped: { "other-srid": 1 },
      holesDropped: 0,
    });
  });

  it("refuses SRID 0, which says no system at all", () => {
    expect(readable(parseShapeFile("SRID=0;POINT (1 2)"))).toEqual({
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
    expect(readable(parseShapeFile("SRID=;POINT (1 2)"))).toMatchObject({
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

  it("skips a measure or a curve beside valid geometries and counts it", () => {
    expect(
      parseShapeFile(
        "POINT (1 1)\nPOINT M (1 2 3)\nCIRCULARSTRING (0 0, 1 1, 2 0)\nLINESTRING (0 0, 1 1) POINT ZM (1 2 3 4) POINT (2 2)",
      ),
    ).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 1)] },
        { kind: "line", vertices: [p(0, 0), p(1, 1)] },
        { kind: "point", vertices: [p(2, 2)] },
      ],
      skipped: { unsupported: 3 },
      holesDropped: 0,
    });
  });

  it("skips one bad line, counts it, and keeps the lines around it", () => {
    expect(
      parseShapeFile(
        "POINT (1 1)\nPOINT (x y)\nLINESTRING (0 0, 1 1\nPOINT (4 4)\nnot WKT at all\nPOINT (5 5)",
      ),
    ).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 1)] },
        { kind: "point", vertices: [p(4, 4)] },
        { kind: "point", vertices: [p(5, 5)] },
      ],
      skipped: { malformed: 3 },
      holesDropped: 0,
    });
  });

  it("skips what follows a geometry on its line, up to the next line that starts one", () => {
    expect(
      parseShapeFile("POINT (1 2) x POINT (3 4)\nPOINT (5 6)"),
    ).toMatchObject({
      shapes: [
        { kind: "point", vertices: [p(1, 2)] },
        { kind: "point", vertices: [p(5, 6)] },
      ],
      skipped: { malformed: 1 },
    });
  });

  it("skips a collection with an unsupported member whole, over several lines, and counts it once", () => {
    expect(
      parseShapeFile(
        "GEOMETRYCOLLECTION (\nPOINT (1 1),\nPOINT M (1 2 3),\nLINESTRING (0 0, 1 1)\n)\nPOINT (9 9)",
      ),
    ).toEqual({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(9, 9)] }],
      skipped: { unsupported: 1 },
      holesDropped: 0,
    });
  });

  it("stops reading at the cap when every stretch is one that cannot be used", () => {
    const lines = (count: number) => "POINT M (1 2 3)\n".repeat(count);
    expect(parseShapeFile(lines(500))).toMatchObject({
      ok: false,
      refusal: "wkt-unreadable",
    });
    expect(parseShapeFile(lines(501))).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
  });

  it("refuses the whole file for a measure or a curve when nothing else can be read, and says why", () => {
    const measure = "Coordinates with a measure (M) are not supported.";
    const curve = "The WKT type CIRCULARSTRING is not supported.";
    for (const [text, detail] of [
      ["POINT M (1 2 3)", measure],
      ["POINT ZM (1 2 3 4)", measure],
      ["POINT M (1 2 3)\nPOINT ZM (1 2 3 4)", measure],
      ["CIRCULARSTRING (0 0, 1 1, 2 0)", curve],
    ] as const) {
      expect(readable(parseShapeFile(text))).toEqual({
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
      "POINT (a b)",
      "POINT (1 2 3 4 5)",
      "POINT (1 2\nLINESTRING (0 0, 1 1",
      `${"GEOMETRYCOLLECTION (".repeat(40)}POINT (1 1)${")".repeat(40)}`,
    ]) {
      const result = readable(parseShapeFile(text));
      expect(result).toMatchObject({ ok: false, refusal: "wkt-unreadable" });
      expect(result).toMatchObject({
        detail: expect.stringMatching(/ at position \d+\.$/),
      });
    }
  });

  it("names the position of the first fault in the words of the refusal", () => {
    expect(
      readable(parseShapeFile("POINT (a b)\nLINESTRING (0 0, 1 1")),
    ).toEqual({
      ok: false,
      refusal: "wkt-unreadable",
      detail: "Expected a number at position 8.",
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

  it("keeps the geometries of a cell around one it cannot use, and counts that one", () => {
    const text = rows(
      "wkt",
      '"POINT (1 1) POINT M (1 2 3) SRID=3857;POINT (5 5) POINT (3 3)"',
      '"POINT (x)"',
    );
    expect(parseShapeFile(text)).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(1, 1)] },
        { kind: "point", vertices: [p(3, 3)] },
      ],
      skipped: { unsupported: 1, "other-srid": 1, malformed: 1 },
      holesDropped: 0,
    });
  });

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

describe("suggestWktAxisOrder", () => {
  it("suggests latitude first when the first position is outside the world as longitude first but fits the other way", () => {
    expect(suggestWktAxisOrder("POINT (-33.9 151.2)", "lng-lat")).toBe(
      "lat-lng",
    );
  });

  it("suggests longitude first for a file read latitude first that only fits that way", () => {
    expect(suggestWktAxisOrder("POINT (151.2 -33.9)", "lat-lng")).toBe(
      "lng-lat",
    );
  });

  it("finds the first position of a polygon, a multi geometry, an EWKT geometry and a CSV cell", () => {
    expect(
      suggestWktAxisOrder("POLYGON ((-33.9 151.2, -33.8 151.3))", "lng-lat"),
    ).toBe("lat-lng");
    expect(
      suggestWktAxisOrder("MULTIPOINT ((-33.9 151.2), (1 2))", "lng-lat"),
    ).toBe("lat-lng");
    expect(
      suggestWktAxisOrder("SRID=4326;POINT Z (-33.9 151.2 5)", "lng-lat"),
    ).toBe("lat-lng");
    expect(
      suggestWktAxisOrder('id,wkt\n1,"POINT (-33.9 151.2)"', "lng-lat"),
    ).toBe("lat-lng");
  });

  it("says nothing when the first position fits the order in use, or fits neither order", () => {
    expect(suggestWktAxisOrder("POINT (2 48)", "lng-lat")).toBeNull();
    expect(suggestWktAxisOrder("POINT (200 300)", "lng-lat")).toBeNull();
    expect(suggestWktAxisOrder("POINT (-33.9 151.2)", "lat-lng")).toBeNull();
  });

  it("says nothing for text with no position, an empty geometry or GeoJSON", () => {
    expect(suggestWktAxisOrder("POINT EMPTY", "lng-lat")).toBeNull();
    expect(suggestWktAxisOrder("", "lng-lat")).toBeNull();
    expect(
      suggestWktAxisOrder(
        '{"type":"Point","coordinates":[-33.9,151.2]}',
        "lng-lat",
      ),
    ).toBeNull();
  });

  it("stays fast on large text of brackets and spaces, by reading only its start", () => {
    const inputs = [
      "(".repeat(200_000),
      "( ".repeat(100_000),
      `${"(".repeat(50_000)}${" ".repeat(150_000)}`,
    ];
    const started = performance.now();
    for (const input of inputs) {
      expect(suggestWktAxisOrder(input, "lng-lat")).toBeNull();
    }
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("finds nothing in time in the worst text of exactly the size it reads", () => {
    const keywords = "POINT(".repeat(MAX_AXIS_SCAN_CHARACTERS / 6);
    const inputs = [
      "(".repeat(MAX_AXIS_SCAN_CHARACTERS),
      "( ".repeat(MAX_AXIS_SCAN_CHARACTERS / 2),
      `POINT${" ".repeat(MAX_AXIS_SCAN_CHARACTERS - 6)}(`,
      keywords.padEnd(MAX_AXIS_SCAN_CHARACTERS, " "),
      "POINT (".repeat(MAX_AXIS_SCAN_CHARACTERS / 7),
    ];
    const started = performance.now();
    for (const input of inputs) {
      expect(suggestWktAxisOrder(input, "lng-lat")).toBeNull();
    }
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("makes no suggestion for a parenthesised pair that is not WKT", () => {
    expect(
      suggestWktAxisOrder("name,notes\nSite (-33.9 151.2),visited", "lng-lat"),
    ).toBeNull();
    expect(suggestWktAxisOrder("Site (-33.9 151.2)", "lng-lat")).toBeNull();
    expect(suggestWktAxisOrder("ENDPOINT (-33.9 151.2)", "lng-lat")).toBeNull();
  });

  it("reads a geometry type in any case, with a dimension letter, inside a collection and after an EWKT prefix", () => {
    expect(suggestWktAxisOrder("point (-33.9 151.2)", "lng-lat")).toBe(
      "lat-lng",
    );
    expect(suggestWktAxisOrder("POINT ZM(-33.9 151.2 1 2)", "lng-lat")).toBe(
      "lat-lng",
    );
    expect(
      suggestWktAxisOrder(
        "GEOMETRYCOLLECTION (POINT (-33.9 151.2))",
        "lng-lat",
      ),
    ).toBe("lat-lng");
    expect(
      suggestWktAxisOrder("SRID=4326;POINT (-33.9 151.2)", "lng-lat"),
    ).toBe("lat-lng");
  });

  it("looks only at the start of the text, so a position far into a large file is not searched for", () => {
    const far = `${" ".repeat(MAX_AXIS_SCAN_CHARACTERS)}POINT (-33.9 151.2)`;
    expect(suggestWktAxisOrder(far, "lng-lat")).toBeNull();
  });

  it("makes no suggestion for text longer than an import accepts", () => {
    const text = `POINT (-33.9 151.2)${" ".repeat(MAX_IMPORT_BYTES)}`;
    expect(suggestWktAxisOrder(text, "lng-lat")).toBeNull();
  });

  it("reads signs and exponents", () => {
    expect(suggestWktAxisOrder("POINT (-3.39e1 +1.512E2)", "lng-lat")).toBe(
      "lat-lng",
    );
  });
});

describe("parseShapeFile with GPX", () => {
  const gpx = (body: string) =>
    `<?xml version="1.0"?><gpx version="1.1" creator="t">${body}</gpx>`;
  const TRACK =
    '<trk><name>&lt;b&gt;x&lt;/b&gt;</name><trkseg><trkpt lat="0" lon="0"/><trkpt lat="0" lon="1"/></trkseg><trkseg><trkpt lat="1" lon="1"/><trkpt lat="1" lon="2"/></trkseg></trk>';

  it("reads waypoints, routes and track segments, one shape each", () => {
    const result = parseShapeFile(
      gpx(
        `<wpt lat="1" lon="2"><name>A</name></wpt>
         <rte><rtept lat="0" lon="0"/><rtept lat="0" lon="1"/></rte>${TRACK}`,
      ),
    );
    expect(result).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(2, 1)] },
        { kind: "line", vertices: [p(0, 0), p(1, 0)] },
        { kind: "line", vertices: [p(0, 0), p(1, 0)] },
        { kind: "line", vertices: [p(1, 1), p(2, 1)] },
      ],
      skipped: {},
      holesDropped: 0,
    });
  });

  it("tells the format from the content, past a byte order mark and a prolog", () => {
    const text = `﻿\n  <!-- made by a device -->${gpx('<wpt lat="1" lon="2"/>')}`;
    expect(parseShapeFile(text)).toMatchObject({
      ok: true,
      shapes: [{ kind: "point" }],
    });
  });

  it("skips and counts shapes outside the rules, and goes on", () => {
    const result = parseShapeFile(
      gpx(
        `<wpt lat="91" lon="2"/><wpt lon="2"/><wpt lat="1" lon="2"/>
         <rte><rtept lat="0" lon="0"/></rte>
         <rte><rtept lat="0" lon="0"/><rtept lat="x" lon="0"/></rte>
         <trk><trkseg/></trk>`,
      ),
    );
    expect(result).toEqual({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(2, 1)] }],
      skipped: {
        "out-of-range": 1,
        malformed: 2,
        degenerate: 1,
        "too-few-vertices": 1,
      },
      holesDropped: 0,
    });
  });

  it("skips a track segment of more points than a shape may have", () => {
    const points = '<trkpt lat="0" lon="0"/>'.repeat(
      MAX_IMPORT_SHAPE_POINTS + 1,
    );
    expect(
      parseShapeFile(gpx(`<trk><trkseg>${points}</trkseg></trk>`)),
    ).toEqual({
      ok: true,
      shapes: [],
      skipped: { "too-many-points": 1 },
      holesDropped: 0,
    });
  });

  it("refuses a file of more shapes or points than an import accepts", () => {
    const waypoints = '<wpt lat="1" lon="2"/>'.repeat(MAX_IMPORT_SHAPES + 1);
    expect(parseShapeFile(gpx(waypoints))).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
    const segment = `<trkseg>${'<trkpt lat="0" lon="0"/>'.repeat(MAX_IMPORT_SHAPE_POINTS)}</trkseg>`;
    expect(
      parseShapeFile(
        gpx(
          `<trk>${segment.repeat(MAX_IMPORT_POINTS / MAX_IMPORT_SHAPE_POINTS + 1)}</trk>`,
        ),
      ),
    ).toEqual({ ok: false, refusal: "too-many-points" });
  });

  it("refuses a file of too many shapes before it reads on to damaged text", () => {
    const text = `<gpx>${'<wpt lat="1" lon="2"/>'.repeat(MAX_IMPORT_SHAPES + 1)}<wpt>`;
    expect(parseShapeFile(text)).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
  });

  it("accepts a file of exactly the most shapes and exactly the most points", () => {
    const waypoints = '<wpt lat="1" lon="2"/>'.repeat(MAX_IMPORT_SHAPES);
    expect(parseShapeFile(gpx(waypoints))).toMatchObject({
      ok: true,
      shapes: expect.arrayContaining([{ kind: "point", vertices: [p(2, 1)] }]),
    });
    const segments = Array.from(
      { length: MAX_IMPORT_POINTS / MAX_IMPORT_SHAPE_POINTS },
      () =>
        `<trkseg>${Array.from(
          { length: MAX_IMPORT_SHAPE_POINTS },
          (_, at) => `<trkpt lat="${at / 100}" lon="0"/>`,
        ).join("")}</trkseg>`,
    ).join("");
    const result = parseShapeFile(gpx(`<trk>${segments}</trk>`));
    expect(result).toMatchObject({ ok: true, skipped: {} });
    expect(result.ok && result.shapes).toHaveLength(10);
  });

  it("skips a position outside the world", () => {
    expect(parseShapeFile(gpx('<wpt lat="1" lon="181"/>'))).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { "out-of-range": 1 },
    });
  });

  it("refuses text that nests elements too deeply", () => {
    expect(parseShapeFile(gpx("<a>".repeat(MAX_IMPORT_DEPTH + 1)))).toEqual({
      ok: false,
      refusal: "too-deep",
    });
  });

  it("refuses a file longer than an import accepts before reading it", () => {
    expect(parseShapeFile(gpx(" ".repeat(MAX_IMPORT_BYTES)))).toEqual({
      ok: false,
      refusal: "too-large",
    });
  });

  it("refuses damaged GPX whole, and leaves other XML to be not recognised", () => {
    expect(parseShapeFile(gpx('<wpt lat="1" lon="2">'))).toEqual({
      ok: false,
      refusal: "gpx-unreadable",
    });
    expect(parseShapeFile("<svg><path/></svg>")).toEqual({
      ok: false,
      refusal: "not-recognised",
    });
    expect(parseShapeFile("<")).toEqual({
      ok: false,
      refusal: "not-recognised",
    });
  });

  it("reads a document whose entities would expand enormously without expanding them", () => {
    const laughs = Array.from(
      { length: 9 },
      (_, level) => `<!ENTITY lol${level + 1} "${`&lol${level};`.repeat(10)}">`,
    ).join("");
    const started = performance.now();
    expect(
      parseShapeFile(
        `<!DOCTYPE gpx [<!ENTITY lol "lol">${laughs}]>${gpx('<wpt lat="1" lon="2"><name>&lol9;</name></wpt>')}`,
      ),
    ).toEqual({ ok: false, refusal: "not-recognised" });
    expect(
      parseShapeFile(gpx('<wpt lat="1" lon="2"><name>&lol9;</name></wpt>')),
    ).toMatchObject({ ok: true, shapes: [{ kind: "point" }] });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("reads each of a file's own mix of foreign content and text", () => {
    const result = parseShapeFile(
      gpx(
        `text<metadata><desc><![CDATA[<script>alert(1)</script>]]></desc></metadata>
         <extensions><x:ext xmlns:x="u"><wpt lat="5" lon="5"/></x:ext></extensions>
         <wpt lat="1" lon="2"><desc>&lt;img onerror=x&gt;</desc></wpt>
         <?x <wpt lat="7" lon="7"/>?>`,
      ),
    );
    expect(result).toMatchObject({ ok: true, shapes: [{ kind: "point" }] });
  });
});

describe("parseShapeFile with KML", () => {
  const kml = (body: string) =>
    `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>${body}</Document></kml>`;
  const mark = (geometry: string, name = "n") =>
    `<Placemark><name>${name}</name>${geometry}</Placemark>`;
  const ring = (coordinates: string) =>
    `<LinearRing><coordinates>${coordinates}</coordinates></LinearRing>`;
  const SQUARE_RING = ring("0,0 1,0 1,1 0,1 0,0");

  it("reads points, lines and polygons, one shape each, and counts the holes left out", () => {
    const result = parseShapeFile(
      kml(
        `${mark("<Point><coordinates>2,1,30</coordinates></Point>")}
         <Folder>${mark("<LineString><coordinates>0,0 1,0</coordinates></LineString>")}
         ${mark(`<Polygon><outerBoundaryIs>${SQUARE_RING}</outerBoundaryIs><innerBoundaryIs>${ring("0.2,0.2 0.4,0.2 0.4,0.4 0.2,0.2")}</innerBoundaryIs></Polygon>`)}</Folder>
         ${mark(`<MultiGeometry><Point><coordinates>5,5</coordinates></Point><Polygon><outerBoundaryIs>${SQUARE_RING}</outerBoundaryIs></Polygon></MultiGeometry>`)}`,
      ),
    );
    expect(result).toEqual({
      ok: true,
      shapes: [
        { kind: "point", vertices: [p(2, 1)] },
        { kind: "line", vertices: [p(0, 0), p(1, 0)] },
        { kind: "polygon", vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)] },
        { kind: "point", vertices: [p(5, 5)] },
        { kind: "polygon", vertices: [p(0, 0), p(1, 0), p(1, 1), p(0, 1)] },
      ],
      skipped: {},
      holesDropped: 1,
    });
  });

  it("reads KML written without the prolog, past a byte order mark", () => {
    const text = `\uFEFF\n <!-- made by an app --><kml><Placemark><Point><coordinates>1,2</coordinates></Point></Placemark></kml>`;
    expect(parseShapeFile(text)).toMatchObject({
      ok: true,
      shapes: [{ kind: "point" }],
    });
  });

  it("still reads GPX, and tells the two apart by their root", () => {
    expect(parseShapeFile('<gpx><wpt lat="1" lon="2"/></gpx>')).toMatchObject({
      ok: true,
      shapes: [{ kind: "point" }],
    });
    expect(parseShapeFile('<kml><wpt lat="1" lon="2"/></kml>')).toMatchObject({
      ok: true,
      shapes: [],
    });
  });

  it("skips and counts shapes outside the rules, and goes on", () => {
    const result = parseShapeFile(
      kml(
        `${mark("<Point><coordinates>2,91</coordinates></Point>")}
         ${mark("<Point><coordinates>1,2 3,4</coordinates></Point>")}
         ${mark("<LineString><coordinates>0,0 x,1</coordinates></LineString>")}
         ${mark("<LineString><coordinates>0,0</coordinates></LineString>")}
         ${mark("<Polygon><extrude>1</extrude></Polygon>")}
         ${mark("<gx:Track><gx:coord>1 2 3</gx:coord></gx:Track>")}
         ${mark("<gx:MultiTrack><gx:Track/><gx:Track/></gx:MultiTrack>")}
         ${mark("<Point><coordinates>1,2</coordinates></Point>")}`,
      ),
    );
    expect(result).toEqual({
      ok: true,
      shapes: [{ kind: "point", vertices: [p(1, 2)] }],
      skipped: {
        "out-of-range": 1,
        malformed: 3,
        "too-few-vertices": 1,
        unsupported: 2,
      },
      holesDropped: 0,
    });
  });

  it("keeps no name or description: nothing of the text reaches a shape or an export", () => {
    const name = '=HYPERLINK("http://evil.example","x")';
    const result = parseShapeFile(
      kml(
        `<Placemark><name>${name}</name><description><![CDATA[<img src=x onerror=alert(1)>]]></description><Point><coordinates>1,2</coordinates></Point></Placemark>`,
      ),
    );
    expect(result).toMatchObject({ ok: true, shapes: [{ kind: "point" }] });
    expect(JSON.stringify(result)).not.toContain("HYPERLINK");
    const shapes = (result as { shapes: DrawShapeInput[] }).shapes;
    expect(
      shapesToCsv(
        shapes.map((shape, index) => ({
          ...shape,
          id: `s${index}`,
          label: "",
          done: true,
        })),
      ),
    ).not.toContain("HYPERLINK");
  });

  it("refuses a file with too many shapes or points, and one that nests too deeply", () => {
    const placemarks = mark(
      "<Point><coordinates>1,2</coordinates></Point>",
    ).repeat(MAX_IMPORT_SHAPES + 1);
    expect(parseShapeFile(kml(placemarks))).toEqual({
      ok: false,
      refusal: "too-many-shapes",
    });
    const tuples = "1,2 ".repeat(MAX_IMPORT_SHAPE_POINTS);
    const lines = mark(
      `<LineString><coordinates>${tuples}</coordinates></LineString>`,
    ).repeat(11);
    expect(parseShapeFile(kml(lines))).toEqual({
      ok: false,
      refusal: "too-many-points",
    });
    expect(
      parseShapeFile(kml("<Folder>".repeat(MAX_IMPORT_DEPTH + 1))),
    ).toEqual({ ok: false, refusal: "too-deep" });
    expect(parseShapeFile(kml(" ".repeat(MAX_IMPORT_BYTES)))).toEqual({
      ok: false,
      refusal: "too-large",
    });
  });

  it("skips a line of more points than a shape may have", () => {
    const tuples = "1,2 ".repeat(MAX_IMPORT_SHAPE_POINTS + 1);
    expect(
      parseShapeFile(
        kml(
          mark(`<LineString><coordinates>${tuples}</coordinates></LineString>`),
        ),
      ),
    ).toMatchObject({
      ok: true,
      shapes: [],
      skipped: { "too-many-points": 1 },
    });
  });

  it("refuses damaged KML whole, and anything that is not KML or GPX is not recognised", () => {
    expect(parseShapeFile(kml("<Placemark><Point><coordinates>1,2"))).toEqual({
      ok: false,
      refusal: "kml-unreadable",
    });
    expect(parseShapeFile("<kml><Placemark></kml>")).toEqual({
      ok: false,
      refusal: "kml-unreadable",
    });
    for (const text of [
      "<svg/>",
      "PK\u0003\u0004\u0014\u0000 doc.kml",
      "<!-- only a comment -->",
    ]) {
      expect(parseShapeFile(text), text).toEqual({
        ok: false,
        refusal: "not-recognised",
      });
    }
  });

  it("never expands an entity or follows a link", () => {
    const laughs = Array.from(
      { length: 9 },
      (_, level) => `<!ENTITY lol${level + 1} "${`&lol${level};`.repeat(10)}">`,
    ).join("");
    const started = performance.now();
    expect(
      parseShapeFile(
        `<!DOCTYPE kml [<!ENTITY lol "lol">${laughs}<!ENTITY ext SYSTEM "file:///etc/passwd">]>${kml(mark("<Point><coordinates>&ext;</coordinates></Point>"))}`,
      ),
    ).toEqual({ ok: false, refusal: "not-recognised" });
    expect(
      parseShapeFile(
        kml(mark("<Point><coordinates>&lol9;,&ext;</coordinates></Point>")),
      ),
    ).toMatchObject({ ok: true, shapes: [], skipped: { malformed: 1 } });
    expect(
      parseShapeFile(
        kml(
          "<NetworkLink><Link><href>http://169.254.169.254/latest</href></Link></NetworkLink><GroundOverlay><Icon><href>https://example.com/i.png</href></Icon></GroundOverlay>",
        ),
      ),
    ).toEqual({ ok: true, shapes: [], skipped: {}, holesDropped: 0 });
    expect(performance.now() - started).toBeLessThan(500);
  });
});
