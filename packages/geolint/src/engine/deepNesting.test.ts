// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type FixStats, fixBytes } from "./fix.js";
import { lintText } from "./lint.js";
import { loadCountries } from "./regions/index.js";
import { rules } from "./rules/index.js";

const DEPTH = 100_000;
const GEOMETRY_TYPES = [
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
] as const;

/** `depth` arrays inside each other, innermost first written as `inner`. */
function nestedArrays(depth: number, inner = ""): string {
  return `${"[".repeat(depth)}${inner}${"]".repeat(depth)}`;
}

/** `depth` objects inside each other through a member called `key`. */
function nestedObjects(depth: number, key: string, inner = "null"): string {
  return `${`{"${key}":`.repeat(depth)}${inner}${"}".repeat(depth)}`;
}

function featureText(geometry: string, extra = ""): string {
  return `{"type":"FeatureCollection","features":[{"type":"Feature","properties":null,"geometry":${geometry}${extra}}]}`;
}

function geometryText(type: string, coordinates: string): string {
  return `{"type":"${type}","coordinates":${coordinates}}`;
}

/** Documents that nest as deeply as a parser allows, in each place a rule reads. */
function deepDocuments(depth: number): readonly [string, string][] {
  return [
    ...GEOMETRY_TYPES.flatMap((type): [string, string][] => [
      [
        `${type} coordinates`,
        featureText(geometryText(type, nestedArrays(depth))),
      ],
      [
        `${type} coordinates around a position`,
        featureText(geometryText(type, nestedArrays(depth, "[1,2]"))),
      ],
    ]),
    [
      "GeometryCollection geometries",
      featureText(
        `${'{"type":"GeometryCollection","geometries":['.repeat(depth)}${"]}".repeat(depth)}`,
      ),
    ],
    [
      "properties",
      featureText("null", `,"properties2":${nestedArrays(depth)}`),
    ],
    [
      "properties object",
      `{"type":"FeatureCollection","features":[{"type":"Feature","properties":${nestedObjects(depth, "a")},"geometry":null}]}`,
    ],
    [
      "crs",
      featureText("null", `,"crs":${nestedObjects(depth, "properties")}`),
    ],
    ["bbox", featureText("null", `,"bbox":${nestedArrays(depth)}`)],
    ["id", featureText("null", `,"id":${nestedArrays(depth)}`)],
    [
      "root member",
      `{"type":"FeatureCollection","features":[],"extra":${nestedArrays(depth)}}`,
    ],
    [
      "root Feature coordinates",
      `{"type":"Feature","properties":null,"geometry":${geometryText("Polygon", nestedArrays(depth))}}`,
    ],
    ["bare geometry", geometryText("MultiPolygon", nestedArrays(depth))],
  ];
}

async function fixAll(text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text);
  const stats: FixStats = { features: 0, changed: 0 };
  const context = { regions: [], countries: undefined };
  const chunks = (async function* () {
    yield bytes;
  })();
  for await (const piece of fixBytes(chunks, context, rules, stats)) {
    void piece;
  }
}

describe("documents nested 100,000 levels deep", () => {
  it.each(deepDocuments(DEPTH))(
    "%s is linted without throwing",
    async (_name, text) => {
      for (const regions of [[], ["ZA"]]) {
        const report = await lintText(text, {
          regions,
          countries: loadCountries,
        });
        expect(Array.isArray(report.findings)).toBe(true);
      }
    },
  );

  it.each(deepDocuments(DEPTH))(
    "%s is fixed without a stack overflow",
    async (_name, text) => {
      await fixAll(text).catch((error: unknown) => {
        expect((error as Error).name).toBe("FixError");
      });
    },
  );

  it("holds for any depth from 1 to 100,000 in coordinates, found by property", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: DEPTH }),
        fc.constantFrom(...GEOMETRY_TYPES),
        async (depth, type) => {
          const report = await lintText(
            featureText(geometryText(type, nestedArrays(depth))),
          );
          expect(report.inputError).toBeUndefined();
        },
      ),
      { numRuns: 25 },
    );
  });
});
