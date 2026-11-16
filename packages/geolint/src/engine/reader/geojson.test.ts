// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { DocumentInfo, InputError } from "../types.js";
import { geoJsonReader } from "./geojson.js";

const encoder = new TextEncoder();

/** A test that builds megabytes of input may take a while on a busy machine. */
const LONG_TEST_MS = 60_000;

/** What a feature looked like when it was read, with a pointer mapped through it. */
interface Seen {
  readonly index: number;
  readonly value: unknown;
  readonly pointer: string;
}

interface Outcome {
  readonly features: Seen[];
  readonly document: DocumentInfo;
  readonly error: InputError | undefined;
}

const PROBE = "/geometry/coordinates/0";

async function* fromChunks(
  chunks: readonly Uint8Array[],
): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function inPieces(bytes: Uint8Array, size: number): Uint8Array[] {
  const pieces: Uint8Array[] = [];
  for (let start = 0; start < bytes.length; start += size) {
    pieces.push(bytes.subarray(start, start + size));
  }
  return pieces;
}

function cutAt(bytes: Uint8Array, cuts: readonly number[]): Uint8Array[] {
  const points = [
    ...new Set(cuts.filter((cut) => cut > 0 && cut < bytes.length)),
  ].sort((a, b) => a - b);
  const pieces: Uint8Array[] = [];
  let start = 0;
  for (const point of points) {
    pieces.push(bytes.subarray(start, point));
    start = point;
  }
  pieces.push(bytes.subarray(start));
  return pieces;
}

async function readSource(source: AsyncIterable<Uint8Array>): Promise<Outcome> {
  const result = geoJsonReader.read(source);
  const features: Seen[] = [];
  for await (const feature of result.features) {
    features.push({
      index: feature.index,
      value: feature.value,
      pointer: feature.toDocumentPointer(PROBE),
    });
  }
  const { document, error } = await result.done;
  return { features, document, error };
}

function readBytes(bytes: Uint8Array, size?: number): Promise<Outcome> {
  const chunks = size === undefined ? [bytes] : inPieces(bytes, size);
  return readSource(fromChunks(chunks));
}

function read(text: string, size?: number): Promise<Outcome> {
  return readBytes(encoder.encode(text), size);
}

/** A source that records whether it was opened and closed. */
function trackedSource(texts: readonly string[]): {
  readonly source: AsyncIterable<Uint8Array>;
  readonly state: { opened: boolean; closed: boolean; pulled: number };
} {
  const state = { opened: false, closed: false, pulled: 0 };
  async function* generate(): AsyncGenerator<Uint8Array> {
    state.opened = true;
    try {
      for (const text of texts) {
        state.pulled += 1;
        yield encoder.encode(text);
      }
    } finally {
      state.closed = true;
    }
  }
  return { source: generate(), state };
}

const POINT = '{"type":"Point","coordinates":[1,2]}';
const COLLECTION = `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"n":1},"geometry":${POINT}},{"type":"Feature","properties":null,"geometry":null}]}`;

describe("a FeatureCollection", () => {
  it("yields each feature in order with its index and document pointer", async () => {
    const outcome = await read(COLLECTION);
    expect(outcome.error).toBeUndefined();
    expect(outcome.features).toEqual([
      {
        index: 0,
        value: {
          type: "Feature",
          properties: { n: 1 },
          geometry: { type: "Point", coordinates: [1, 2] },
        },
        pointer: "/features/0/geometry/coordinates/0",
      },
      {
        index: 1,
        value: { type: "Feature", properties: null, geometry: null },
        pointer: "/features/1/geometry/coordinates/0",
      },
    ]);
  });

  it("maps the feature itself to its place in the features array", async () => {
    const result = geoJsonReader.read(fromChunks([encoder.encode(COLLECTION)]));
    const seen: string[] = [];
    for await (const feature of result.features) {
      seen.push(feature.toDocumentPointer(""));
    }
    expect(seen).toEqual(["/features/0", "/features/1"]);
  });

  it("describes the document from the other root members", async () => {
    const outcome = await read(
      '{"bbox":[0,0,1,1],"type":"FeatureCollection","features":[],"name":"x"}',
    );
    expect(outcome.features).toEqual([]);
    expect(outcome.document).toEqual({
      rootType: "FeatureCollection",
      members: { bbox: [0, 0, 1, 1], type: "FeatureCollection", name: "x" },
      hasFeatures: true,
      rootIsFeature: false,
      duplicateMembers: [],
    });
  });

  it("handles the type member after the features", async () => {
    const outcome = await read(
      '{"features":[{"type":"Feature"}],"type":"FeatureCollection"}',
    );
    expect(outcome.features).toHaveLength(1);
    expect(outcome.document.rootType).toBe("FeatureCollection");
    expect(outcome.document.members).toEqual({ type: "FeatureCollection" });
  });

  it("yields any JSON value as a feature, for a rule to report", async () => {
    const outcome = await read('{"features":[null,1,"s",[],{},true]}');
    expect(outcome.features.map((feature) => feature.value)).toEqual([
      null,
      1,
      "s",
      [],
      {},
      true,
    ]);
    expect(outcome.error).toBeUndefined();
  });

  it("has no features, and says so, when features is not an array", async () => {
    for (const value of ["null", "{}", '"x"', "3"]) {
      const outcome = await read(
        `{"type":"FeatureCollection","features":${value}}`,
      );
      expect(outcome.features).toEqual([]);
      expect(outcome.document.hasFeatures).toBe(false);
      expect(outcome.document.members.features).toEqual(JSON.parse(value));
      expect(outcome.error).toBeUndefined();
    }
  });

  it("has no features when the type is right and features is missing", async () => {
    const outcome = await read('{"type":"FeatureCollection"}');
    expect(outcome.features).toEqual([]);
    expect(outcome.document).toEqual({
      rootType: "FeatureCollection",
      members: { type: "FeatureCollection" },
      hasFeatures: false,
      rootIsFeature: false,
      duplicateMembers: [],
    });
  });

  it("names each repeated root member once, in the order the second copy came", async () => {
    const outcome = await read(
      '{"a":1,"features":[],"b":1,"b":2,"features":[1],"a":3,"features":[2],"b":4}',
    );
    expect(outcome.document.duplicateMembers).toEqual(["b", "features", "a"]);
    expect(outcome.document.members).toMatchObject({ a: 3, b: 4 });
  });

  it("counts a features member that is not an array when it repeats", async () => {
    const outcome = await read('{"features":null,"features":[1,2]}');
    expect(outcome.document.duplicateMembers).toEqual(["features"]);
  });

  it("names no member when none repeats, nor for the elements of a root array", async () => {
    const outcome = await read('[{"type":"Feature"},{"type":"Feature"}]');
    expect(outcome.document.duplicateMembers).toEqual([]);
    const plain = await read('{"type":"FeatureCollection","features":[]}');
    expect(plain.document.duplicateMembers).toEqual([]);
  });

  it("says when the root was read as a feature", async () => {
    const feature = await read('{"type":"Feature","geometry":null}');
    expect(feature.document.rootIsFeature).toBe(true);
    const geometry = await read('{"type":"Point","coordinates":[1,2]}');
    expect(geometry.document.rootIsFeature).toBe(true);
    const collection = await read('{"type":"FeatureCollection","features":[]}');
    expect(collection.document.rootIsFeature).toBe(false);
    const withFeatures = await read('{"type":"Feature","features":[]}');
    expect(withFeatures.document.rootIsFeature).toBe(false);
    const unknown = await read('{"type":"Banana"}');
    expect(unknown.document.rootIsFeature).toBe(false);
  });

  it("yields the features of a root with no type", async () => {
    const outcome = await read('{"features":[1,2]}');
    expect(outcome.features).toHaveLength(2);
    expect(outcome.document.rootType).toBeUndefined();
    expect(outcome.document.hasFeatures).toBe(true);
  });

  it("never streams a second features member", async () => {
    const outcome = await read(
      '{"features":[1,2],"x":0,"features":[3,4,5],"features":null}',
    );
    expect(outcome.features.map((feature) => feature.value)).toEqual([1, 2]);
    expect(outcome.document.members).toEqual({ x: 0 });
    expect(outcome.document.hasFeatures).toBe(true);
    expect(outcome.error).toBeUndefined();
  });

  it("keeps the first features member even when it is not an array", async () => {
    const outcome = await read('{"features":null,"features":[1,2]}');
    expect(outcome.features).toEqual([]);
    expect(outcome.document.hasFeatures).toBe(false);
    expect(outcome.document.members).toEqual({ features: null });
  });

  it("still checks that an ignored second features member is valid JSON", async () => {
    const outcome = await read('{"features":[1],"features":[2,x]}');
    expect(outcome.features).toHaveLength(1);
    expect(outcome.error).toEqual({
      message: "Invalid JSON in features[1].",
      offset: 30,
    });
    const member = await read('{"features":1,"features":x}');
    expect(member.error?.message).toBe(
      'Invalid JSON in the "features" member.',
    );
  });

  it("lets a later duplicate member win, as JSON.parse does", async () => {
    const outcome = await read('{"a":1,"a":2,"features":[]}');
    expect(outcome.document.members).toEqual({ a: 2 });
  });

  it("keeps a __proto__ member as data without touching any prototype", async () => {
    const outcome = await read('{"__proto__":{"polluted":true},"features":[]}');
    expect(Object.hasOwn(outcome.document.members, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(outcome.document.rootType).toBeUndefined();
  });

  it("reads the same document from a source of one byte chunks", async () => {
    expect(await read(COLLECTION, 1)).toEqual(await read(COLLECTION));
  });
});

describe("a Feature root", () => {
  const feature = `{"type":"Feature","id":7,"properties":{"a":1},"geometry":${POINT}}`;

  it("yields the root as feature 0 with an identity pointer", async () => {
    const result = geoJsonReader.read(fromChunks([encoder.encode(feature)]));
    const seen = [];
    for await (const item of result.features) {
      seen.push({
        index: item.index,
        value: item.value,
        pointer: item.toDocumentPointer("/geometry/coordinates/0"),
      });
    }
    expect(seen).toEqual([
      {
        index: 0,
        value: JSON.parse(feature),
        pointer: "/geometry/coordinates/0",
      },
    ]);
    const { document, error } = await result.done;
    expect(error).toBeUndefined();
    expect(document.rootType).toBe("Feature");
    expect(document.hasFeatures).toBe(false);
  });

  it("yields the root once the whole document has been read", async () => {
    const { source, state } = trackedSource([
      feature.slice(0, 20),
      feature.slice(20),
    ]);
    const result = geoJsonReader.read(source);
    const iterator = result.features[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    expect(state.pulled).toBe(2);
  });

  it("does not yield the root when it also holds a features array", async () => {
    const outcome = await read(
      '{"type":"Feature","features":[1],"geometry":null}',
    );
    expect(outcome.features.map((item) => item.value)).toEqual([1]);
    expect(outcome.document.rootType).toBe("Feature");
    expect(outcome.document.hasFeatures).toBe(true);
  });
});

describe("a bare geometry root", () => {
  const geometries = [
    '{"type":"Point","coordinates":[1,2]}',
    '{"type":"MultiPoint","coordinates":[[1,2],[3,4]]}',
    '{"type":"LineString","coordinates":[[1,2],[3,4]]}',
    '{"type":"MultiLineString","coordinates":[[[1,2],[3,4]]]}',
    '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}',
    '{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,0]]]]}',
    '{"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[1,2]}]}',
  ];

  it.each(geometries)("wraps %s in a Feature", async (text) => {
    const outcome = await read(text);
    expect(outcome.error).toBeUndefined();
    expect(outcome.features).toEqual([
      {
        index: 0,
        value: {
          type: "Feature",
          properties: null,
          geometry: JSON.parse(text),
        },
        pointer: "/coordinates/0",
      },
    ]);
    expect(outcome.document.hasFeatures).toBe(false);
  });

  it("maps pointers into the wrapper back to the document", async () => {
    const result = geoJsonReader.read(fromChunks([encoder.encode(POINT)]));
    const pointers: string[] = [];
    for await (const feature of result.features) {
      for (const relative of [
        "/geometry",
        "/geometry/coordinates",
        "/geometry/coordinates/1",
        "/properties",
        "/type",
        "/geometryx",
        "",
      ]) {
        pointers.push(feature.toDocumentPointer(relative));
      }
    }
    expect(pointers).toEqual([
      "",
      "/coordinates",
      "/coordinates/1",
      "",
      "",
      "",
      "",
    ]);
  });
});

describe("other valid roots", () => {
  it.each([
    ["[]", undefined],
    ['[1,{"a":[2]},"s",null]', undefined],
    ['"text"', undefined],
    ["12", undefined],
    ["null", undefined],
    ["true", undefined],
    ["{}", undefined],
    ['{"type":"Topology","objects":{}}', "Topology"],
    ['{"type":"Nonsense"}', "Nonsense"],
    ['{"type":5}', undefined],
    ['{"coordinates":[1,2]}', undefined],
  ])("reads %s with no feature and no error", async (text, rootType) => {
    const outcome = await read(text);
    expect(outcome.features).toEqual([]);
    expect(outcome.error).toBeUndefined();
    expect(outcome.document.rootType).toBe(rootType);
    expect(outcome.document.hasFeatures).toBe(false);
    expect(await read(text, 1)).toEqual(outcome);
  });

  it("fills the document members of an unknown root", async () => {
    const outcome = await read('{"type":"Topology","arcs":[[1,2]]}');
    expect(outcome.document.members).toEqual({
      type: "Topology",
      arcs: [[1, 2]],
    });
  });

  it("reports an invalid element of a root array", async () => {
    const outcome = await read("[1, {x}, 3]");
    expect(outcome.error).toEqual({
      message: "Invalid JSON in element 1 of the root array.",
      offset: 4,
    });
  });

  it("reports an invalid root value", async () => {
    expect((await read("  tru")).error).toEqual({
      message: "Invalid JSON in the root value.",
      offset: 2,
    });
  });
});

describe("input that is not a complete document", () => {
  it.each([
    ["", "The input is empty.", 0],
    [" \n\t", "The input is empty.", 3],
    [
      '{"features":[{"a":1},{"b":',
      "The input ends inside an unclosed array or object.",
      26,
    ],
    [
      '{"features":[{"a":1}',
      "The input ends before the root value is closed.",
      20,
    ],
    [
      '{"features":[{"a":"abc',
      "The input ends inside an unterminated string.",
      22,
    ],
    [
      '{"features":[{"a":[1,',
      "The input ends inside an unclosed array or object.",
      21,
    ],
    [
      '{"features":[1,2]} x',
      "Unexpected 'x' after the end of the root value.",
      19,
    ],
    [
      '{"features":[1,2]}}',
      "Unexpected '}' after the end of the root value.",
      18,
    ],
    ['{"features":[1,2}', 'Unexpected \'}\'; expected "," or "]".', 16],
    ['{"features":[{"a":1]}', "Invalid JSON in features[0].", 13],
    ['{"features":[{"a":1},{"b":2]},3]}', "Invalid JSON in features[1].", 21],
    ['{"crs":{bad},"features":[]}', 'Invalid JSON in the "crs" member.', 7],
    ["{,}", "Unexpected ','; expected a member name or \"}\".", 1],
  ])("reports %j", async (text, message, offset) => {
    const outcome = await read(text);
    expect(outcome.error).toEqual({ message, offset });
    expect(await read(text, 1)).toEqual(outcome);
  });

  it("keeps the features read before the problem", async () => {
    const outcome = await read('{"features":[{"a":1},{"b":2},{"c":');
    expect(outcome.features.map((feature) => feature.value)).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
    expect(outcome.document.hasFeatures).toBe(true);
    expect(outcome.error?.message).toBe(
      "The input ends inside an unclosed array or object.",
    );
  });

  it("yields the features before an invalid one, from the same chunk", async () => {
    const outcome = await read('{"features":[1,2,{bad},3]}');
    expect(outcome.features.map((feature) => feature.value)).toEqual([1, 2]);
    expect(outcome.error).toEqual({
      message: "Invalid JSON in features[2].",
      offset: 17,
    });
  });

  it("reports invalid UTF-8 in a feature", async () => {
    const bytes = Uint8Array.of(
      ...encoder.encode('{"features":[{"a":"'),
      0xff,
      ...encoder.encode('"}]}'),
    );
    const outcome = await readBytes(bytes);
    expect(outcome.error).toEqual({
      message: "Invalid UTF-8 in features[0].",
      offset: 13,
    });
    expect(await readBytes(bytes, 1)).toEqual(outcome);
  });

  it("does not take a byte order mark inside a value", async () => {
    const bytes = Uint8Array.of(
      ...encoder.encode("[1,"),
      0xef,
      0xbb,
      0xbf,
      ...encoder.encode("2]"),
    );
    expect((await readBytes(bytes)).error?.message).toBe(
      "Invalid JSON in element 1 of the root array.",
    );
  });

  it("reports nesting that is too deep for the parser to read", async () => {
    const original = JSON.parse.bind(JSON);
    const spy = vi.spyOn(JSON, "parse").mockImplementation((text, reviver) => {
      if (text.includes("too-deep")) {
        throw new RangeError("Maximum call stack size exceeded");
      }
      return original(text, reviver);
    });
    try {
      const outcome = await read('{"features":[{"too-deep":1}]}');
      expect(outcome.error).toEqual({
        message: "The nesting in features[0] is too deep to read.",
        offset: 13,
      });
    } finally {
      spy.mockRestore();
    }
  });

  it(
    "reads nesting far deeper than the stack allows, or reports it",
    async () => {
      const depth = 100_000;
      const nested = `${"[".repeat(depth)}${"]".repeat(depth)}`;
      const outcome = await read(
        `{"features":[{"type":"Feature","properties":{"deep":${nested}},"geometry":null}]}`,
        4096,
      );
      if (outcome.error === undefined) {
        expect(outcome.features).toHaveLength(1);
      } else {
        expect(outcome.error.message).toBe(
          "The nesting in features[0] is too deep to read.",
        );
      }
    },
    LONG_TEST_MS,
  );

  it("reports a source that fails, after the features already read", async () => {
    async function* source(): AsyncGenerator<Uint8Array> {
      yield encoder.encode('{"features":[1,2,');
      throw new Error("connection reset");
    }
    const outcome = await readSource(source());
    expect(outcome.features.map((feature) => feature.value)).toEqual([1, 2]);
    expect(outcome.error).toEqual({
      message: "The input could not be read: connection reset",
      offset: 17,
    });
  });
});

describe("the iteration and done", () => {
  it("ends the iteration, again and again, once it has ended", async () => {
    const result = geoJsonReader.read(
      fromChunks([encoder.encode('{"features":[1]}')]),
    );
    const iterator = result.features[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    expect((await iterator.next()).done).toBe(true);
    expect((await iterator.next()).done).toBe(true);
    expect((await result.done).error).toBeUndefined();
  });

  it("resolves done after the features were consumed, and not before", async () => {
    const result = geoJsonReader.read(fromChunks([encoder.encode(COLLECTION)]));
    let settled = false;
    void result.done.then(() => {
      settled = true;
    });
    const iterator = result.features[Symbol.asyncIterator]();
    await iterator.next();
    await Promise.resolve();
    expect(settled).toBe(false);
    await iterator.next();
    await iterator.next();
    await result.done;
    expect(settled).toBe(true);
  });

  it("resolves done, with the error, when the iteration ends on a problem", async () => {
    const result = geoJsonReader.read(fromChunks([encoder.encode("{")]));
    for await (const feature of result.features) {
      expect(feature).toBeUndefined();
    }
    expect((await result.done).error?.offset).toBe(1);
  });

  it("closes the source and resolves done when the consumer stops early", async () => {
    const { source, state } = trackedSource([
      '{"type":"FeatureCollection",',
      '"features":[1,2,3,',
      "4,5]}",
    ]);
    const result = geoJsonReader.read(source);
    for await (const feature of result.features) {
      expect(feature.value).toBe(1);
      break;
    }
    expect(state.closed).toBe(true);
    expect(state.pulled).toBe(2);
    const { document, error } = await result.done;
    expect(error).toBeUndefined();
    expect(document.hasFeatures).toBe(true);
  });

  it("resolves done when the iteration is closed before it starts", async () => {
    const { source, state } = trackedSource(["{}"]);
    const result = geoJsonReader.read(source);
    const iterator = result.features[Symbol.asyncIterator]();
    const closed = await iterator.return?.();
    expect(closed?.done).toBe(true);
    expect((await result.done).error).toBeUndefined();
    expect(state.opened).toBe(false);
  });

  it("closes the source at the first problem it finds in a feature", async () => {
    const { source, state } = trackedSource([
      '{"features":[{bad},',
      "1,2,",
      "3]}",
    ]);
    const outcome = await readSource(source);
    expect(outcome.features).toEqual([]);
    expect(outcome.error?.message).toBe("Invalid JSON in features[0].");
    expect(state.closed).toBe(true);
    expect(state.pulled).toBe(1);
  });

  it("settles done only once", async () => {
    const result = geoJsonReader.read(
      fromChunks([encoder.encode('{"features":[1,2]}')]),
    );
    const iterator = result.features[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return?.();
    await iterator.return?.();
    expect((await iterator.next()).done).toBe(true);
    expect((await result.done).error).toBeUndefined();
  });
});

describe("what the reader holds in memory", () => {
  it(
    "reads one feature of about 5 MB",
    async () => {
      const blob = "z".repeat(5_000_000);
      const text = `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"blob":"${blob}"},"geometry":null},{"type":"Feature","properties":null,"geometry":null}]}`;
      const outcome = await read(text, 65_536);
      expect(outcome.error).toBeUndefined();
      expect(outcome.features).toHaveLength(2);
      const first = outcome.features[0]?.value as {
        properties: { blob: string };
      };
      expect(first.properties.blob).toHaveLength(5_000_000);
    },
    LONG_TEST_MS,
  );

  it(
    "reads a collection of 20,000 small features",
    async () => {
      const count = 20_000;
      const features = Array.from(
        { length: count },
        (_, index) =>
          `{"type":"Feature","id":${index},"properties":{"n":"é${index}"},"geometry":{"type":"Point","coordinates":[${index},1]}}`,
      );
      const outcome = await read(
        `{"type":"FeatureCollection","features":[${features.join(",\n")}]}`,
        4093,
      );
      expect(outcome.error).toBeUndefined();
      expect(outcome.features).toHaveLength(count);
      const last = outcome.features[count - 1] as Seen;
      expect(last.index).toBe(count - 1);
      expect(last.pointer).toBe(`/features/${count - 1}${PROBE}`);
      expect((last.value as { id: number }).id).toBe(count - 1);
    },
    LONG_TEST_MS,
  );
});

describe("properties of the reader", () => {
  const document = `﻿ {\n "type": "FeatureCollection",\n "name": "é€",\n "features": [\n  {"type":"Feature","properties":{"n":"a \\"b\\" 😀"},"geometry":${POINT}} ,\n  {"type":"Feature","properties":null,"geometry":null}\n ],\n "bbox": [0, 0, 1, 1]\n}\n`;
  const bytes = encoder.encode(document);

  it("gives the same outcome at every chunk size", async () => {
    const whole = await readBytes(bytes);
    expect(whole.error).toBeUndefined();
    expect(whole.features).toHaveLength(2);
    for (const size of [1, 2, 3, 7, 64]) {
      expect(await readBytes(bytes, size)).toEqual(whole);
    }
  });

  it("gives the same outcome at random split points", async () => {
    const whole = await readBytes(bytes);
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: bytes.length }), { maxLength: 10 }),
        async (cuts) => {
          const outcome = await readSource(fromChunks(cutAt(bytes, cuts)));
          expect(outcome).toEqual(whole);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("parses features built from arbitrary JSON to what JSON.parse gives", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.jsonValue(), { maxLength: 6 }),
        fc.array(fc.nat(2000), { maxLength: 6 }),
        async (values, cuts) => {
          const text = JSON.stringify({
            type: "FeatureCollection",
            features: values,
          });
          const expected = (JSON.parse(text) as { features: unknown[] })
            .features;
          const outcome = await readSource(
            fromChunks(cutAt(encoder.encode(text), cuts)),
          );
          expect(outcome.error).toBeUndefined();
          expect(
            outcome.features.map((feature) => feature.value),
          ).toStrictEqual(expected);
          expect(outcome.features.map((feature) => feature.index)).toEqual(
            expected.map((_, index) => index),
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it("reads any valid JSON document without an error", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (value) => {
        const outcome = await read(JSON.stringify(value, null, 1));
        expect(outcome.error).toBeUndefined();
      }),
      { numRuns: 150 },
    );
  });

  it("never throws on a document cut short at any byte", async () => {
    const complete = encoder.encode(document.trimEnd()).length;
    for (let length = 0; length < complete; length += 1) {
      const prefix = bytes.subarray(0, length);
      for (const size of [undefined, 5]) {
        const outcome = await readBytes(prefix, size);
        expect(outcome.error).toBeDefined();
        expect(outcome.error?.offset).toBeGreaterThanOrEqual(0);
        expect(outcome.error?.offset).toBeLessThanOrEqual(length);
      }
    }
    expect((await readBytes(bytes)).error).toBeUndefined();
  });

  it("never throws when one byte is changed", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: bytes.length - 1 }),
        fc.integer({ min: 0, max: 255 }),
        fc.array(fc.integer({ min: 0, max: bytes.length }), { maxLength: 5 }),
        async (position, value, cuts) => {
          const changed = bytes.slice();
          changed[position] = value;
          const outcome = await readSource(fromChunks(cutAt(changed, cuts)));
          if (outcome.error !== undefined) {
            expect(outcome.error.offset).toBeGreaterThanOrEqual(0);
            expect(outcome.error.offset).toBeLessThanOrEqual(changed.length);
          }
          const whole = await readBytes(changed);
          expect(outcome).toEqual(whole);
        },
      ),
      { numRuns: 300 },
    );
  });
});
