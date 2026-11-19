// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

const ASCII_ZERO = 0x30;
const DIGITS_IN_A_SET = 10;
const DIGIT = /^\p{Nd}$/u;

/** Bidirectional and zero-width marks that text copied from right-to-left pages carries. */
const INVISIBLE = /^[​-‏‪-‮⁦-⁩؜﻿]$/u;

/**
 * Characters read as another one: dashes and the full-width and small signs
 * become the ASCII sign, the Arabic and full-width separators become the
 * ASCII ones, the Arabic decimal separator becomes a point, and the Arabic
 * thousands separator becomes white space, because a coordinate never has a
 * digit group (no value has more than three whole digits).
 */
const SUBSTITUTES: ReadonlyMap<string, string> = new Map([
  ...[..."‐‑‒–—―−﹣－"].map((char): [string, string] => [char, "-"]),
  ...[..."﹢＋"].map((char): [string, string] => [char, "+"]),
  ["،", ","],
  ["，", ","],
  ["؛", ";"],
  ["；", ";"],
  ["٫", "."],
  ["．", "."],
  ["٬", " "],
]);

/**
 * The value of a decimal digit written in any script. Unicode lays each
 * script's digits out as runs of ten from zero to nine, so the value is the
 * distance from the start of the run, modulo ten. A run is at most fifty
 * code points (the mathematical digits), so the walk back is bounded.
 */
function digitValue(codePoint: number): number {
  let start = codePoint;
  while (DIGIT.test(String.fromCodePoint(start - 1))) {
    start -= 1;
  }
  return (codePoint - start) % DIGITS_IN_A_SET;
}

function normaliseChar(char: string): string {
  if (char >= "0" && char <= "9") {
    return char;
  }
  if (INVISIBLE.test(char)) {
    return "";
  }
  if (DIGIT.test(char)) {
    return String.fromCharCode(
      ASCII_ZERO + digitValue(char.codePointAt(0) as number),
    );
  }
  return SUBSTITUTES.get(char) ?? char;
}

/**
 * Rewrites the digits, signs and separators of text from another script or
 * locale as the ASCII ones the coordinate reader knows, and drops
 * bidirectional marks. It works one character at a time, so its cost grows
 * in step with the text.
 */
export function normaliseCoordinateText(text: string): string {
  let result = "";
  for (const char of text) {
    result += normaliseChar(char);
  }
  return result;
}

/** A digit, then a comma with a digit after it: a decimal comma, if the text is written that way. */
const DECIMAL_COMMA = /(\d),(?=\d)/g;
const NUMERAL_RUN = /[\d.]+/g;

/**
 * Reads the commas between digits as decimal marks, in the two layouts where
 * that is not a guess: the values are separated by a semicolon, or by white
 * space with a decimal comma in every number and no other comma in the
 * text. So "26,5; 28,3" and "26,5 28,3" are pairs, while "26,5, 28,3",
 * "26,5 28.3" and "26,28" are not, and a comma stays a separator anywhere
 * else. A comma between digits is never a thousands separator.
 * @returns The text with those commas written as points, or `null` when the
 * text is not written that way.
 */
export function withDecimalCommas(text: string): string | null {
  let replaced = 0;
  const converted = text.replace(DECIMAL_COMMA, (_match, digit: string) => {
    replaced += 1;
    return `${digit}.`;
  });
  if (replaced === 0) {
    return null;
  }
  if (converted.includes(";")) {
    return converted;
  }
  const numbers = converted.match(NUMERAL_RUN)?.length ?? 0;
  return !converted.includes(",") && numbers === replaced ? converted : null;
}
