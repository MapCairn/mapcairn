// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { Position } from "../geometry/predicates.js";
import { leafGeometries, type PositionRef } from "../geometry/walk.js";
import type { CountryIndex, Finding, Rule, RuleContext } from "../types.js";
import { capFindings } from "./findingCap.js";
import { samplePositions } from "./positionSample.js";

/** How many positions of one geometry are read, so a huge geometry costs bounded time. */
const SAMPLE_SIZE = 64;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/** The outlines and the codes a position is tested against. */
export interface Lookup {
  readonly countries: CountryIndex;
  readonly regions: readonly string[];
}

/** The region lookup, when regions were given and their outlines are known. */
export function regionLookup(context: RuleContext): Lookup | undefined {
  if (context.regions.length === 0 || context.countries === undefined) {
    return undefined;
  }
  return { countries: context.countries, regions: context.regions };
}

function insideAny(
  lookup: Lookup,
  longitude: number,
  latitude: number,
): boolean {
  return lookup.regions.some((code) =>
    lookup.countries.contains(code, longitude, latitude),
  );
}

/**
 * With a region: outside every region as written, and inside one when the two
 * numbers are swapped. A swapped value that is not a longitude and a latitude
 * cannot be a place, so it is never suspect.
 */
function isSwappedIntoRegion(
  lookup: Lookup,
  [first = 0, second = 0]: Position,
): boolean {
  if (Math.abs(second) > MAX_LONGITUDE || Math.abs(first) > MAX_LATITUDE) {
    return false;
  }
  return !insideAny(lookup, first, second) && insideAny(lookup, second, first);
}

/**
 * Without a region: the second number cannot be a latitude, while the first
 * could be one and the second could be a longitude. A first number above 90
 * as well is projected data, which `projected-coords` reports.
 */
function isSwappedByRange([first = 0, second = 0]: Position): boolean {
  return (
    Math.abs(second) > MAX_LATITUDE &&
    Math.abs(second) <= MAX_LONGITUDE &&
    Math.abs(first) <= MAX_LATITUDE
  );
}

/** Joins region codes for a sentence: "ZA", "ZA or NA", "ZA, NA or FR". */
export function listRegions(codes: readonly string[]): string {
  const last = codes.at(-1);
  return codes.length < 2
    ? codes.join("")
    : `${codes.slice(0, -1).join(", ")} or ${last}`;
}

/** The start of a sentence about the sampled positions, and whether it is plural. */
function subjectOf(
  suspect: number,
  sampled: number,
): { text: string; many: boolean } {
  if (sampled === 1) {
    return { text: "The position", many: false };
  }
  const text =
    suspect === sampled
      ? `All ${sampled} sampled positions`
      : `${suspect} of ${sampled} sampled positions`;
  return { text, many: true };
}

function regionMessage(
  suspect: number,
  sampled: number,
  regions: readonly string[],
): string {
  const { text, many } = subjectOf(suspect, sampled);
  const inside = regions.length === 1 ? "it" : "one of them";
  return `${text} ${many ? "are" : "is"} outside ${listRegions(regions)} but inside ${inside} when the two numbers are swapped, so the coordinates may be written as latitude, longitude.`;
}

function rangeMessage(sampled: number): string {
  const { text, many } = subjectOf(sampled, sampled);
  return `${text} ${many ? "have" : "has"} a second number above ${MAX_LATITUDE}, which cannot be a latitude, and a first number that fits as one, so the coordinates may be written as latitude, longitude.`;
}

function regionFinding(
  sample: readonly PositionRef[],
  lookup: Lookup,
): Finding | undefined {
  const suspects = sample.filter(({ position }) =>
    isSwappedIntoRegion(lookup, position),
  );
  const first = suspects[0];
  if (first === undefined || suspects.length * 2 <= sample.length) {
    return undefined;
  }
  return {
    ruleId: "coordinate-order",
    severity: "warning",
    confidence: suspects.length === sample.length ? "high" : "medium",
    path: first.pointer,
    message: regionMessage(suspects.length, sample.length, lookup.regions),
    fixable: false,
    data: {
      suspect: suspects.length,
      sampled: sample.length,
      regions: lookup.regions,
    },
  };
}

function rangeFinding(sample: readonly PositionRef[]): Finding | undefined {
  const first = sample[0];
  if (
    first === undefined ||
    !sample.every(({ position }) => isSwappedByRange(position))
  ) {
    return undefined;
  }
  return {
    ruleId: "coordinate-order",
    severity: "info",
    confidence: "low",
    path: first.pointer,
    message: rangeMessage(sample.length),
    fixable: false,
    data: { suspect: sample.length, sampled: sample.length, regions: [] },
  };
}

function check(feature: unknown, context: RuleContext): Finding[] {
  const lookup = regionLookup(context);
  const found = leafGeometries(feature).flatMap((leaf) => {
    const sample = samplePositions(leaf, SAMPLE_SIZE);
    const finding =
      lookup === undefined
        ? rangeFinding(sample)
        : regionFinding(sample, lookup);
    return finding === undefined ? [] : [finding];
  });
  return capFindings(found, coordinateOrderRule, feature);
}

/**
 * Reports a geometry whose coordinates look written as latitude, longitude.
 * With a region it is a fair test: the positions are outside the region as
 * written and inside it swapped. Without one it reports only a position whose
 * second number is too large to be a latitude, and never a position that is
 * valid in both orders.
 */
export const coordinateOrderRule: Rule = {
  id: "coordinate-order",
  severity: "warning",
  confidence: "medium",
  summary:
    "Latitude and longitude that look swapped (a region sharpens this check).",
  fixable: false,
  needsRegion: false,
  check,
};
