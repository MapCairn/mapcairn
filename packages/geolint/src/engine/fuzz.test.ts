// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type FixStats, fixBytes } from "./fix.js";
import {
  compareFindings,
  type LintReport,
  lintBytes,
  lintText,
} from "./lint.js";
import { loadCountries } from "./regions/index.js";
import { rules } from "./rules/index.js";
import type { Finding, RuleContext } from "./types.js";

const REGION_SETS: readonly (readonly string[])[] = [[], ["ZA"], ["FR", "NA"]];

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const GEOMETRY_TYPES = [
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
] as const;
type GeometryType = (typeof GEOMETRY_TYPES)[number];

/** Numbers that are in range, out of range, huge, tiny, infinite (which JSON writes as null) or NaN (likewise). */
const looseNumber: fc.Arbitrary<number> = fc.oneof(
  { weight: 8, arbitrary: fc.double({ min: -200, max: 200, noNaN: true }) },
  { weight: 3, arbitrary: fc.integer({ min: -400, max: 400 }) },
  { weight: 1, arbitrary: fc.double() },
  { weight: 1, arbitrary: fc.double({ min: -1e7, max: 1e7, noNaN: true }) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      1e300,
      -1e300,
      1e-300,
      5e-324,
      -0,
      0,
      180,
      -180,
      90,
      -90,
      360,
      Number.POSITIVE_INFINITY,
    ),
  },
);

/** Anything that is not a number, to put where a number belongs. */
const notANumber: fc.Arbitrary<unknown> = fc.constantFrom(
  null,
  "12",
  true,
  [],
  {},
  [1, 2],
);

const looseElement: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 14, arbitrary: looseNumber },
  { weight: 1, arbitrary: notANumber },
);

/** A position: usually two or three numbers, sometimes odd. */
const position: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 10, arbitrary: fc.tuple(looseNumber, looseNumber) },
  {
    weight: 3,
    arbitrary: fc.tuple(
      fc.double({ min: -180, max: 180, noNaN: true }),
      fc.double({ min: -90, max: 90, noNaN: true }),
      fc.double({ min: -500, max: 9000, noNaN: true }),
    ),
  },
  {
    weight: 4,
    arbitrary: fc.tuple(
      fc.integer({ min: -3, max: 3 }),
      fc.integer({ min: -3, max: 3 }),
    ),
  },
  { weight: 1, arbitrary: fc.array(looseElement, { maxLength: 4 }) },
);

const GRID = fc.tuple(
  fc.integer({ min: 0, max: 4 }),
  fc.integer({ min: 0, max: 4 }),
);

/** Positions on a small grid, so that touching, repeating and overlapping happen often. */
const gridPosition: fc.Arbitrary<unknown> = GRID;

const closeRing = (positions: unknown[]): unknown[] =>
  positions.length > 0 ? [...positions, positions[0]] : positions;

const run: fc.Arbitrary<unknown[]> = fc.oneof(
  fc.array(position, { maxLength: 8 }),
  fc.array(gridPosition, { maxLength: 8 }),
);
const anyRing: fc.Arbitrary<unknown[]> = fc.oneof(
  run,
  fc.array(gridPosition, { minLength: 3, maxLength: 7 }).map(closeRing),
);
const polygonCoordinates = fc.array(anyRing, { maxLength: 3 });

function coordinatesFor(type: GeometryType): fc.Arbitrary<unknown> {
  switch (type) {
    case "Point":
      return position;
    case "MultiPoint":
    case "LineString":
      return run;
    case "MultiLineString":
      return fc.array(run, { maxLength: 3 });
    case "Polygon":
      return polygonCoordinates;
    case "MultiPolygon":
      return fc.array(polygonCoordinates, { maxLength: 3 });
  }
}

/** Arbitrarily nested arrays of numbers, for coordinates of no particular shape. */
const coordinateTree: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  node: fc.oneof(
    { maxDepth: 4, depthSize: "small" },
    looseElement,
    fc.array(tie("node"), { maxLength: 4 }),
  ),
})).node;

const wellShapedLeaf: fc.Arbitrary<unknown> = fc.oneof(
  ...GEOMETRY_TYPES.map((type) =>
    fc.record(
      {
        type: fc.constant(type),
        coordinates: coordinatesFor(type),
        bbox: fc.array(looseNumber, { minLength: 4, maxLength: 6 }),
      },
      { requiredKeys: ["type", "coordinates"] },
    ),
  ),
);

const oddLeaf: fc.Arbitrary<unknown> = fc.record(
  {
    type: fc.oneof(
      fc.constantFrom(...GEOMETRY_TYPES),
      fc.constantFrom("Feature", "FeatureCollection", "GeometryCollection", ""),
      fc.string({ maxLength: 8 }),
      notANumber,
    ),
    coordinates: fc.oneof(coordinateTree, position, run),
    geometries: fc.array(coordinateTree, { maxLength: 2 }),
    bbox: fc.oneof(fc.array(looseElement, { maxLength: 7 }), notANumber),
  },
  { requiredKeys: [] },
);

const geometry: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  geometry: fc.oneof(
    { maxDepth: 3, depthSize: "small" },
    { weight: 8, arbitrary: wellShapedLeaf },
    { weight: 2, arbitrary: oddLeaf },
    {
      weight: 3,
      arbitrary: fc.record(
        {
          type: fc.constant("GeometryCollection"),
          geometries: fc.array(tie("geometry"), { maxLength: 3 }),
        },
        { requiredKeys: ["type", "geometries"] },
      ),
    },
  ),
})).geometry;

const properties: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null) },
  { weight: 3, arbitrary: fc.constant({}) },
  {
    weight: 2,
    arbitrary: fc.dictionary(fc.string({ maxLength: 6 }), fc.jsonValue(), {
      maxKeys: 4,
    }),
  },
  { weight: 1, arbitrary: notANumber },
);

const crsMember: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.record({
    type: fc.constant("name"),
    properties: fc.record({
      name: fc.constantFrom(
        "EPSG:4326",
        "EPSG:3857",
        "urn:ogc:def:crs:OGC:1.3:CRS84",
      ),
    }),
  }),
  fc.jsonValue({ maxDepth: 2 }),
);

const featureValue: fc.Arbitrary<unknown> = fc.record(
  {
    type: fc.oneof(
      { weight: 12, arbitrary: fc.constant("Feature") },
      { weight: 1, arbitrary: fc.string({ maxLength: 8 }) },
    ),
    properties,
    geometry: fc.oneof(
      { weight: 10, arbitrary: geometry },
      { weight: 1, arbitrary: fc.constant(null) },
      { weight: 1, arbitrary: fc.jsonValue({ maxDepth: 2 }) },
    ),
    id: fc.oneof(fc.string({ maxLength: 4 }), fc.integer(), notANumber),
    bbox: fc.oneof(
      fc.array(looseNumber, { minLength: 4, maxLength: 4 }),
      notANumber,
    ),
    crs: crsMember,
  },
  { requiredKeys: ["type", "properties", "geometry"] },
);

const featureCollection: fc.Arbitrary<unknown> = fc.record(
  {
    type: fc.constant("FeatureCollection"),
    features: fc.oneof(
      { weight: 12, arbitrary: fc.array(featureValue, { maxLength: 5 }) },
      { weight: 1, arbitrary: fc.jsonValue({ maxDepth: 2 }) },
    ),
    crs: crsMember,
    bbox: fc.array(looseNumber, { minLength: 4, maxLength: 4 }),
  },
  { requiredKeys: ["type", "features"] },
);

/** A GeoJSON-shaped value: a collection, a feature, a bare geometry, or any JSON at all. */
const geoJsonShaped: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 8, arbitrary: featureCollection },
  { weight: 3, arbitrary: featureValue },
  { weight: 2, arbitrary: geometry },
  { weight: 1, arbitrary: fc.jsonValue() },
);

const textOf = (value: unknown): string => JSON.stringify(value) ?? "null";

const encoder = new TextEncoder();

async function* chunksOf(
  bytes: Uint8Array,
  cuts: readonly number[],
): AsyncGenerator<Uint8Array> {
  const points = [...new Set([0, ...cuts, bytes.length])]
    .filter((cut) => cut >= 0 && cut <= bytes.length)
    .sort((a, b) => a - b);
  for (let index = 1; index < points.length; index++) {
    yield bytes.slice(points[index - 1], points[index]);
  }
}

function bytesAsChunks(
  bytes: Uint8Array,
  cuts: readonly number[] = [],
): AsyncIterable<Uint8Array> {
  return chunksOf(bytes, cuts);
}

const REGIONS = fc.constantFrom(...REGION_SETS);

function lintWith(
  text: string,
  regions: readonly string[],
): Promise<LintReport> {
  return lintText(text, { regions, countries: loadCountries });
}

function lintBytesWith(
  chunks: AsyncIterable<Uint8Array>,
  regions: readonly string[],
): Promise<LintReport> {
  return lintBytes(chunks, { regions, countries: loadCountries });
}

/** Resolves a JSON pointer against a value; `undefined` for a pointer that leads nowhere. */
function resolve(
  root: unknown,
  pointer: string,
): { found: true; value: unknown } | { found: false } {
  let current: unknown = root;
  if (pointer === "") {
    return { found: true, value: current };
  }
  for (const encoded of pointer.slice(1).split("/")) {
    const token = encoded.replaceAll("~1", "/").replaceAll("~0", "~");
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.hasOwn(current, token)
    ) {
      return { found: false };
    }
    current = (current as Record<string, unknown>)[token];
  }
  return { found: true, value: current };
}

const parentOf = (pointer: string): string =>
  pointer.slice(0, pointer.lastIndexOf("/"));

/** Members RFC 7946 requires, that structure may point at although they are not in the document. */
const MEMBERS_THAT_MAY_BE_MISSING: ReadonlySet<string> = new Set([
  "coordinates",
  "geometries",
  "type",
]);

const DOCUMENT_POINTERS: ReadonlySet<string> = new Set([
  "",
  "/features",
  "/crs",
]);

/**
 * How many cases each property tries. Set GEOLINT_FUZZ_SCALE (a number, such as
 * 50) to run many more when hunting for a defect; the default keeps the file
 * fast enough for every run.
 */
const SCALE = Number(process.env.GEOLINT_FUZZ_SCALE ?? 1);
const runs = (count: number) => ({ numRuns: Math.ceil(count * SCALE) });
const RUNS = runs(120);

// ---------------------------------------------------------------------------
// (a) Any JSON value
// ---------------------------------------------------------------------------

describe("lintText on any JSON value", () => {
  it("never throws and never reports an input error, with and without regions", async () => {
    await fc.assert(
      fc.asyncProperty(geoJsonShaped, REGIONS, async (value, regions) => {
        const report = await lintWith(textOf(value), regions);
        expect(report.inputError).toBeUndefined();
        expect(Number.isInteger(report.featureCount)).toBe(true);
      }),
      RUNS,
    );
  });

  it("never throws on JSON of no particular shape", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), REGIONS, async (value, regions) => {
        const report = await lintWith(textOf(value), regions);
        expect(report.inputError).toBeUndefined();
      }),
      RUNS,
    );
  });

  it("never throws on a Feature whose geometry is any nesting of arrays", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...GEOMETRY_TYPES),
        coordinateTree,
        REGIONS,
        async (type, coordinates, regions) => {
          const report = await lintWith(
            textOf({
              type: "Feature",
              properties: null,
              geometry: { type, coordinates },
            }),
            regions,
          );
          expect(report.inputError).toBeUndefined();
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// (b) Bytes
// ---------------------------------------------------------------------------

/** What a report must look like whatever the input, valid or not. */
function expectWellFormed(report: LintReport, length: number): void {
  expect(Array.isArray(report.findings)).toBe(true);
  expect(Number.isInteger(report.featureCount)).toBe(true);
  expect(report.featureCount).toBeGreaterThanOrEqual(0);
  if (report.inputError !== undefined) {
    expect(typeof report.inputError.message).toBe("string");
    expect(report.inputError.message).not.toBe("");
    expect(report.inputError.offset).toBeGreaterThanOrEqual(0);
    expect(report.inputError.offset).toBeLessThanOrEqual(length);
  }
}

const JSON_ALPHABET = [
  ...'{}[]",:0123456789.-+eE tfnul\\/\n:"type"Feature',
].map((character) => character.charCodeAt(0));

const SMALL_DOCUMENTS: readonly string[] = [
  textOf({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "café 日本 😀" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [18, -33],
              [18, -34],
              [19, -34],
              [18, -33],
            ],
          ],
        },
      },
      { type: "Feature", properties: null, geometry: null },
    ],
    crs: null,
  }),
  textOf({
    type: "Feature",
    properties: { n: "é" },
    geometry: { type: "Point", coordinates: [18.4, -33.9] },
  }),
  textOf({
    type: "LineString",
    coordinates: [
      [1, 2],
      [3, 4e-7],
      [5, 6],
    ],
  }),
];

describe("lintBytes on bytes", () => {
  it("never throws on arbitrary bytes, and ends in a well-formed report", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ maxLength: 120 }),
        REGIONS,
        async (bytes, regions) => {
          expectWellFormed(
            await lintBytesWith(bytesAsChunks(bytes), regions),
            bytes.length,
          );
        },
      ),
      RUNS,
    );
  });

  it("never throws on bytes that are mostly JSON punctuation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...JSON_ALPHABET), { maxLength: 160 }),
        REGIONS,
        async (codes, regions) => {
          const bytes = Uint8Array.from(codes);
          expectWellFormed(
            await lintBytesWith(bytesAsChunks(bytes), regions),
            bytes.length,
          );
        },
      ),
      runs(200),
    );
  });

  it.each(SMALL_DOCUMENTS.map((text, index) => [index, text] as const))(
    "document %i truncated at every byte offset is an input error, and whole it is clean of one",
    async (_index, text) => {
      const bytes = encoder.encode(text);
      for (let length = 0; length < bytes.length; length++) {
        const report = await lintBytesWith(
          bytesAsChunks(bytes.slice(0, length)),
          REGION_SETS[1] as readonly string[],
        );
        expectWellFormed(report, length);
        expect(report.inputError, `at ${length} bytes`).toBeDefined();
      }
      const whole = await lintBytesWith(
        bytesAsChunks(bytes),
        REGION_SETS[1] as readonly string[],
      );
      expect(whole.inputError).toBeUndefined();
    },
  );

  it("never throws on a valid document with one byte changed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SMALL_DOCUMENTS),
        fc.nat(),
        fc.integer({ min: 0, max: 255 }),
        REGIONS,
        async (text, where, value, regions) => {
          const bytes = encoder.encode(text);
          bytes[where % bytes.length] = value;
          expectWellFormed(
            await lintBytesWith(bytesAsChunks(bytes), regions),
            bytes.length,
          );
        },
      ),
      runs(250),
    );
  });

  it("never throws on a valid document with a run of bytes removed or doubled", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SMALL_DOCUMENTS),
        fc.nat(),
        fc.nat(20),
        fc.boolean(),
        async (text, where, count, double) => {
          const bytes = encoder.encode(text);
          const start = where % bytes.length;
          const changed = double
            ? Uint8Array.from([
                ...bytes.slice(0, start + count),
                ...bytes.slice(start),
              ])
            : Uint8Array.from([
                ...bytes.slice(0, start),
                ...bytes.slice(start + count),
              ]);
          expectWellFormed(
            await lintBytesWith(bytesAsChunks(changed), []),
            changed.length,
          );
        },
      ),
      runs(150),
    );
  });
});

// ---------------------------------------------------------------------------
// (c) Chunking
// ---------------------------------------------------------------------------

describe("the report does not depend on how the bytes are chunked", () => {
  it("is identical for any split of a document, with a region", async () => {
    await fc.assert(
      fc.asyncProperty(
        geoJsonShaped,
        fc.array(fc.nat(2000), { maxLength: 12 }),
        REGIONS,
        async (value, cuts, regions) => {
          const bytes = encoder.encode(textOf(value));
          const whole = await lintBytesWith(bytesAsChunks(bytes), regions);
          const split = await lintBytesWith(
            bytesAsChunks(bytes, cuts),
            regions,
          );
          expect(split).toEqual(whole);
        },
      ),
      RUNS,
    );
  });

  it("is identical when the bytes are damaged, and an input error has the same offset", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...SMALL_DOCUMENTS),
        fc.nat(),
        fc.integer({ min: 0, max: 255 }),
        fc.array(fc.nat(400), { maxLength: 10 }),
        async (text, where, value, cuts) => {
          const bytes = encoder.encode(text);
          bytes[where % bytes.length] = value;
          const whole = await lintBytesWith(bytesAsChunks(bytes), ["ZA"]);
          const split = await lintBytesWith(bytesAsChunks(bytes, cuts), ["ZA"]);
          expect(split).toEqual(whole);
        },
      ),
      runs(200),
    );
  });

  it("is identical when every byte is its own chunk", async () => {
    for (const text of SMALL_DOCUMENTS) {
      const bytes = encoder.encode(text);
      const every = Array.from({ length: bytes.length }, (_, index) => index);
      expect(await lintBytesWith(bytesAsChunks(bytes, every), ["ZA"])).toEqual(
        await lintBytesWith(bytesAsChunks(bytes), ["ZA"]),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// (d) Fixing
// ---------------------------------------------------------------------------

const NO_REGION: RuleContext = { regions: [], countries: undefined };

async function fixed(
  text: string,
): Promise<{ output: string; stats: FixStats }> {
  const stats: FixStats = { features: 0, changed: 0 };
  let output = "";
  for await (const piece of fixBytes(
    bytesAsChunks(encoder.encode(text)),
    NO_REGION,
    rules,
    stats,
  )) {
    output += piece;
  }
  return { output, stats };
}

async function fixedChunked(
  text: string,
  cuts: readonly number[],
): Promise<{ output: string; stats: FixStats }> {
  const stats: FixStats = { features: 0, changed: 0 };
  let output = "";
  for await (const piece of fixBytes(
    bytesAsChunks(encoder.encode(text), cuts),
    NO_REGION,
    rules,
    stats,
  )) {
    output += piece;
  }
  return { output, stats };
}

/** A coordinate on a small grid, plus noise of up to 12 decimal places. */
const noisyCoordinate: fc.Arbitrary<number> = fc
  .tuple(
    fc.integer({ min: 0, max: 4 }),
    fc.double({ min: 0, max: 1, noNaN: true }),
  )
  .map(([whole, noise]) => whole + noise / 1e5);

const coordinateValue: fc.Arbitrary<number> = fc.oneof(
  fc.integer({ min: 0, max: 4 }),
  noisyCoordinate,
  fc.double({ min: -170, max: 170, noNaN: true }),
  fc.constant(1.23456789),
  fc.constant(-0),
);

const fixablePosition: fc.Arbitrary<number[]> = fc.oneof(
  fc.tuple(coordinateValue, coordinateValue).map((pair) => [...pair]),
  fc
    .tuple(
      coordinateValue,
      coordinateValue,
      fc.double({ min: -100, max: 9000, noNaN: true }),
    )
    .map((triple) => [...triple]),
);

/** A ring that may be open, wound either way, with repeated vertices and long decimals. */
const fixableRing: fc.Arbitrary<number[][]> = fc
  .tuple(
    fc.array(fixablePosition, { minLength: 3, maxLength: 8 }),
    fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 8, maxLength: 8 }),
    fc.boolean(),
    fc.boolean(),
  )
  .map(([positions, repeats, closed, reversed]) => {
    const repeated = positions.flatMap((one, index) =>
      Array.from({ length: repeats[index] ?? 1 }, () => [...one]),
    );
    const built = closed
      ? [...repeated, [...(repeated[0] as number[])]]
      : repeated;
    return reversed ? built.reverse() : built;
  });

const fixableGeometry: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({
    type: fc.constant("Polygon"),
    coordinates: fc.array(fixableRing, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    type: fc.constant("MultiPolygon"),
    coordinates: fc.array(
      fc.array(fixableRing, { minLength: 1, maxLength: 2 }),
      {
        minLength: 1,
        maxLength: 2,
      },
    ),
  }),
  fc.record({
    type: fc.constant("LineString"),
    coordinates: fc.array(fixablePosition, { minLength: 2, maxLength: 6 }),
  }),
  fc.record({
    type: fc.constant("Point"),
    coordinates: fixablePosition,
  }),
  fc.record({
    type: fc.constant("GeometryCollection"),
    geometries: fc.array(
      fc.record({
        type: fc.constant("Polygon"),
        coordinates: fc.array(fixableRing, { minLength: 1, maxLength: 2 }),
      }),
      { maxLength: 2 },
    ),
  }),
);

const fixableCollection: fc.Arbitrary<unknown> = fc.record({
  type: fc.constant("FeatureCollection"),
  features: fc.array(
    fc.record({
      type: fc.constant("Feature"),
      properties: fc.constant({}),
      geometry: fixableGeometry,
    }),
    { minLength: 1, maxLength: 4 },
  ),
});

describe("fixing then linting again", () => {
  it("leaves no finding that is marked fixable, and what comes out is valid JSON", async () => {
    await fc.assert(
      fc.asyncProperty(fixableCollection, async (value) => {
        const result = await fixed(textOf(value));
        const after = await lintWith(result.output, []);
        expect(after.inputError).toBeUndefined();
        expect(after.featureCount).toBe(result.stats.features);
        expect(after.findings.filter((finding) => finding.fixable)).toEqual([]);
      }),
      RUNS,
    );
  });

  it("is idempotent: fixing the output changes nothing and writes the same text", async () => {
    await fc.assert(
      fc.asyncProperty(fixableCollection, async (value) => {
        const first = await fixed(textOf(value));
        const second = await fixed(first.output);
        expect(second.stats.changed).toBe(0);
        expect(second.output).toBe(first.output);
      }),
      RUNS,
    );
  });

  it("writes the same text however the bytes arrive", async () => {
    await fc.assert(
      fc.asyncProperty(
        fixableCollection,
        fc.array(fc.nat(3000), { maxLength: 12 }),
        async (value, cuts) => {
          const text = textOf(value);
          const whole = await fixed(text);
          const split = await fixedChunked(text, cuts);
          expect(split.output).toBe(whole.output);
          expect(split.stats).toEqual(whole.stats);
        },
      ),
      RUNS,
    );
  });

  it("does not change a document of any shape into invalid JSON, or throw", async () => {
    await fc.assert(
      fc.asyncProperty(geoJsonShaped, async (value) => {
        const text = textOf(value);
        const result = await fixed(text).catch((error: unknown) => error);
        if (result instanceof Error) {
          // A root that is not an object is refused with a FixError; nothing else may throw.
          expect(result.name).toBe("FixError");
          return;
        }
        const { output } = result as { output: string };
        expect(() => JSON.parse(output)).not.toThrow();
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// (e) Order and determinism, (f) ignoring
// ---------------------------------------------------------------------------

describe("the findings", () => {
  it("are sorted by compareFindings, and the same on a second run", async () => {
    await fc.assert(
      fc.asyncProperty(geoJsonShaped, REGIONS, async (value, regions) => {
        const text = textOf(value);
        const first = await lintWith(text, regions);
        const second = await lintWith(text, regions);
        expect(second).toEqual(first);
        for (let index = 1; index < first.findings.length; index++) {
          const left = first.findings[index - 1] as Finding;
          const right = first.findings[index] as Finding;
          expect(compareFindings(left, right)).toBeLessThanOrEqual(0);
        }
      }),
      RUNS,
    );
  });

  it("are empty when every rule is ignored", async () => {
    await fc.assert(
      fc.asyncProperty(geoJsonShaped, REGIONS, async (value, regions) => {
        const report = await lintText(textOf(value), {
          regions,
          countries: loadCountries,
          ignore: rules.map((rule) => rule.id),
        });
        expect(report.findings).toEqual([]);
        expect(report.inputError).toBeUndefined();
      }),
      RUNS,
    );
  });

  it("lose exactly the findings of a rule that is ignored, and no others", async () => {
    await fc.assert(
      fc.asyncProperty(
        geoJsonShaped,
        fc.constantFrom(...rules.map((rule) => rule.id)),
        REGIONS,
        async (value, ruleId, regions) => {
          const text = textOf(value);
          const all = await lintWith(text, regions);
          const without = await lintText(text, {
            regions,
            countries: loadCountries,
            ignore: [ruleId],
          });
          expect(without.findings).toEqual(
            all.findings.filter((finding) => finding.ruleId !== ruleId),
          );
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// (g) Pointers
// ---------------------------------------------------------------------------

describe("every finding's pointer", () => {
  it("resolves in the document, apart from the document-level members a rule reports as missing", async () => {
    await fc.assert(
      fc.asyncProperty(geoJsonShaped, REGIONS, async (value, regions) => {
        const text = textOf(value);
        const document: unknown = JSON.parse(text);
        const report = await lintWith(text, regions);
        for (const finding of report.findings) {
          if (DOCUMENT_POINTERS.has(finding.path)) {
            continue;
          }
          const where = resolve(document, finding.path);
          if (finding.ruleId === "structure" && !where.found) {
            // Deviation from "every pointer resolves": structure reports a
            // missing member of a geometry or feature at the place it should
            // be, so the parent has to exist and the member has to be one that
            // RFC 7946 requires.
            const token = finding.path.slice(finding.path.lastIndexOf("/") + 1);
            expect(
              resolve(document, parentOf(finding.path)).found,
              `${finding.ruleId} ${finding.path}: ${finding.message}`,
            ).toBe(true);
            expect(
              MEMBERS_THAT_MAY_BE_MISSING.has(token),
              `${finding.ruleId} ${finding.path}: ${finding.message}`,
            ).toBe(true);
            continue;
          }
          expect(
            where.found,
            `${finding.ruleId} ${finding.path}: ${finding.message}`,
          ).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("for a rule that names a position leads to an array: the position, or the coordinates of a Point", async () => {
    const positionRules = new Set([
      "null-island",
      "antimeridian",
      "projected-coords",
      "coordinate-order",
    ]);
    await fc.assert(
      fc.asyncProperty(geoJsonShaped, REGIONS, async (value, regions) => {
        const text = textOf(value);
        const document: unknown = JSON.parse(text);
        const report = await lintWith(text, regions);
        for (const finding of report.findings) {
          if (!positionRules.has(finding.ruleId)) {
            continue;
          }
          const where = resolve(document, finding.path);
          expect(where.found, `${finding.ruleId} ${finding.path}`).toBe(true);
          const target = (where as { value: unknown }).value;
          expect(
            Array.isArray(target),
            `${finding.ruleId} ${finding.path}`,
          ).toBe(true);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Against an independent oracle, on integer inputs where the answer is exact
// ---------------------------------------------------------------------------

type Point = readonly [number, number];

const cross = (origin: Point, a: Point, b: Point): number =>
  (a[0] - origin[0]) * (b[1] - origin[1]) -
  (a[1] - origin[1]) * (b[0] - origin[0]);

/** Whether two segments cross at a point that is inside both of them and an end of neither. */
function crossesProperly(a: Point, b: Point, c: Point, d: Point): boolean {
  const first = Math.sign(cross(a, b, c)) * Math.sign(cross(a, b, d));
  const second = Math.sign(cross(c, d, a)) * Math.sign(cross(c, d, b));
  return first < 0 && second < 0;
}

function ringCrossesItself(vertices: readonly Point[]): boolean {
  const count = vertices.length;
  for (let first = 0; first < count; first++) {
    for (let second = first + 1; second < count; second++) {
      const adjacent =
        second === first + 1 || (first === 0 && second === count - 1);
      if (
        !adjacent &&
        crossesProperly(
          vertices[first] as Point,
          vertices[(first + 1) % count] as Point,
          vertices[second] as Point,
          vertices[(second + 1) % count] as Point,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

const closedRing = (vertices: readonly Point[]): number[][] =>
  [...vertices, vertices[0] as Point].map((point) => [...point]);

const smallPoint: fc.Arbitrary<Point> = fc.tuple(
  fc.integer({ min: -5, max: 5 }),
  fc.integer({ min: -5, max: 5 }),
);

const gridVertices: fc.Arbitrary<Point[]> = fc.uniqueArray(
  fc.tuple(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 4 })),
  { minLength: 3, maxLength: 7, selector: ([x, y]) => x * 10 + y },
);

function polygonDocument(...rings: number[][][]): string {
  return textOf({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: rings },
      },
    ],
  });
}

const findingsOf = (report: LintReport, ruleId: string): Finding[] =>
  report.findings.filter((finding) => finding.ruleId === ruleId);

describe("rules against an independent oracle", () => {
  it("winding-order agrees with the sign of the cross product for any triangle", async () => {
    await fc.assert(
      fc.asyncProperty(smallPoint, smallPoint, smallPoint, async (a, b, c) => {
        const report = await lintWith(
          polygonDocument(closedRing([a, b, c])),
          [],
        );
        expect(findingsOf(report, "winding-order").length > 0).toBe(
          cross(a, b, c) < 0,
        );
      }),
      runs(300),
    );
  });

  it("winding-order wants a hole clockwise: it reports a hole exactly when its cross product is positive", async () => {
    const exterior: Point[] = [
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
    ];
    await fc.assert(
      fc.asyncProperty(smallPoint, smallPoint, smallPoint, async (a, b, c) => {
        const report = await lintWith(
          polygonDocument(closedRing(exterior), closedRing([a, b, c])),
          [],
        );
        const windings = findingsOf(report, "winding-order");
        expect(
          windings.some((finding) => finding.path.endsWith("/coordinates/1")),
        ).toBe(cross(a, b, c) > 0);
        expect(
          windings.some((finding) => finding.path.endsWith("/coordinates/0")),
        ).toBe(false);
      }),
      runs(300),
    );
  });

  it("self-intersection reports an error exactly when two edges cross properly", async () => {
    await fc.assert(
      fc.asyncProperty(gridVertices, async (vertices) => {
        const report = await lintWith(
          polygonDocument(closedRing(vertices)),
          [],
        );
        const errors = findingsOf(report, "self-intersection").filter(
          (finding) => finding.severity === "error",
        );
        expect(
          errors.length > 0,
          `${JSON.stringify(vertices)} ${JSON.stringify(report.findings.map((finding) => finding.message))}`,
        ).toBe(ringCrossesItself(vertices));
      }),
      runs(500),
    );
  });

  it("self-intersection says nothing about a rectangle, in either direction", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: 1, max: 9 }),
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
        fc.boolean(),
        async (width, height, left, bottom, reversed) => {
          const corners: Point[] = [
            [left, bottom],
            [left + width, bottom],
            [left + width, bottom + height],
            [left, bottom + height],
          ];
          const vertices = reversed ? corners.reverse() : corners;
          const report = await lintWith(
            polygonDocument(closedRing(vertices)),
            [],
          );
          expect(findingsOf(report, "self-intersection")).toEqual([]);
        },
      ),
      runs(200),
    );
  });

  it("unclosed-ring reports a ring exactly when its first and last positions differ", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(smallPoint, { minLength: 3, maxLength: 7 }),
        async (points) => {
          const report = await lintWith(
            polygonDocument(points.map((point) => [...point])),
            [],
          );
          const first = points[0] as Point;
          const last = points[points.length - 1] as Point;
          const open = first[0] !== last[0] || first[1] !== last[1];
          expect(findingsOf(report, "unclosed-ring").length > 0).toBe(open);
        },
      ),
      runs(300),
    );
  });

  it("duplicate-vertices reports a line exactly when two neighbours are equal", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(smallPoint, { minLength: 2, maxLength: 8 }),
        async (points) => {
          const report = await lintWith(
            textOf({
              type: "LineString",
              coordinates: points.map((point) => [...point]),
            }),
            [],
          );
          const hasRepeat = points.some((point, index) => {
            const before = points[index - 1];
            return (
              before !== undefined &&
              point[0] === before[0] &&
              point[1] === before[1]
            );
          });
          expect(findingsOf(report, "duplicate-vertices").length > 0).toBe(
            hasRepeat,
          );
        },
      ),
      runs(300),
    );
  });

  it("null-island reports a position exactly when it is 0, 0", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(smallPoint, { minLength: 1, maxLength: 6 }),
        async (points) => {
          const report = await lintWith(
            textOf({
              type: "MultiPoint",
              coordinates: points.map((point) => [...point]),
            }),
            [],
          );
          const atOrigin = points.some(
            (point) => point[0] === 0 && point[1] === 0,
          );
          expect(findingsOf(report, "null-island").length > 0).toBe(atOrigin);
        },
      ),
      runs(300),
    );
  });
});

describe("a position in range", () => {
  const inRange: fc.Arbitrary<number[]> = fc
    .tuple(
      fc.double({ min: -180, max: 180, noNaN: true }),
      fc.double({ min: -90, max: 90, noNaN: true }),
    )
    .map(([longitude, latitude]) => [
      Number(longitude.toFixed(5)),
      Number(latitude.toFixed(5)),
    ]);

  it("gets no finding about structure, projection, the antimeridian or order, without a region", async () => {
    await fc.assert(
      fc.asyncProperty(inRange, async (coordinates) => {
        const report = await lintWith(
          textOf({ type: "Point", coordinates }),
          [],
        );
        expect(
          report.findings.filter((finding) => finding.ruleId !== "null-island"),
        ).toEqual([]);
      }),
      runs(400),
    );
  });

  it("is never called projected, whichever way round it is written, while the second number could be a longitude", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        REGIONS,
        async (first, second, regions) => {
          const report = await lintWith(
            textOf({
              type: "Point",
              coordinates: [
                Number(first.toFixed(5)),
                Number(second.toFixed(5)),
              ],
            }),
            regions,
          );
          expect(findingsOf(report, "projected-coords")).toEqual([]);
        },
      ),
      runs(300),
    );
  });

  it("inside South Africa is not reported against ZA by any rule about place", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.double({ min: 21, max: 26, noNaN: true }),
        fc.double({ min: -33, max: -30, noNaN: true }),
        async (longitude, latitude) => {
          const report = await lintWith(
            textOf({
              type: "Point",
              coordinates: [
                Number(longitude.toFixed(4)),
                Number(latitude.toFixed(4)),
              ],
            }),
            ["ZA"],
          );
          expect(
            report.findings.filter(
              (finding) =>
                finding.ruleId === "region-mismatch" ||
                finding.ruleId === "coordinate-order",
            ),
          ).toEqual([]);
        },
      ),
      runs(300),
    );
  });
});

describe("self-intersection on harder rings", () => {
  const walk: fc.Arbitrary<Point[]> = fc.array(
    fc.tuple(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 0, max: 6 })),
    { minLength: 3, maxLength: 30 },
  );

  it("reports an error exactly when two edges cross properly, on longer rings that revisit and repeat vertices", async () => {
    await fc.assert(
      fc.asyncProperty(walk, async (vertices) => {
        const report = await lintWith(
          polygonDocument(closedRing(vertices)),
          [],
        );
        const own = findingsOf(report, "self-intersection");
        const errors = own.filter((finding) => finding.severity === "error");
        expect(
          errors.length > 0,
          `${JSON.stringify(vertices)} ${JSON.stringify(report.findings.map((finding) => finding.message))}`,
        ).toBe(ringCrossesItself(vertices));
      }),
      runs(400),
    );
  });

  // The sweep stops after eleven intersections of any kind, so the rule asks
  // for crossings on their own when the first eleven hold none. Here the
  // segment from 0, 0 to 0, 1 is walked five times, then the ring crosses
  // itself at 0.5, 0.5.
  it("a crossing that follows many overlaps is still an error", async () => {
    const vertices: Point[] = [
      [0, 0],
      [0, 1],
      [0, 0],
      [0, 1],
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ];
    const report = await lintWith(polygonDocument(closedRing(vertices)), []);
    const own = findingsOf(report, "self-intersection");
    expect(own.some((finding) => finding.severity === "error")).toBe(true);
    expect(own.length).toBeLessThanOrEqual(10);
    expect(
      own.filter((finding) =>
        finding.message.includes("more intersections than are listed"),
      ),
    ).toHaveLength(1);
  });

  it("reports a crossing that follows up to 30 overlaps and touches, however they are mixed", async () => {
    // Each excursion leaves 0, 0 and comes back along the same line (an
    // overlap) or to a point on the left (a touch at 0, 0); the tail then
    // crosses itself at 0.5, 0.5.
    const excursion = fc.oneof(
      fc.constant<Point[]>([[0, 1]]),
      fc
        .double({ min: 0.1, max: 0.9, noNaN: true })
        .map((y): Point[] => [[-1, y]]),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(excursion, { minLength: 1, maxLength: 30 }),
        async (excursions) => {
          const vertices: Point[] = [
            [0, 0],
            ...excursions.flatMap((out): Point[] => [...out, [0, 0]]),
            [0, 1],
            [1, 0],
            [1, 1],
          ];
          const report = await lintWith(
            polygonDocument(closedRing(vertices)),
            [],
          );
          const own = findingsOf(report, "self-intersection");
          expect(own.length).toBeLessThanOrEqual(10);
          expect(own.some((finding) => finding.severity === "error")).toBe(
            true,
          );
        },
      ),
      runs(200),
    );
  });

  /** Cross product of integer coordinates that are too big for doubles to multiply exactly. */
  const bigCross = (origin: Point, a: Point, b: Point): bigint =>
    (BigInt(a[0]) - BigInt(origin[0])) * (BigInt(b[1]) - BigInt(origin[1])) -
    (BigInt(a[1]) - BigInt(origin[1])) * (BigInt(b[0]) - BigInt(origin[0]));

  const bigSign = (value: bigint): number => {
    if (value === 0n) {
      return 0;
    }
    return value > 0n ? 1 : -1;
  };

  it("judges a triangle exactly when its coordinates are integers near 2^50", async () => {
    const big = fc.tuple(
      fc.integer({ min: 2 ** 49, max: 2 ** 49 + 6 }),
      fc.integer({ min: 2 ** 49, max: 2 ** 49 + 6 }),
    );
    await fc.assert(
      fc.asyncProperty(big, big, big, async (a, b, c) => {
        const report = await lintWith(
          polygonDocument(closedRing([a, b, c])),
          [],
        );
        const turn = bigSign(bigCross(a, b, c));
        expect(findingsOf(report, "winding-order").length > 0).toBe(turn < 0);
      }),
      runs(300),
    );
  });
});

describe("more rules against an independent oracle", () => {
  it("self-intersection finds a crossing between two rings of one polygon exactly when an edge of one properly crosses an edge of the other", async () => {
    await fc.assert(
      fc.asyncProperty(gridVertices, gridVertices, async (outer, inner) => {
        const report = await lintWith(
          polygonDocument(closedRing(outer), closedRing(inner)),
          [],
        );
        const own = findingsOf(report, "self-intersection");
        if (own.some((finding) => finding.message.includes("more "))) {
          return;
        }
        const between = ringsCross(outer, inner);
        const expected =
          ringCrossesItself(outer) || ringCrossesItself(inner) || between;
        expect(
          own.some((finding) => finding.severity === "error"),
          `${JSON.stringify(outer)} ${JSON.stringify(inner)} ${JSON.stringify(own.map((finding) => finding.message))}`,
        ).toBe(expected);
      }),
      runs(400),
    );
  });

  it("precision reports a position exactly when it does not survive rounding to seven decimals", async () => {
    const decimals = fc
      .tuple(
        fc.integer({ min: -1_800_000_000, max: 1_800_000_000 }),
        fc.integer({ min: 0, max: 12 }),
      )
      .map(([whole, places]) => whole / 10 ** places);
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(decimals, fc.double({ min: -179, max: 179, noNaN: true })),
        fc.oneof(decimals, fc.double({ min: -89, max: 89, noNaN: true })),
        async (longitude, latitude) => {
          const report = await lintWith(
            textOf({ type: "Point", coordinates: [longitude, latitude] }),
            [],
          );
          const survives = (value: number): boolean =>
            Number(value.toFixed(7)) === value;
          expect(findingsOf(report, "precision").length > 0).toBe(
            !(survives(longitude) && survives(latitude)),
          );
        },
      ),
      runs(500),
    );
  });

  it("antimeridian reports each step of more than 180 degrees, up to five, and nothing else, on a line in the mid latitudes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(
            fc.integer({ min: -180, max: 180 }),
            fc.integer({ min: -60, max: 60 }),
          ),
          { minLength: 2, maxLength: 14 },
        ),
        async (points) => {
          const report = await lintWith(
            textOf({
              type: "LineString",
              coordinates: points.map((point) => [...point]),
            }),
            [],
          );
          const long = points.filter(
            (point, index) =>
              index > 0 &&
              Math.abs(point[0] - (points[index - 1] as Point)[0]) > 180 &&
              !(
                Math.abs(point[0] - (points[index - 1] as Point)[0]) === 360 &&
                point[1] === (points[index - 1] as Point)[1]
              ),
          ).length;
          expect(findingsOf(report, "antimeridian")).toHaveLength(
            Math.min(5, long),
          );
        },
      ),
      runs(300),
    );
  });
});

/** Whether any edge of one closed ring properly crosses any edge of the other. */
function ringsCross(
  first: readonly Point[],
  second: readonly Point[],
): boolean {
  for (let one = 0; one < first.length; one++) {
    for (let two = 0; two < second.length; two++) {
      if (
        crossesProperly(
          first[one] as Point,
          first[(one + 1) % first.length] as Point,
          second[two] as Point,
          second[(two + 1) % second.length] as Point,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}
