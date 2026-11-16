// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { Finding, Rule, RuleContext } from "../types.js";
import {
  capFindings,
  FindingCap,
  MAX_FINDINGS_PER_FEATURE,
} from "./findingCap.js";
import { rules } from "./index.js";

const FACTS = { id: "sample-rule", confidence: "medium" } as const;
const FEATURE = { type: "Feature", properties: {}, geometry: null };

const finding = (index: number, severity: Finding["severity"]): Finding => ({
  ruleId: FACTS.id,
  severity,
  confidence: "medium",
  path: `/geometry/${index}`,
  message: `Finding ${index}.`,
  fixable: false,
});

describe("FindingCap", () => {
  it("keeps every finding up to the cap and adds nothing when none is left out", () => {
    const cap = new FindingCap(FACTS, FEATURE);
    for (let index = 0; index < MAX_FINDINGS_PER_FEATURE; index++) {
      cap.add("warning", () => finding(index, "warning"));
    }
    expect(cap.result()).toHaveLength(MAX_FINDINGS_PER_FEATURE);
    expect(
      cap.result().some((entry) => entry.data?.suppressed !== undefined),
    ).toBe(false);
  });

  it("builds only the findings it keeps, and counts the rest in one closing finding at the geometry", () => {
    const cap = new FindingCap(FACTS, FEATURE);
    let built = 0;
    for (let index = 0; index < 1000; index++) {
      cap.add("warning", () => {
        built += 1;
        return finding(index, "warning");
      });
    }
    expect(built).toBe(MAX_FINDINGS_PER_FEATURE);
    const result = cap.result();
    expect(result).toHaveLength(MAX_FINDINGS_PER_FEATURE + 1);
    expect(result.at(-1)).toEqual({
      ruleId: "sample-rule",
      severity: "warning",
      confidence: "medium",
      path: "/geometry",
      message:
        "980 more findings from the sample-rule rule in this feature are not shown.",
      fixable: false,
      data: { suppressed: 980 },
    });
  });

  it("uses the singular for one finding left out", () => {
    const cap = new FindingCap(FACTS, FEATURE);
    for (let index = 0; index <= MAX_FINDINGS_PER_FEATURE; index++) {
      cap.add("info", () => finding(index, "info"));
    }
    expect(cap.result().at(-1)?.message).toBe(
      "1 more finding from the sample-rule rule in this feature is not shown.",
    );
  });

  it("gives the closing finding the worst severity among the ones left out, never a worse one", () => {
    const cap = new FindingCap(FACTS, FEATURE);
    for (let index = 0; index < MAX_FINDINGS_PER_FEATURE; index++) {
      cap.add("error", () => finding(index, "error"));
    }
    cap.add("info", () => finding(100, "info"));
    expect(cap.result().at(-1)?.severity).toBe("info");
    cap.add("warning", () => finding(101, "warning"));
    cap.add("info", () => finding(102, "info"));
    expect(cap.result().at(-1)?.severity).toBe("warning");
    cap.add("error", () => finding(103, "error"));
    expect(cap.result().at(-1)?.severity).toBe("error");
  });

  it("puts the closing finding at the empty path for a bare geometry", () => {
    const cap = new FindingCap(FACTS, { type: "Point", coordinates: [0, 0] });
    for (let index = 0; index <= MAX_FINDINGS_PER_FEATURE; index++) {
      cap.add("info", () => finding(index, "info"));
    }
    expect(cap.result().at(-1)?.path).toBe("");
  });
});

describe("capFindings", () => {
  it("returns findings that are within the cap as they are", () => {
    const found = [finding(0, "info"), finding(1, "error")];
    expect(capFindings(found, FACTS, FEATURE)).toEqual(found);
  });

  it("keeps the first findings and counts the rest", () => {
    const found = Array.from({ length: 45 }, (_, index) =>
      finding(index, "warning"),
    );
    const result = capFindings(found, FACTS, FEATURE);
    expect(result.slice(0, MAX_FINDINGS_PER_FEATURE)).toEqual(
      found.slice(0, MAX_FINDINGS_PER_FEATURE),
    );
    expect(result.at(-1)?.data).toEqual({ suppressed: 25 });
  });
});

const context: RuleContext = { regions: [], countries: undefined };
const COUNT = 30;
const many = (make: (index: number) => unknown) =>
  Array.from({ length: COUNT }, (_, index) => make(index));
const square = (open: boolean, clockwise: boolean) => {
  const ring = clockwise
    ? [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ]
    : [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
  return open ? ring : [...ring, ring[0]];
};
const collectionOf = (member: unknown) => ({
  type: "Feature",
  properties: {},
  geometry: {
    type: "GeometryCollection",
    geometries: many(() => member),
  },
});
const multiPolygonOf = (polygon: () => unknown) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "MultiPolygon", coordinates: many(polygon) },
});
const point = (coordinates: number[]) => ({ type: "Point", coordinates });

/** One feature that gives each rule at least twice the cap of findings, for every rule that can. */
const OFFENDERS: Readonly<Record<string, unknown>> = {
  "winding-order": multiPolygonOf(() => [square(false, true)]),
  "duplicate-vertices": {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiLineString",
      coordinates: many(() => [
        [0, 0],
        [0, 0],
        [1, 1],
      ]),
    },
  },
  "unclosed-ring": multiPolygonOf(() => [square(true, false)]),
  "empty-geometry": collectionOf(point([])),
  precision: collectionOf(point([0.123456789, 0.123456789])),
  "projected-coords": collectionOf(point([500000, 6000000])),
  antimeridian: collectionOf(point([190, 0])),
  "null-island": collectionOf(point([0, 0])),
  "coordinate-order": collectionOf(point([10, 100])),
  "self-intersection": multiPolygonOf(() => [
    [
      [0.5, 0.5],
      [1.5, 1.5],
      [1.5, 0.5],
      [0.5, 1.5],
      [0.5, 0.5],
    ],
  ]),
};

describe("every rule that can find many things in one feature", () => {
  const byId = new Map<string, Rule>(rules.map((rule) => [rule.id, rule]));

  it.each(Object.keys(OFFENDERS))(
    "%s reports at most the cap and counts the rest",
    (id) => {
      const rule = byId.get(id) as Rule;
      const findings = rule.check(OFFENDERS[id], context);
      expect(findings).toHaveLength(MAX_FINDINGS_PER_FEATURE + 1);
      const closing = findings.at(-1) as Finding;
      expect(closing.ruleId).toBe(id);
      expect(closing.path).toBe("/geometry");
      expect(closing.data).toEqual({
        suppressed: COUNT - MAX_FINDINGS_PER_FEATURE,
      });
      expect(
        findings
          .slice(0, MAX_FINDINGS_PER_FEATURE)
          .every((entry) => entry.data?.suppressed === undefined),
      ).toBe(true);
    },
  );

  it("is checked for every rule except the ones that report once for a feature", () => {
    const single = new Set([
      "region-mismatch",
      "deprecated-crs-member",
      "structure",
    ]);
    expect(
      rules.map((rule) => rule.id).filter((id) => !single.has(id)),
    ).toEqual(expect.arrayContaining(Object.keys(OFFENDERS)));
    expect(
      rules
        .map((rule) => rule.id)
        .filter((id) => !single.has(id) && !(id in OFFENDERS)),
    ).toEqual([]);
  });
});
