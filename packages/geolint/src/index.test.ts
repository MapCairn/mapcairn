// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import * as geolint from "./index.js";

describe("the package entry", () => {
  it("exports the engine, the reader, the fixes and the formats", () => {
    for (const name of [
      "lintText",
      "lintBytes",
      "lintFeature",
      "geoJsonReader",
      "fixBytes",
      "fixFeature",
      "formatText",
      "formatJson",
      "formatSarif",
      "exitCodeFor",
      "loadCountries",
      "rules",
      "VERSION",
    ]) {
      expect(geolint).toHaveProperty(name);
    }
  });

  it("registers every rule once, under a stable kebab-case id", () => {
    const ids = geolint.rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("lints a document without Node", async () => {
    const report = await geolint.lintText(
      JSON.stringify({ type: "Point", coordinates: [0, 0] }),
    );
    expect(report.findings.map((finding) => finding.ruleId)).toEqual([
      "null-island",
    ]);
  });
});
