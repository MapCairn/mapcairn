// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FIX_ORDER,
  FixError,
  type FixStats,
  fixBytes,
  fixFeature,
  MAX_FIX_PASSES,
} from "./fix.js";
import { lintText } from "./lint.js";
import { rules } from "./rules/index.js";
import type { Rule, RuleContext } from "./types.js";

const context: RuleContext = { regions: [], countries: undefined };

/** A polygon that is clockwise, unclosed, repeats a vertex and has long decimals. */
const messy = {
  type: "Feature",
  properties: { name: "messy" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0.123456789, 0],
        [0, 1],
        [1, 1],
        [1, 1],
        [1, 0],
      ],
    ],
  },
};

const tidy = {
  type: "Feature",
  properties: { name: "tidy" },
  geometry: { type: "Point", coordinates: [10, 20] },
};

async function* chunked(
  text: string,
  size = text.length,
): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i += size) {
    yield bytes.slice(i, i + size);
  }
}

async function fixText(
  text: string,
  size?: number,
): Promise<{ output: string; stats: FixStats }> {
  const stats: FixStats = { features: 0, changed: 0 };
  let output = "";
  for await (const piece of fixBytes(
    chunked(text, size),
    context,
    rules,
    stats,
  )) {
    output += piece;
  }
  return { output, stats };
}

/**
 * Findings of the rules that `--fix` repairs, for a document. `precision` can
 * stay when rounding would have damaged the feature, so a test that generates
 * features of any size leaves it out.
 */
async function fixableFindings(
  text: string,
  ignored: readonly string[] = [],
): Promise<string[]> {
  const report = await lintText(text);
  return report.findings
    .filter(
      (finding) =>
        FIX_ORDER.includes(finding.ruleId) &&
        finding.fixable &&
        !ignored.includes(finding.ruleId),
    )
    .map((finding) => finding.ruleId);
}

describe("fixFeature", () => {
  it("repairs every fixable problem and leaves nothing for those rules to find", async () => {
    const fixed = fixFeature(messy, context, rules);
    expect(fixed).not.toBe(messy);
    expect(await fixableFindings(JSON.stringify(fixed))).toEqual([]);
  });

  it("returns the same object when there is nothing to fix", () => {
    expect(fixFeature(tidy, context, rules)).toBe(tidy);
  });

  it("does not change its input", () => {
    const copy = structuredClone(messy);
    fixFeature(messy, context, rules);
    expect(messy).toEqual(copy);
  });

  it("applies only the rules it is given, so an ignored rule is not fixed", () => {
    const withoutPrecision = rules.filter((rule) => rule.id !== "precision");
    const fixed = fixFeature(messy, context, withoutPrecision) as typeof messy;
    expect(fixed.geometry.coordinates[0]?.[0]?.[0]).toBe(0.123456789);
  });

  it("stops after a bounded number of passes when a fix never settles", () => {
    let calls = 0;
    const flipper: Rule = {
      ...(rules[0] as Rule),
      id: "unclosed-ring",
      fix: (value) => {
        calls += 1;
        return { ...(value as object) };
      },
    };
    fixFeature(tidy, context, [flipper]);
    expect(calls).toBe(MAX_FIX_PASSES);
  });

  describe("a polygon so small that rounding damages it", () => {
    /** Simple at full precision; rounded to seven decimals it collapses onto a few grid points and crosses itself. */
    const tiny = {
      type: "Feature",
      properties: null,
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [10.0000000674179, 20.0000000079739],
            [10.0000000373136, 20.0000000468924],
            [10.0000000126925, 20.0000000924147],
            [9.999999983821, 20.0000000171779],
            [9.99999996854054, 20.0000000082991],
            [9.99999997832276, 19.9999999875333],
            [9.9999999546644, 19.9999998971455],
            [10.0000000375681, 19.99999991509],
            [10.0000000226883, 19.9999999901942],
            [10.0000000674179, 20.0000000079739],
          ],
        ],
      },
    };

    const problems = (value: unknown): number =>
      rules
        .filter((rule) => rule.id !== "precision")
        .flatMap((rule) => rule.check(value, context))
        .filter((finding) => finding.severity !== "info").length;

    it("keeps its full precision rather than making it worse", () => {
      expect(problems(tiny)).toBe(0);
      const fixed = fixFeature(tiny, context, rules);
      expect(problems(fixed)).toBe(0);
      expect(fixed).toBe(tiny);
    });
  });

  it("is the same when applied twice to a degenerate polygon that rounding would damage", () => {
    const degenerate = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [1.23456789, 0, 0],
              [0, 0, 0],
              [0, -5e-324, 0],
              [0, 1, 0],
              [2, -0],
              [0, -1e-323],
            ],
            [
              [-0, -0],
              [1.23456789, 1.23456789, 0],
              [0, -0, 0],
            ],
          ],
        ],
      },
    };
    const once = fixFeature(degenerate, context, rules);
    expect(fixFeature(once, context, rules)).toBe(once);
  });

  it("is the same when applied twice", () => {
    const once = fixFeature(messy, context, rules);
    expect(fixFeature(once, context, rules)).toBe(once);
  });
});

describe("fixBytes", () => {
  const collection = (...features: unknown[]) =>
    JSON.stringify({
      type: "FeatureCollection",
      name: "kept",
      features,
      note: { a: 1 },
    });

  it("fixes a FeatureCollection and keeps its other members, in order", async () => {
    const { output, stats } = await fixText(collection(messy, tidy));
    const parsed = JSON.parse(output);
    expect(Object.keys(parsed)).toEqual(["type", "name", "features", "note"]);
    expect(parsed.name).toBe("kept");
    expect(parsed.note).toEqual({ a: 1 });
    expect(parsed.features).toHaveLength(2);
    expect(stats).toEqual({ features: 2, changed: 1 });
    expect(await fixableFindings(output)).toEqual([]);
  });

  it("keeps the original text of a feature that needed nothing", async () => {
    const original =
      '{"type":"Feature",  "properties":null,   "geometry":{"type":"Point","coordinates":[1,2]}}';
    const { output } = await fixText(
      `{"type":"FeatureCollection","features":[${original}]}`,
    );
    expect(output).toContain(original);
  });

  it("gives the same output for any way the input is chunked", async () => {
    const text = collection(messy, tidy, messy);
    const whole = (await fixText(text)).output;
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 40 }), async (size) => {
        expect((await fixText(text, size)).output).toBe(whole);
      }),
      { numRuns: 25 },
    );
  });

  it("handles members after the features array, an empty array, and a second features member", async () => {
    expect(
      JSON.parse(
        (await fixText('{"features":[],"type":"FeatureCollection"}')).output,
      ),
    ).toEqual({
      features: [],
      type: "FeatureCollection",
    });
    const twice = JSON.parse(
      (await fixText('{"features":[],"features":[]}')).output,
    );
    expect(twice.features).toEqual([]);
  });

  it("fixes a Feature at the root", async () => {
    const { output, stats } = await fixText(JSON.stringify(messy));
    expect(stats).toEqual({ features: 1, changed: 1 });
    expect(await fixableFindings(output)).toEqual([]);
    expect(JSON.parse(output).properties).toEqual({ name: "messy" });
  });

  it("fixes a bare geometry at the root and writes a geometry back", async () => {
    const { output } = await fixText(JSON.stringify(messy.geometry));
    const parsed = JSON.parse(output);
    expect(parsed.type).toBe("Polygon");
    expect(parsed.coordinates[0]).toHaveLength(5);
    expect(await fixableFindings(output)).toEqual([]);
  });

  it("leaves a geometry that is fine, and an unknown object, as they are", async () => {
    const point = { type: "Point", coordinates: [1, 2] };
    const fine = await fixText(JSON.stringify(point));
    expect(JSON.parse(fine.output)).toEqual(point);
    expect(fine.stats.changed).toBe(0);
    const unknown = await fixText('{"hello":"world"}');
    expect(JSON.parse(unknown.output)).toEqual({ hello: "world" });
  });

  it("refuses a root that is not an object", async () => {
    await expect(fixText("[1,2]")).rejects.toThrow(/not a JSON object/);
    await expect(fixText("42")).rejects.toThrow(FixError);
  });

  it("refuses invalid JSON, truncated input, a bad feature and invalid UTF-8", async () => {
    await expect(fixText('{"features":[{"a":1}')).rejects.toThrow(FixError);
    await expect(fixText("")).rejects.toThrow(FixError);
    await expect(fixText('{"features":[{"a":}]}')).rejects.toThrow(
      /Invalid JSON/,
    );
    const stats: FixStats = { features: 0, changed: 0 };
    const bad = (async function* () {
      yield Uint8Array.from([
        0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d,
      ]);
    })();
    await expect(
      (async () => {
        for await (const piece of fixBytes(bad, context, rules, stats)) {
          void piece;
        }
      })(),
    ).rejects.toThrow(/UTF-8/);
  });

  it("never throws anything but a FixError, whatever it is given", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (value) => {
        try {
          await fixText(JSON.stringify(value));
        } catch (error) {
          expect(error).toBeInstanceOf(FixError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("leaves no fixable finding after fixing, for generated polygons", async () => {
    const position = fc.tuple(
      fc.double({ min: -170, max: 170, noNaN: true }),
      fc.double({ min: -80, max: 80, noNaN: true }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(position, { minLength: 3, maxLength: 12 }),
        async (ring) => {
          const text = collection({
            type: "Feature",
            properties: null,
            geometry: { type: "Polygon", coordinates: [ring] },
          });
          const { output } = await fixText(text);
          expect(await fixableFindings(output, ["precision"])).toEqual([]);
        },
      ),
      { numRuns: 60 },
    );
  });
});
