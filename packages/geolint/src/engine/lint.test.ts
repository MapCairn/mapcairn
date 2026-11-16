// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  activeRules,
  buildContext,
  compareFindings,
  comparePaths,
  LintUsageError,
  lintBytes,
  lintText,
} from "./lint.js";
import { createCountryIndex } from "./regions/index.js";
import { rules } from "./rules/index.js";
import type { Finding, Rule } from "./types.js";

const point = (coordinates: unknown) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Point", coordinates },
});

describe("comparePaths", () => {
  it("orders array indices as numbers, not as text", () => {
    expect(comparePaths("/features/2", "/features/10")).toBeLessThan(0);
    expect(comparePaths("/features/10", "/features/2")).toBeGreaterThan(0);
  });

  it("puts a parent before its children and the document first", () => {
    expect(comparePaths("", "/features/0")).toBeLessThan(0);
    expect(comparePaths("/features/0", "/features/0/geometry")).toBeLessThan(0);
    expect(comparePaths("/features/0", "/features/0")).toBe(0);
  });

  it("compares names as text", () => {
    expect(comparePaths("/crs", "/features/0")).toBeLessThan(0);
    expect(
      comparePaths("/features/0/properties", "/features/0/geometry"),
    ).toBeGreaterThan(0);
  });
});

describe("compareFindings", () => {
  const finding = (ruleId: string, path: string, message = "m"): Finding => ({
    ruleId,
    severity: "info",
    confidence: "low",
    path,
    message,
    fixable: false,
  });

  it("orders by path, then rule id, then message", () => {
    const sorted = [
      finding("b", "/x/1"),
      finding("b", "/x/0", "z"),
      finding("b", "/x/0", "a"),
      finding("a", "/x/0", "z"),
    ].sort(compareFindings);
    expect(sorted.map((f) => `${f.path} ${f.ruleId} ${f.message}`)).toEqual([
      "/x/0 a z",
      "/x/0 b a",
      "/x/0 b z",
      "/x/1 b m",
    ]);
  });
});

describe("activeRules", () => {
  it("removes ignored ids and keeps the order", () => {
    const active = activeRules(rules, ["precision"]);
    expect(active.some((rule) => rule.id === "precision")).toBe(false);
    expect(active).toHaveLength(rules.length - 1);
  });

  it("refuses an id that is not a rule", () => {
    expect(() => activeRules(rules, ["no-such-rule"])).toThrow(LintUsageError);
  });
});

describe("buildContext", () => {
  const countries = async () =>
    createCountryIndex({
      format: 1,
      quantum: 1,
      countries: [{ code: "ZA", tolerance: 0, polygons: [] }],
    });

  it("has no regions and loads nothing when none were given", async () => {
    const context = await buildContext({
      countries: () => Promise.reject(new Error("must not load")),
    });
    expect(context).toEqual({ regions: [], countries: undefined });
  });

  it("upper-cases, de-duplicates and sorts the regions", async () => {
    const context = await buildContext({ regions: ["za", "ZA"], countries });
    expect(context.regions).toEqual(["ZA"]);
    expect(context.countries?.has("ZA")).toBe(true);
  });

  it("refuses a region it has no outline for", async () => {
    await expect(buildContext({ regions: ["QQ"], countries })).rejects.toThrow(
      /No outline for region QQ/,
    );
  });

  it("refuses a region when no country data was supplied", async () => {
    await expect(buildContext({ regions: ["ZA"] })).rejects.toThrow(
      LintUsageError,
    );
  });
});

describe("lintText", () => {
  it("reports findings with document paths, sorted", async () => {
    const report = await lintText(
      JSON.stringify({
        type: "FeatureCollection",
        features: [point([0, 0]), point([1, 2]), point([0, 0])],
      }),
    );
    expect(report.featureCount).toBe(3);
    expect(report.inputError).toBeUndefined();
    expect(report.findings.map((f) => f.path)).toEqual([
      "/features/0/geometry/coordinates",
      "/features/2/geometry/coordinates",
    ]);
  });

  it("maps paths for a bare geometry and a single feature", async () => {
    const geometry = await lintText(
      JSON.stringify({ type: "Point", coordinates: [0, 0] }),
    );
    expect(geometry.findings[0]?.path).toBe("/coordinates");
    const feature = await lintText(JSON.stringify(point([0, 0])));
    expect(feature.findings[0]?.path).toBe("/geometry/coordinates");
  });

  it("includes document-level findings, first in the order", async () => {
    const report = await lintText(
      JSON.stringify({
        type: "FeatureCollection",
        crs: { type: "name", properties: { name: "EPSG:3857" } },
        features: [point([0, 0])],
      }),
    );
    expect(report.findings.map((f) => f.ruleId)).toEqual([
      "deprecated-crs-member",
      "null-island",
    ]);
  });

  it("skips ignored rules", async () => {
    const report = await lintText(JSON.stringify(point([0, 0])), {
      ignore: ["null-island"],
    });
    expect(report.findings).toEqual([]);
  });

  it("runs only the rules it is given", async () => {
    const only: Rule = { ...(rules[0] as Rule), id: "only", check: () => [] };
    const report = await lintText(JSON.stringify(point([0, 0])), {
      rules: [only],
    });
    expect(report.findings).toEqual([]);
  });

  it("keeps every finding of a rule that reports far more than push(...findings) can take as arguments", async () => {
    const total = 200_000;
    const flood: Rule = {
      ...(rules[0] as Rule),
      id: "flood",
      check: () =>
        Array.from({ length: total }, (_, index) => ({
          ruleId: "flood",
          severity: "info" as const,
          confidence: "low" as const,
          path: `/geometry/${index}`,
          message: "A finding.",
          fixable: false,
        })),
      checkDocument: () => [
        {
          ruleId: "flood",
          severity: "info" as const,
          confidence: "low" as const,
          path: "",
          message: "A document finding.",
          fixable: false,
        },
      ],
    };
    const report = await lintText(JSON.stringify(point([1, 2])), {
      rules: [flood],
    });
    expect(report.findings).toHaveLength(total + 1);
  });

  it("keeps the findings for what it read when the input is cut short", async () => {
    const text = JSON.stringify({
      type: "FeatureCollection",
      features: [point([0, 0]), point([1, 2])],
    });
    const report = await lintText(
      text.slice(0, text.indexOf('"coordinates":[1')),
    );
    expect(report.inputError).toBeDefined();
    expect(report.findings.map((f) => f.ruleId)).toContain("null-island");
  });

  it.each([
    ["empty input", ""],
    ["whitespace only", "  \n "],
    ["single quotes", "{'type':'Point'}"],
    ["a cut-off root", '{"type":"Banana"'],
    [
      "a cut-off collection",
      '{"type":"FeatureCollection","crs":null,"features":[',
    ],
  ])(
    "reports %s as an input error alone, with no document finding",
    async (_name, text) => {
      const report = await lintText(text);
      expect(report.inputError).toBeDefined();
      expect(report.findings).toEqual([]);
    },
  );

  it("still reports a document problem when the whole input was read", async () => {
    const report = await lintText('{"type":"Banana"}');
    expect(report.inputError).toBeUndefined();
    expect(report.findings.map((f) => f.ruleId)).toEqual(["structure"]);
  });

  it("gives the features read before a syntax error, and no document finding", async () => {
    const report = await lintText(
      `{"type":"FeatureCollection","crs":null,"features":[${JSON.stringify(point([0, 0]))},{'x'}]}`,
    );
    expect(report.inputError).toBeDefined();
    expect(report.featureCount).toBe(1);
    expect(report.findings.map((f) => f.ruleId)).toEqual(["null-island"]);
  });

  it("reports a root crs once, for a Feature, a bare geometry and a collection", async () => {
    const crs = { type: "name", properties: { name: "EPSG:4326" } };
    const documents = [
      { ...point([1, 2]), crs },
      { type: "Point", coordinates: [1, 2], crs },
      { type: "FeatureCollection", features: [], crs },
    ];
    for (const document of documents) {
      const report = await lintText(JSON.stringify(document));
      const found = report.findings.filter(
        (finding) => finding.ruleId === "deprecated-crs-member",
      );
      expect(found.map((finding) => finding.path)).toEqual(["/crs"]);
    }
  });

  it("reports a crs on a feature of a collection apart from the root's", async () => {
    const report = await lintText(
      JSON.stringify({
        type: "FeatureCollection",
        crs: null,
        features: [{ ...point([1, 2]), crs: null }],
      }),
    );
    expect(
      report.findings
        .filter((finding) => finding.ruleId === "deprecated-crs-member")
        .map((finding) => finding.path),
    ).toEqual(["/crs", "/features/0/crs"]);
  });

  it("reports a root crs when a Feature root also has a features array that is read instead", async () => {
    const report = await lintText(
      '{"type":"Feature","crs":null,"features":[],"geometry":null,"properties":null}',
    );
    expect(
      report.findings
        .filter((finding) => finding.ruleId === "deprecated-crs-member")
        .map((finding) => finding.path),
    ).toEqual(["/crs"]);
  });

  it("does not load the country data unless a region was asked for", async () => {
    let loads = 0;
    await lintText(JSON.stringify(point([1, 2])), {
      countries: async () => {
        loads += 1;
        return createCountryIndex({ format: 1, quantum: 1, countries: [] });
      },
    });
    expect(loads).toBe(0);
  });

  it("is the same for any way the bytes are chunked", async () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        type: "FeatureCollection",
        features: [point([0, 0]), point([5, 5, 5])],
      }),
    );
    const whole = await lintText(new TextDecoder().decode(bytes));
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: bytes.length }),
        async (size) => {
          const chunks = (async function* () {
            for (let i = 0; i < bytes.length; i += size) {
              yield bytes.slice(i, i + size);
            }
          })();
          expect(await lintBytes(chunks)).toEqual(whole);
        },
      ),
    );
  });

  it("never throws, whatever JSON it is given", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (value) => {
        const report = await lintText(JSON.stringify(value));
        expect(report.inputError).toBeUndefined();
      }),
      { numRuns: 200 },
    );
  });
});
