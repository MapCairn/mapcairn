// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type SplitEvent,
  type SplitOptions,
  type SplitStats,
  splitJson,
} from "./jsonSplitter.js";

const encoder = new TextEncoder();

/** A test that builds megabytes of input may take a while on a busy machine. */
const LONG_TEST_MS = 60_000;
const lenientDecoder = new TextDecoder();

/** An event with its bytes read as text, for comparing. */
interface Plain {
  readonly kind: string;
  readonly key?: string | undefined;
  readonly index?: number;
  readonly text?: string;
  readonly message?: string;
  readonly offset: number;
}

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

function plain(event: SplitEvent): Plain {
  switch (event.kind) {
    case "error":
      return { kind: "error", message: event.message, offset: event.offset };
    case "arrayStart":
      return { kind: "arrayStart", key: event.key, offset: event.offset };
    case "element":
      return {
        kind: "element",
        key: event.key,
        index: event.index,
        text: lenientDecoder.decode(event.bytes),
        offset: event.offset,
      };
    case "member":
      return {
        kind: "member",
        key: event.key,
        text: lenientDecoder.decode(event.bytes),
        offset: event.offset,
      };
    case "value":
      return {
        kind: "value",
        text: lenientDecoder.decode(event.bytes),
        offset: event.offset,
      };
  }
}

/** The events of a split, one by one, from the batches it yields. */
async function* eventsOf(
  chunks: AsyncIterable<Uint8Array>,
  options?: SplitOptions,
): AsyncGenerator<SplitEvent> {
  for await (const batch of splitJson(chunks, options)) {
    expect(batch.length).toBeGreaterThan(0);
    yield* batch;
  }
}

async function runChunks(
  chunks: readonly Uint8Array[],
  options?: SplitOptions,
): Promise<Plain[]> {
  const events: Plain[] = [];
  for await (const event of eventsOf(fromChunks(chunks), options)) {
    events.push(plain(event));
  }
  return events;
}

async function run(
  input: string | Uint8Array,
  options?: SplitOptions,
  size = Number.POSITIVE_INFINITY,
): Promise<Plain[]> {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  const chunks =
    size === Number.POSITIVE_INFINITY ? [bytes] : inPieces(bytes, size);
  return runChunks(chunks, options);
}

const STREAM_FEATURES: SplitOptions = { streamKey: "features" };

describe("splitting a root object", () => {
  it("hands over each member with its raw bytes and offset", async () => {
    const text = '{"type": "Feature", "n": 12, "ok": true, "a": [1, {"b": 2}]}';
    expect(await run(text)).toEqual([
      { kind: "member", key: "type", text: '"Feature"', offset: 9 },
      { kind: "member", key: "n", text: "12", offset: 25 },
      { kind: "member", key: "ok", text: "true", offset: 35 },
      { kind: "member", key: "a", text: '[1, {"b": 2}]', offset: 46 },
    ]);
  });

  it("streams the elements of the stream key, in order, with their offsets", async () => {
    const text =
      '{"type":"FeatureCollection","features":[{"a":1}, 2 ,"s",[3],null],"name":"x"}';
    expect(await run(text, STREAM_FEATURES)).toEqual([
      { kind: "member", key: "type", text: '"FeatureCollection"', offset: 8 },
      { kind: "arrayStart", key: "features", offset: 39 },
      {
        kind: "element",
        key: "features",
        index: 0,
        text: '{"a":1}',
        offset: 40,
      },
      { kind: "element", key: "features", index: 1, text: "2", offset: 49 },
      { kind: "element", key: "features", index: 2, text: '"s"', offset: 52 },
      { kind: "element", key: "features", index: 3, text: "[3]", offset: 56 },
      { kind: "element", key: "features", index: 4, text: "null", offset: 60 },
      { kind: "member", key: "name", text: '"x"', offset: 73 },
    ]);
  });

  it("streams an empty array as a start with no elements", async () => {
    expect(await run('{"features": [ ]}', STREAM_FEATURES)).toEqual([
      { kind: "arrayStart", key: "features", offset: 13 },
    ]);
  });

  it("hands a member over whole when no stream key is given", async () => {
    expect(await run('{"features":[1,2]}')).toEqual([
      { kind: "member", key: "features", text: "[1,2]", offset: 12 },
    ]);
  });

  it("hands a stream key over whole when its value is not an array", async () => {
    expect(await run('{"features":{"a":1},"x":1}', STREAM_FEATURES)).toEqual([
      { kind: "member", key: "features", text: '{"a":1}', offset: 12 },
      { kind: "member", key: "x", text: "1", offset: 24 },
    ]);
  });

  it("streams every array under the stream key and no nested one", async () => {
    const text = '{"features":[1],"inner":{"features":[9]},"features":[2,3]}';
    expect(await run(text, STREAM_FEATURES)).toEqual([
      { kind: "arrayStart", key: "features", offset: 12 },
      { kind: "element", key: "features", index: 0, text: "1", offset: 13 },
      { kind: "member", key: "inner", text: '{"features":[9]}', offset: 24 },
      { kind: "arrayStart", key: "features", offset: 52 },
      { kind: "element", key: "features", index: 0, text: "2", offset: 53 },
      { kind: "element", key: "features", index: 1, text: "3", offset: 55 },
    ]);
  });

  it("decodes escapes in member names", async () => {
    const events = await run('{"a\\u0062\\"c":1}');
    expect(events).toEqual([
      { kind: "member", key: 'ab"c', text: "1", offset: 14 },
    ]);
  });

  it("gives an empty object no events", async () => {
    expect(await run(" { } ")).toEqual([]);
  });

  it("ends a number or literal member at a comma, a brace or whitespace", async () => {
    const events = await run('{"a":1,"b":-2.5e3\n,"c":null}');
    expect(events.map((event) => event.text)).toEqual(["1", "-2.5e3", "null"]);
  });
});

describe("splitting other roots", () => {
  it("streams a root array", async () => {
    expect(await run('[{"a":1}, 2]')).toEqual([
      { kind: "arrayStart", key: undefined, offset: 0 },
      { kind: "element", key: undefined, index: 0, text: '{"a":1}', offset: 1 },
      { kind: "element", key: undefined, index: 1, text: "2", offset: 10 },
    ]);
  });

  it("streams an empty root array", async () => {
    expect(await run("[]")).toEqual([
      { kind: "arrayStart", key: undefined, offset: 0 },
    ]);
  });

  it.each([
    ['"text"', '"text"', 0],
    ["  42  ", "42", 2],
    ["true", "true", 0],
    ["null\n", "null", 0],
  ])("hands over the root value %j whole", async (input, text, offset) => {
    expect(await run(input)).toEqual([{ kind: "value", text, offset }]);
    expect(await run(input, undefined, 1)).toEqual([
      { kind: "value", text, offset },
    ]);
  });
});

describe("strings, escapes and multi-byte characters", () => {
  const tricky = [
    '{"a":"}{ ]["}',
    '{"a":"say \\"hi\\" {"}',
    '{"a":"ends with a backslash \\\\"}',
    '{"a":"\\\\\\"}"}',
    '{"é€😀":"é€😀 }"}',
    '{"a":["]", {"b":"\\u0022}"}]}',
  ];

  it.each(tricky)("keeps %s in one piece at every chunk size", async (text) => {
    const whole = await run(text);
    expect(whole).toHaveLength(1);
    for (const size of [1, 2, 3, 5]) {
      expect(await run(text, undefined, size)).toEqual(whole);
    }
  });

  it("splits a multi-byte character across chunks", async () => {
    const bytes = encoder.encode('{"a":"€😀"}');
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const events = await runChunks(cutAt(bytes, [cut]));
      expect(events).toEqual([
        { kind: "member", key: "a", text: '"€😀"', offset: 5 },
      ]);
    }
  });
});

describe("chunking does not change the result", () => {
  const text = `\uFEFF {\n "type": "FeatureCollection",\n "features": [\n  {"type":"Feature","properties":{"name":"A \\"quoted\\" é"},"geometry":null} ,\n  {"type":"Feature","geometry":{"type":"Point","coordinates":[1,2]}}\n ],\n "bbox": [0, 0, 1, 1]\n}\n`;
  const bytes = encoder.encode(text);

  it("gives the same events for every fixed chunk size", async () => {
    const whole = await run(bytes, STREAM_FEATURES);
    expect(whole.at(-1)?.kind).toBe("member");
    for (let size = 1; size <= bytes.length; size += 1) {
      expect(await run(bytes, STREAM_FEATURES, size)).toEqual(whole);
    }
  });

  it("gives the same events at random split points, with empty chunks", async () => {
    const whole = await run(bytes, STREAM_FEATURES);
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: bytes.length }), { maxLength: 12 }),
        async (cuts) => {
          const pieces = cutAt(bytes, cuts);
          const withEmpty = pieces.flatMap((piece) => [
            new Uint8Array(0),
            piece,
          ]);
          expect(await runChunks(withEmpty, STREAM_FEATURES)).toEqual(whole);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("gives the same error at random split points", async () => {
    const broken = bytes.subarray(0, bytes.length - 20);
    const whole = await run(broken, STREAM_FEATURES);
    expect(whole.at(-1)?.kind).toBe("error");
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: broken.length }), { maxLength: 12 }),
        async (cuts) => {
          expect(await runChunks(cutAt(broken, cuts), STREAM_FEATURES)).toEqual(
            whole,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("byte order mark and whitespace", () => {
  const bom = Uint8Array.of(0xef, 0xbb, 0xbf);

  function withBom(text: string): Uint8Array {
    return Uint8Array.of(...bom, ...encoder.encode(text));
  }

  it("skips a byte order mark and counts it in offsets", async () => {
    expect(await run(withBom('{"a":1}'))).toEqual([
      { kind: "member", key: "a", text: "1", offset: 8 },
    ]);
    expect(await run(withBom('{"a":1}'), undefined, 1)).toEqual([
      { kind: "member", key: "a", text: "1", offset: 8 },
    ]);
  });

  it("accepts tabs, line feeds and carriage returns between tokens", async () => {
    const events = await run(
      '\t\r\n{\r\n\t"a"\t:\n1\r\n,\t"b" : [ ] \r\n}\r\n',
    );
    expect(events.map((event) => event.text)).toEqual(["1", "[ ]"]);
  });

  it("rejects a byte order mark that is cut short or wrong", async () => {
    expect(await run(Uint8Array.of(0xef, 0xbb))).toEqual([
      {
        kind: "error",
        message: "The input ends inside a byte order mark.",
        offset: 2,
      },
    ]);
    expect(await run(Uint8Array.of(0xef, 0x00))).toEqual([
      {
        kind: "error",
        message: "The input starts with an invalid byte order mark.",
        offset: 1,
      },
    ]);
    expect(await run(Uint8Array.of(0xef, 0xbb, 0x20, 0x7b))).toEqual([
      {
        kind: "error",
        message: "The input starts with an invalid byte order mark.",
        offset: 2,
      },
    ]);
  });

  it("does not take a byte order mark that is not at the start", async () => {
    const events = await run(Uint8Array.of(0x20, ...bom));
    expect(events.map((event) => [event.kind, event.offset])).toEqual([
      ["value", 1],
    ]);
  });
});

describe("errors in the structure", () => {
  const cases: readonly [string, string, number][] = [
    ["", "The input is empty.", 0],
    ["  \n\t ", "The input is empty.", 5],
    ["\uFEFF", "The input is empty.", 3],
    ["{", "The input ends before the root value is closed.", 1],
    ['{"a"', "The input ends before the root value is closed.", 4],
    ['{"a":', "The input ends before the root value is closed.", 5],
    ['{"a":1', "The input ends before the root value is closed.", 6],
    ['{"a":1,', "The input ends before the root value is closed.", 7],
    ['{"a":{}', "The input ends before the root value is closed.", 7],
    ['{"features":[', "The input ends before the root value is closed.", 13],
    ['{"features":[1,', "The input ends before the root value is closed.", 15],
    ['{"features":[{}', "The input ends before the root value is closed.", 15],
    ["[", "The input ends before the root value is closed.", 1],
    ['{"a":"abc', "The input ends inside an unterminated string.", 9],
    ['{"a":[1,"ab', "The input ends inside an unterminated string.", 11],
    ['{"a', "The input ends inside an unterminated string.", 3],
    ['"abc', "The input ends inside an unterminated string.", 4],
    ['{"a":[1,', "The input ends inside an unclosed array or object.", 8],
    ['{"a":{"b":[}', "The input ends inside an unclosed array or object.", 12],
    ["{1:2}", "Unexpected '1'; expected a member name or \"}\".", 1],
    ['{"a":1,}', "Unexpected '}'; expected a member name.", 7],
    ['{"a" 1}', "Unexpected '1'; expected \":\".", 5],
    ['{"a":,}', "Unexpected ','; expected a JSON value.", 5],
    ['{"a":1 "b":2}', 'Unexpected \'"\'; expected "," or "}".', 7],
    ['{"a":1]', 'Unexpected \']\'; expected "," or "}".', 6],
    ["[1 2]", 'Unexpected \'2\'; expected "," or "]".', 3],
    ["[1}", 'Unexpected \'}\'; expected "," or "]".', 2],
    ["[,]", "Unexpected ','; expected a JSON value.", 1],
    ["[1,]", "Unexpected ']'; expected a JSON value.", 3],
    ["]", "Unexpected ']'; expected a JSON value.", 0],
    [":", "Unexpected ':'; expected a JSON value.", 0],
    ["{} x", "Unexpected 'x' after the end of the root value.", 3],
    ["[] []", "Unexpected '[' after the end of the root value.", 3],
    ["1 2", "Unexpected '2' after the end of the root value.", 2],
    ['"a" "b"', "Unexpected '\"' after the end of the root value.", 4],
    ["{}}", "Unexpected '}' after the end of the root value.", 2],
    ["{}\u0000", "Unexpected byte 0x00 after the end of the root value.", 2],
    ["{\u0001}", 'Unexpected byte 0x01; expected a member name or "}".', 1],
    ['{"\\x":1}', "A member name is not a valid JSON string.", 1],
  ];

  it.each(cases)("reports %j", async (input, message, offset) => {
    const whole = await run(input, STREAM_FEATURES);
    expect(whole.at(-1)).toEqual({ kind: "error", message, offset });
    expect(whole.filter((event) => event.kind === "error")).toHaveLength(1);
    expect(await run(input, STREAM_FEATURES, 1)).toEqual(whole);
  });

  it("reports a member name that is not UTF-8", async () => {
    const bytes = Uint8Array.of(0x7b, 0x22, 0xff, 0x22, 0x3a, 0x31, 0x7d);
    expect(await run(bytes)).toEqual([
      {
        kind: "error",
        message: "A member name is not a valid JSON string.",
        offset: 1,
      },
    ]);
  });

  it("gives the pieces that were complete before the error first", async () => {
    const events = await run('{"a":1,"features":[1,2,]}', STREAM_FEATURES);
    expect(events.map((event) => event.kind)).toEqual([
      "member",
      "arrayStart",
      "element",
      "element",
      "error",
    ]);
  });

  it("stops reading the source at an error", async () => {
    let pulled = 0;
    async function* source(): AsyncGenerator<Uint8Array> {
      for (const text of ["{]", "never", "read"]) {
        pulled += 1;
        yield encoder.encode(text);
      }
    }
    const events: Plain[] = [];
    for await (const event of eventsOf(source())) {
      events.push(plain(event));
    }
    expect(events).toHaveLength(1);
    expect(pulled).toBe(1);
  });

  it("scans a failed chunk no further", async () => {
    expect(await run("{]}}}", STREAM_FEATURES)).toHaveLength(1);
  });
});

describe("a source that fails", () => {
  it("reports the failure after the pieces already read", async () => {
    async function* source(): AsyncGenerator<Uint8Array> {
      yield encoder.encode('{"a":1,');
      throw new Error("the disk went away");
    }
    const events: Plain[] = [];
    for await (const event of eventsOf(source())) {
      events.push(plain(event));
    }
    expect(events).toEqual([
      { kind: "member", key: "a", text: "1", offset: 5 },
      {
        kind: "error",
        message: "The input could not be read: the disk went away",
        offset: 7,
      },
    ]);
  });

  it("reports a failure that is not an Error", async () => {
    const odd: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject("plain text"),
      }),
    };
    const events: Plain[] = [];
    for await (const event of eventsOf(odd)) {
      events.push(plain(event));
    }
    expect(events).toEqual([
      {
        kind: "error",
        message: "The input could not be read: plain text",
        offset: 0,
      },
    ]);
  });

  it("closes the source when the consumer stops early", async () => {
    let closed = false;
    async function* source(): AsyncGenerator<Uint8Array> {
      try {
        yield encoder.encode('{"features":[1,2,3');
        yield encoder.encode(",4,5]}");
      } finally {
        closed = true;
      }
    }
    for await (const event of eventsOf(source(), STREAM_FEATURES)) {
      expect(event.kind).toBe("arrayStart");
      break;
    }
    expect(closed).toBe(true);
  });
});

describe("what the splitter holds in memory", () => {
  function feature(index: number, padding: number): string {
    return `{"type":"Feature","id":${index},"properties":{"p":"${"x".repeat(padding)}"},"geometry":null}`;
  }

  async function peak(
    bytes: Uint8Array,
    size: number,
    options: SplitOptions,
  ): Promise<{ stats: SplitStats; events: number }> {
    const stats: SplitStats = { peakBufferedBytes: 0 };
    let events = 0;
    let failed = false;
    for await (const event of eventsOf(fromChunks(inPieces(bytes, size)), {
      ...options,
      stats,
    })) {
      failed ||= event.kind === "error";
      events += 1;
    }
    expect(failed).toBe(false);
    return { stats, events };
  }

  it("copies nothing while every piece lies inside one chunk", async () => {
    const bytes = encoder.encode(`{"features":[${feature(0, 10)}]}`);
    const { stats } = await peak(bytes, bytes.length, STREAM_FEATURES);
    expect(stats.peakBufferedBytes).toBe(0);
  });

  it(
    "holds about one feature at a time for 20,000 small features",
    async () => {
      const count = 20_000;
      const features = Array.from({ length: count }, (_, index) =>
        feature(index, index % 7),
      );
      const largest = Math.max(
        ...features.map((text) => encoder.encode(text).length),
      );
      const bytes = encoder.encode(
        `{"type":"FeatureCollection","features":[${features.join(",\n")}]}`,
      );
      expect(bytes.length).toBeGreaterThan(count * 60);
      const { stats, events } = await peak(bytes, 997, STREAM_FEATURES);
      expect(events).toBe(count + 2);
      expect(stats.peakBufferedBytes).toBeGreaterThan(0);
      expect(stats.peakBufferedBytes).toBeLessThanOrEqual(largest);
    },
    LONG_TEST_MS,
  );

  it(
    "holds one feature of about 5 MB, and not the file",
    async () => {
      const big = feature(1, 5_000_000);
      const bytes = encoder.encode(
        `{"features":[${feature(0, 1)},${big},${feature(2, 1)}]}`,
      );
      const bigLength = encoder.encode(big).length;
      const { stats } = await peak(bytes, 65_536, STREAM_FEATURES);
      expect(stats.peakBufferedBytes).toBe(bigLength);
      expect(stats.peakBufferedBytes).toBeLessThan(bytes.length);
    },
    LONG_TEST_MS,
  );

  it("holds the largest member when nothing is streamed", async () => {
    const bytes = encoder.encode(`{"a":"${"y".repeat(2000)}","b":1}`);
    const { stats } = await peak(bytes, 100, {});
    expect(stats.peakBufferedBytes).toBe(2002);
  });

  it(
    "scans many megabytes in one pass",
    async () => {
      const bytes = encoder.encode(
        `{"features":[${Array.from({ length: 60_000 }, (_, index) => feature(index, 8)).join(",")}]}`,
      );
      const started = performance.now();
      const { events } = await peak(bytes, 65_536, STREAM_FEATURES);
      expect(events).toBe(60_001);
      expect(performance.now() - started).toBeLessThan(30_000);
    },
    LONG_TEST_MS,
  );
});

describe("deep nesting", () => {
  it(
    "scans nesting far deeper than the stack allows",
    async () => {
      const depth = 500_000;
      const text = `[${"[".repeat(depth)}${"]".repeat(depth)}]`;
      const events = await run(text, undefined, 8192);
      expect(events).toHaveLength(2);
      expect(events[1]?.text?.length).toBe(2 * depth);
    },
    LONG_TEST_MS,
  );
});
