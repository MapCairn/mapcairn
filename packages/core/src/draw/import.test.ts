import { describe, expect, it } from "vitest";
import { shapesToCsv, shapesToGeoJson } from "./export";
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

describe("export then import", () => {
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
