// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { fixFeature } from "./fix.js";
import { lintText } from "./lint.js";
import { MAX_FINDINGS_PER_FEATURE } from "./rules/findingCap.js";
import { rules } from "./rules/index.js";

/** More findings than `push(...findings)` can pass as arguments (the limit is about 125,000). */
const PARTS = 200_000;

/** A closed ring that runs clockwise, which RFC 7946 asks to be counter-clockwise for an outer ring. */
const CLOCKWISE_PART = "[[[10,10],[10,11],[11,11],[11,10],[10,10]]]";

const feature = `{"type":"Feature","properties":{},"geometry":{"type":"MultiPolygon","coordinates":[${Array(PARTS).fill(CLOCKWISE_PART).join(",")}]}}`;

const windingFindings = (report: Awaited<ReturnType<typeof lintText>>) =>
  report.findings.filter((finding) => finding.ruleId === "winding-order");

describe("a feature with 200,000 problems", () => {
  it("is linted without an error, and reports the cap and the count of the rest", {
    timeout: 120_000,
  }, async () => {
    const report = await lintText(feature);
    expect(report.inputError).toBeUndefined();
    const winding = windingFindings(report);
    expect(winding).toHaveLength(MAX_FINDINGS_PER_FEATURE + 1);
    expect(winding[0]?.path).toBe("/geometry");
    expect(winding[0]?.data).toEqual({
      suppressed: PARTS - MAX_FINDINGS_PER_FEATURE,
    });
    expect(report.findings.length).toBeLessThan(100);
  });

  it("is still repaired in every part, so the fixed feature has no winding finding", {
    timeout: 120_000,
  }, async () => {
    const fixed = fixFeature(
      JSON.parse(feature),
      { regions: [], countries: undefined },
      rules,
    );
    const report = await lintText(JSON.stringify(fixed));
    expect(windingFindings(report)).toEqual([]);
    expect(report.findings).toEqual([]);
  });
});
