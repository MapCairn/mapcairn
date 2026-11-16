// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintText } from "./lint.js";
import { rules } from "./rules/index.js";

const FIXTURES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../fixtures",
);

interface Expected {
  readonly path: string;
  readonly severity: string;
}

interface Options {
  readonly regions?: readonly string[];
}

/** Reads a fixture file, or `undefined` when the rule has none of that name. */
function read(rule: string, name: string): string | undefined {
  const file = path.join(FIXTURES, rule, name);
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function optionsFor(rule: string): Options {
  const text = read(rule, "options.json");
  return text === undefined ? {} : (JSON.parse(text) as Options);
}

const fixtureRules = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("every rule has a passing and a failing fixture", () => {
  it.each(rules.map((rule) => rule.id))(
    "%s has both, and an expectation",
    (id) => {
      expect(read(id, "pass.geojson")).toBeDefined();
      expect(read(id, "fail.geojson")).toBeDefined();
      expect(read(id, "fail.expected.json")).toBeDefined();
    },
  );

  it("has no fixture folder for a rule that does not exist", () => {
    const ids = new Set(rules.map((rule) => rule.id));
    expect(fixtureRules.filter((name) => !ids.has(name))).toEqual([]);
  });
});

describe.each(fixtureRules)("fixtures for %s", (id) => {
  const options = optionsFor(id);
  const countries = async () =>
    (await import("./regions/index.js")).loadCountries();

  it("pass.geojson has no finding from the rule", async () => {
    const report = await lintText(read(id, "pass.geojson") ?? "", {
      ...options,
      countries,
    });
    expect(report.inputError).toBeUndefined();
    expect(report.findings.filter((finding) => finding.ruleId === id)).toEqual(
      [],
    );
  });

  it("fail.geojson has exactly the expected findings from the rule", async () => {
    const report = await lintText(read(id, "fail.geojson") ?? "", {
      ...options,
      countries,
    });
    expect(report.inputError).toBeUndefined();
    const found = report.findings
      .filter((finding) => finding.ruleId === id)
      .map(({ path: at, severity }) => ({ path: at, severity }));
    const expected = JSON.parse(
      read(id, "fail.expected.json") ?? "[]",
    ) as Expected[];
    expect(found).toEqual(expected);
  });
});
