// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatWkt, type WktAxisOrder } from "../geometry/wkt";
import { geoJsonGeometry } from "../propertyTesting/geoArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { finishShape, shapeInput } from "../propertyTesting/shapeArbitraries";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import { shapesToCsv, shapesToGeoJson, shapesToWkt } from "./export";
import {
  MAX_IMPORT_POINTS,
  MAX_IMPORT_SHAPES,
  parseShapeFile,
  type ShapeImport,
} from "./import";
import type { DrawShapeInput } from "./reducer";
import { validateShape } from "./shape";

const GEOJSON_FRAGMENTS = [
  "{",
  "}",
  "[",
  "]",
  ",",
  ":",
  '"type"',
  '"Feature"',
  '"FeatureCollection"',
  '"features"',
  '"geometry"',
  '"coordinates"',
  '"Point"',
  '"Polygon"',
  '"MultiPolygon"',
  '"GeometryCollection"',
  '"geometries"',
  '"properties"',
  '"circle"',
  '"radius_m"',
  '"centre"',
  '"__proto__"',
  "1e999",
  "-0",
  "null",
  "180.5",
  "1",
  '"1"',
];

const CSV_FRAGMENTS = [
  shapesToCsv([]),
  "\r\n",
  "\n",
  ",",
  '"',
  '""',
  "circle",
  "point",
  '"{""type"":""Point"",""coordinates"":[1,2]}"',
  "500",
  "NaN",
  "Infinity",
];

const WKT_FRAGMENTS = [
  "POINT",
  "LINESTRING",
  "POLYGON",
  "MULTIPOINT",
  "MULTIPOLYGON",
  "GEOMETRYCOLLECTION",
  "EMPTY",
  "Z",
  "M",
  "(",
  ")",
  ",",
  "\n",
  " ",
  "0 0",
  "1 1",
  "2 0",
  "1e999",
  "200 0",
  "-0",
  "NaN",
];

/** The shapes of an import, or none for a refusal. */
function shapesOf(result: ShapeImport): readonly DrawShapeInput[] {
  return result.ok ? result.shapes : [];
}

/** The geometry and circle fields of exported shapes: what an import must keep. */
function exportedShapes(inputs: readonly DrawShapeInput[]): unknown[] {
  return shapesToGeoJson(inputs.map(finishShape)).features.map(
    ({ geometry, properties }) => ({
      geometry,
      type: properties?.type,
      radius: properties?.radius_m,
      centre: properties?.centre,
    }),
  );
}

/** A shape set of the size an export holds in practice. */
const exportable = fc.array(shapeInput, { minLength: 1, maxLength: 8 });

/** Every imported shape obeys the draw rules and stays inside the world, and the caps hold. */
function expectWellFormed(result: ShapeImport): void {
  if (!result.ok) {
    return;
  }
  expect(result.shapes.length).toBeLessThanOrEqual(MAX_IMPORT_SHAPES);
  let points = 0;
  for (const [index, input] of result.shapes.entries()) {
    expect(validateShape(finishShape(input, index))).toBeNull();
    for (const { lat, lng } of input.vertices) {
      expect(Math.abs(lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(lng)).toBeLessThanOrEqual(180);
    }
    points += input.vertices.length;
  }
  expect(points).toBeLessThanOrEqual(MAX_IMPORT_POINTS);
}

describe("parseShapeFile round trips", () => {
  it("reads back the GeoJSON it exported, as the same shapes", () => {
    fc.assert(
      fc.property(exportable, (inputs) => {
        const text = JSON.stringify(shapesToGeoJson(inputs.map(finishShape)));
        expect(exportedShapes(shapesOf(parseShapeFile(text)))).toEqual(
          exportedShapes(inputs),
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads back the CSV it exported, as the same shapes", () => {
    fc.assert(
      fc.property(exportable, (inputs) => {
        const text = shapesToCsv(inputs.map(finishShape));
        expect(exportedShapes(shapesOf(parseShapeFile(text)))).toEqual(
          exportedShapes(inputs),
        );
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads any GeoJSON geometry without throwing, keeping only valid shapes", () => {
    fc.assert(
      fc.property(geoJsonGeometry, (geometry) => {
        const result = parseShapeFile(JSON.stringify(geometry));
        expect(result.ok).toBe(true);
        expectWellFormed(result);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("parseShapeFile with WKT", () => {
  // A circle comes back as its polygon outline, and a very small outline
  // rounded to six decimals can fold in on itself, so circles are left to
  // the example test in import.test.ts.
  it("reads back the WKT it exported, as the same geometries", () => {
    const withoutCircles = fc.array(
      shapeInput.filter((input) => input.kind !== "circle"),
      { minLength: 1, maxLength: 8 },
    );
    fc.assert(
      fc.property(withoutCircles, (inputs) => {
        const shapes = inputs.map(finishShape);
        const read = shapesOf(parseShapeFile(shapesToWkt(shapes)));
        expect(shapesToWkt(read.map(finishShape))).toBe(shapesToWkt(shapes));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads any WKT geometry, in either axis order, keeping only valid shapes", () => {
    fc.assert(
      fc.property(
        geoJsonGeometry,
        fc.constantFrom<WktAxisOrder>("lng-lat", "lat-lng"),
        (geometry, wktAxisOrder) => {
          const result = parseShapeFile(formatWkt(geometry), { wktAxisOrder });
          expect(result.ok).toBe(true);
          expectWellFormed(result);
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads text made of WKT's own parts without throwing", () => {
    fc.assert(
      fc.property(
        textFromFragments(WKT_FRAGMENTS),
        fc.constantFrom<WktAxisOrder>("lng-lat", "lat-lng"),
        (text, wktAxisOrder) => {
          expectWellFormed(parseShapeFile(text, { wktAxisOrder }));
          expectWellFormed(parseShapeFile(`wkt\r\n${text}`, { wktAxisOrder }));
          expectWellFormed(parseShapeFile(`id,WKT\r\n1,"${text}"`));
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses thousands of tiny shapes, valid or not", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_IMPORT_SHAPES + 1, max: 5_000 }),
        fc.boolean(),
        (count, valid) => {
          const point = valid ? "POINT (1 1)" : "POINT (999 1)";
          expect(parseShapeFile(Array(count).fill(point).join("\n"))).toEqual({
            ok: false,
            refusal: "too-many-shapes",
          });
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("parseShapeFile with hostile input", () => {
  it("reads any text without throwing", () => {
    fc.assert(
      fc.property(hostileText, (text) => {
        expectWellFormed(parseShapeFile(text));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads text made of GeoJSON's own parts without throwing", () => {
    fc.assert(
      fc.property(textFromFragments(GEOJSON_FRAGMENTS), (text) => {
        expectWellFormed(parseShapeFile(`{${text}`));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("reads text made of the CSV's own parts without throwing", () => {
    fc.assert(
      fc.property(textFromFragments(CSV_FRAGMENTS), (text) => {
        expectWellFormed(parseShapeFile(`${shapesToCsv([])}\r\n${text}`));
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses deep nesting of any length", () => {
    fc.assert(
      fc.property(repeatedFragment("["), (brackets) => {
        const result = parseShapeFile(
          `{"type":"Point","coordinates":${brackets}`,
        );
        expect(result.ok).toBe(false);
      }),
      PROPERTY_PARAMETERS,
    );
  });

  it("refuses thousands of tiny shapes, valid or not", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_IMPORT_SHAPES + 1, max: 5_000 }),
        fc.boolean(),
        (count, valid) => {
          const position = valid ? [1, 1] : [Number.NaN, 1];
          const text = JSON.stringify({
            type: "MultiPoint",
            coordinates: Array(count).fill(position),
          });
          expect(parseShapeFile(text)).toEqual({
            ok: false,
            refusal: "too-many-shapes",
          });
        },
      ),
      { numRuns: 20 },
    );
  });

  it("imports the valid shapes of a mixed file and counts the rest", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            shapeInput.map((input) => ({ valid: true, input })),
            fc
              .constantFrom<unknown>(
                [Number.NaN, 0],
                ["1", "2"],
                [181, 0],
                [0, -91],
                null,
                {},
                "1,2",
              )
              .map((coordinates) => ({ valid: false, coordinates })),
          ),
          { maxLength: 20 },
        ),
        (items) => {
          const features = items.map((item) =>
            item.valid
              ? shapesToGeoJson([finishShape(item.input, 0)]).features[0]
              : {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: item.coordinates },
                },
          );
          const result = parseShapeFile(
            JSON.stringify({ type: "FeatureCollection", features }),
          );
          const valid = items.filter((item) => item.valid).length;
          expect(result).toMatchObject({ ok: true });
          if (result.ok) {
            expect(result.shapes).toHaveLength(valid);
            const skipped = Object.values(result.skipped).reduce(
              (sum, count) => sum + (count ?? 0),
              0,
            );
            expect(skipped).toBe(items.length - valid);
          }
        },
      ),
      PROPERTY_PARAMETERS,
    );
  });

  it("treats __proto__ keys as data and leaves Object.prototype alone", () => {
    fc.assert(
      fc.property(textFromFragments(GEOJSON_FRAGMENTS), (text) => {
        parseShapeFile(`{"__proto__":{"polluted":1},${text}}`);
        expect(
          (Object.prototype as Record<string, unknown>).polluted,
        ).toBeUndefined();
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
