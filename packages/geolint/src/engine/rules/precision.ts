// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { Position } from "../geometry/predicates.js";
import { leafGeometries, matchingPositions } from "../geometry/walk.js";
import { isFiniteNumber, pointer } from "../json.js";
import type { Finding, Rule } from "../types.js";
import { capFindings } from "./findingCap.js";
import { fixLeaves, mapPositions } from "./fixSupport.js";

const RULE_ID = "precision";

/**
 * The most decimal places a coordinate needs. Seven places of a degree is about
 * 1.1 cm at the equator, finer than any positioning that makes GeoJSON.
 */
const MAX_DECIMALS = 7;

/** Longitude, latitude and altitude. Later elements are not coordinates. */
const COORDINATE_AXES = 3;

/** 10 to the power of `MAX_DECIMALS`: the scale that turns a number with that many decimals into an integer. */
const DECIMAL_SCALE = 10 ** MAX_DECIMALS;

/**
 * Below this magnitude `value * DECIMAL_SCALE` is under 2^51, so a number with
 * at most `MAX_DECIMALS` decimals multiplies to within half of the integer it
 * is the nearest double to, and rounding gives that integer back exactly.
 */
const EXACT_SCALE_LIMIT = 1e8;

const NUMBER_PATTERN = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/;

/**
 * How many decimal places the shortest decimal form of a finite number has,
 * `1e-8` being 8 and `1.5e-7` 8, and `1.5e+25` 0.
 */
export function decimalPlaces(value: number): number {
  // The text of a finite number always has this shape.
  const match = NUMBER_PATTERN.exec(String(Math.abs(value))) as RegExpExecArray;
  const fraction = match[2]?.length ?? 0;
  const exponent = Number(match[3] ?? 0);
  return Math.max(0, fraction - exponent);
}

/**
 * Whether the shortest decimal form of a finite number has more than seven
 * decimal places. A number that survives a trip through the integer scale has
 * at most seven, which is the case for nearly every coordinate, so the text of
 * the number is built only for the rest.
 */
export function exceedsPrecision(value: number): boolean {
  if (
    Math.abs(value) < EXACT_SCALE_LIMIT &&
    Math.round(value * DECIMAL_SCALE) / DECIMAL_SCALE === value
  ) {
    return false;
  }
  return decimalPlaces(value) > MAX_DECIMALS;
}

/** Whether the longitude, latitude or altitude of a position has too many decimal places. */
function exceedsPrecisionAt(position: Position): boolean {
  const axes = Math.min(position.length, COORDINATE_AXES);
  for (let axis = 0; axis < axes; axis++) {
    const value = position[axis];
    if (isFiniteNumber(value) && exceedsPrecision(value)) {
      return true;
    }
  }
  return false;
}

/** The most decimal places among the longitude, latitude and altitude of a position. */
function maxDecimalsOf(position: Position): number {
  return position
    .slice(0, COORDINATE_AXES)
    .reduce(
      (most, value) =>
        isFiniteNumber(value) ? Math.max(most, decimalPlaces(value)) : most,
      0,
    );
}

/** Rounds to the allowed decimals, and turns `-0` into 0. */
function roundCoordinate(value: unknown): unknown {
  if (!isFiniteNumber(value)) {
    return value;
  }
  const rounded = exceedsPrecision(value)
    ? Number(value.toFixed(MAX_DECIMALS))
    : value;
  return rounded === 0 ? 0 : rounded;
}

function roundPosition(position: Position): Position {
  const rounded = position.map((value, axis) =>
    axis < COORDINATE_AXES ? (roundCoordinate(value) as number) : value,
  );
  return rounded.every((value, axis) => Object.is(value, position[axis]))
    ? position
    : rounded;
}

function plural(count: number): string {
  return count === 1 ? "1 position" : `${count} positions`;
}

/**
 * Coordinates written with more than seven decimal places. Seven places of a
 * degree is about a centimetre at the equator, so more only adds file size and
 * false precision. One finding for each geometry, however many positions it
 * holds. The fix rounds longitude, latitude and altitude to seven places.
 */
export const precisionRule: Rule = {
  id: RULE_ID,
  severity: "info",
  confidence: "high",
  summary:
    "Coordinates have more than 7 decimal places; 7 places of longitude or latitude is about a centimetre at the equator.",
  fixable: true,
  needsRegion: false,
  check(feature) {
    const findings: Finding[] = [];
    for (const leaf of leafGeometries(feature)) {
      const { positions: hits } = matchingPositions(leaf, exceedsPrecisionAt);
      const positions = hits.length;
      if (positions > 0) {
        const maxDecimals = hits.reduce(
          (most, position) => Math.max(most, maxDecimalsOf(position)),
          0,
        );
        findings.push({
          ruleId: RULE_ID,
          severity: "info",
          confidence: "high",
          path: pointer(leaf.pointer, "coordinates"),
          message: `Coordinates in ${plural(positions)} have up to ${maxDecimals} decimal places, but ${MAX_DECIMALS} places of longitude or latitude is about a centimetre.`,
          fixable: true,
          data: { maxDecimals, positions },
        });
      }
    }
    return capFindings(findings, precisionRule, feature);
  },
  fix(feature) {
    return fixLeaves(feature, (leaf) => mapPositions(leaf, roundPosition));
  },
};
