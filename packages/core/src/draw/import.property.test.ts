// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import type { Geometry } from "geojson";
import { describe, expect, it } from "vitest";
import { formatWkt, type WktAxisOrder } from "../geometry/wkt";
import { decimalPlaces } from "../propertyTesting/decimalPlaces";
import {
  degreesOnGrid,
  geoJsonGeometry,
} from "../propertyTesting/geoArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import {
  finishShape,
  offGridSmallCircleInput,
  shapeInput,
  smallCircleInput,
} from "../propertyTesting/shapeArbitraries";
import {
  hostileText,
  repeatedFragment,
  textFromFragments,
} from "../propertyTesting/textArbitraries";
import {
  shapeGeometry,
  shapesToCsv,
  shapesToGeoJson,
  shapesToGeoJsonText,
  shapesToWkt,
} from "./export";
import {
  MAX_IMPORT_POINTS,
  MAX_IMPORT_SHAPES,
  parseShapeFile,
  type ShapeImport,
} from "./import";
import type { DrawShapeInput } from "./reducer";
import { MAX_CIRCLE_RADIUS_METRES, validateShape } from "./shape";
import type { DrawShape } from "./types";

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

/**
 * The time allowed to a property that exports circles on each of its generated
 * cases, and so checks the 72-position ring of each circle under 100 m for
 * crossing edges. The work is bounded (the runs and the shapes in each are
 * capped) but took up to about 1.6 s alone and 5 to 8 s when the whole suite
 * ran under coverage, which the 5 s default does not leave room for.
 */
const SLOW_PROPERTY_TIMEOUT_MS = 20_000;

/**
 * How far, in degrees, a circle's position may move when its outline is read
 * and written again: half a unit at six decimals, the most the second
 * rounding can move a position written to six or more, and a little for the
 * arithmetic.
 */
const ROUNDING_TOLERANCE = 5e-7 + 1e-12;

/** The numbers of a geometry's coordinates, in order. */
function coordinateNumbers(geometry: Geometry | undefined): number[] {
  if (geometry === undefined || geometry.type === "GeometryCollection") {
    return [];
  }
  return (geometry.coordinates as unknown[]).flat(
    Number.POSITIVE_INFINITY,
  ) as number[];
}

/** A shape set of the size an export holds in practice, with small circles among it. */
const exportable = fc.array(fc.oneof(shapeInput, smallCircleInput), {
  minLength: 1,
  maxLength: 8,
});

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
  it(
    "reads back the GeoJSON it exported, as the same shapes",
    () => {
      fc.assert(
        fc.property(exportable, (inputs) => {
          const text = JSON.stringify(shapesToGeoJson(inputs.map(finishShape)));
          expect(exportedShapes(shapesOf(parseShapeFile(text)))).toEqual(
            exportedShapes(inputs),
          );
        }),
        PROPERTY_PARAMETERS,
      );
    },
    SLOW_PROPERTY_TIMEOUT_MS,
  );

  it(
    "reads back the CSV it exported, as the same shapes",
    () => {
      fc.assert(
        fc.property(exportable, (inputs) => {
          const text = shapesToCsv(inputs.map(finishShape));
          expect(exportedShapes(shapesOf(parseShapeFile(text)))).toEqual(
            exportedShapes(inputs),
          );
        }),
        PROPERTY_PARAMETERS,
      );
    },
    SLOW_PROPERTY_TIMEOUT_MS,
  );

  it(
    "reads back a circle of a few centimetres off the grid with its centre and radius exactly, from GeoJSON and CSV, and writes no exponent",
    () => {
      fc.assert(
        fc.property(offGridSmallCircleInput, (input) => {
          const shapes = [finishShape(input, 0)];
          const texts = [
            shapesToGeoJsonText(shapes),
            shapesToCsv(shapes),
            shapesToWkt(shapes),
          ];
          for (const text of texts) {
            expect(text).not.toMatch(/\de[+-]?\d/);
          }
          for (const text of texts.slice(0, 2)) {
            expect(shapesOf(parseShapeFile(text))).toEqual([input]);
          }
        }),
        PROPERTY_PARAMETERS,
      );
    },
    SLOW_PROPERTY_TIMEOUT_MS,
  );

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

describe("shapeGeometry of a large circle", () => {
  // The export skips its check of the ring for a circle of 100 m or more, on
  // the grounds that rounding to six decimals cannot fold it in on itself.
  it("is a valid ring at six decimals from 100 m up, away from the poles and the antimeridian", () => {
    const large = fc.record({
      lat: degreesOnGrid(80),
      lng: degreesOnGrid(170),
      radius: fc.integer({ min: 100, max: MAX_CIRCLE_RADIUS_METRES / 100 }),
    });
    fc.assert(
      fc.property(large, ({ lat, lng, radius }) => {
        const geometry = shapeGeometry(
          finishShape(
            {
              kind: "circle",
              vertices: [{ lat, lng }],
              radiusMetres: radius,
            },
            0,
          ),
        ) as { coordinates: number[][][] };
        const ring = (geometry.coordinates[0] ?? []).slice(0, -1);
        for (const position of ring) {
          for (const number of position) {
            expect(decimalPlaces(number)).toBeLessThanOrEqual(6);
          }
        }
        expect(
          validateShape(
            finishShape(
              {
                kind: "polygon",
                vertices: ring.map(([lng, lat]) => ({
                  lat: lat as number,
                  lng: lng as number,
                })),
              },
              0,
            ),
          ),
        ).toBeNull();
      }),
      PROPERTY_PARAMETERS,
    );
  });
});

describe("parseShapeFile with WKT", () => {
  // Shapes other than circles come back as the same text. A circle comes back
  // as its polygon outline, which is written again with as few decimals as keep
  // it valid, so a position may differ by half a unit of the first rounding.
  // Only small circles are used: a large one can reach over a pole or the
  // antimeridian, where its outline is not a polygon of the plane and the
  // importer skips it.
  it(
    "reads back the WKT it exported, as the same geometries to a rounding",
    () => {
      const withSmallCircles = fc.array(
        fc.oneof(
          shapeInput.filter((input) => input.kind !== "circle"),
          smallCircleInput,
        ),
        { minLength: 1, maxLength: 4 },
      );
      fc.assert(
        fc.property(withSmallCircles, (inputs) => {
          const shapes = inputs.map(finishShape);
          const read = shapesOf(parseShapeFile(shapesToWkt(shapes)));
          expect(read).toHaveLength(shapes.length);
          const readShapes = read.map(finishShape);
          for (const [index, shape] of shapes.entries()) {
            const readShape = readShapes[index] as DrawShape;
            if (shape.kind !== "circle") {
              expect(shapesToWkt([readShape])).toBe(shapesToWkt([shape]));
              continue;
            }
            expect(readShape.kind).toBe("polygon");
            const before = coordinateNumbers(shapeGeometry(shape) ?? undefined);
            const after = coordinateNumbers(
              shapeGeometry(readShape) ?? undefined,
            );
            expect(after).toHaveLength(before.length);
            for (const [place, number] of before.entries()) {
              expect(
                Math.abs((after[place] as number) - number),
              ).toBeLessThanOrEqual(ROUNDING_TOLERANCE);
            }
          }
        }),
        PROPERTY_PARAMETERS,
      );
    },
    SLOW_PROPERTY_TIMEOUT_MS,
  );

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
