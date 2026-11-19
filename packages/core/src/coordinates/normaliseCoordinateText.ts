// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

const ASCII_ZERO = 0x30;
const DIGITS_IN_A_SET = 10;
const DIGIT = /^\p{Nd}$/u;

/** Bidirectional and zero-width marks that text copied from right-to-left pages carries. */
const INVISIBLE = /^[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]$/u;

/**
 * Characters read as another one: dashes and the full-width and small signs
 * become the ASCII sign, the Arabic and full-width separators become the
 * ASCII ones, the Arabic decimal separator becomes a point, and the Arabic
 * thousands separator becomes white space, because a coordinate never has a
 * digit group (no value has more than three whole digits).
 */
const SUBSTITUTES: ReadonlyMap<string, string> = new Map([
  ...[..."\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF0D"].map(
    (char): [string, string] => [char, "-"],
  ),
  ...[..."\uFE62\uFF0B"].map((char): [string, string] => [char, "+"]),
  ["\u060C", ","],
  ["\uFF0C", ","],
  ["\u061B", ";"],
  ["\uFF1B", ";"],
  ["\u066B", "."],
  ["\uFF0E", "."],
  ["\u066C", " "],
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

function pointsIn(run: string): number {
  return run.length - run.replaceAll(".", "").length;
}

/**
 * Reads the commas between digits as decimal marks, in the two layouts where
 * that is not a guess, and only in text with no decimal point at all (so
 * "26.5,28" stays a pair split at the comma, never "26.5.28"): the values
 * are separated by a semicolon, or by white space with a decimal comma in
 * every number (each exactly digits, comma, digits) and no other comma in
 * the text. So "26,5; 28,3" and "26,5 28,3" are pairs, while "26,5, 28,3",
 * "26,5 28.3", "26,28" and "26\u00B030,5' S 28\u00B03,3' E" (not every number has a
 * comma; use a semicolon) are not. A comma between digits is never a
 * thousands separator.
 * @returns The text with those commas written as points, or `null` when the
 * text is not written that way.
 */
export function withDecimalCommas(text: string): string | null {
  if (text.includes(".")) {
    return null;
  }
  let replaced = 0;
  const converted = text.replace(DECIMAL_COMMA, (_match, digit: string) => {
    replaced += 1;
    return `${digit}.`;
  });
  const runs = converted.match(NUMERAL_RUN) ?? [];
  if (replaced === 0 || runs.some((run) => pointsIn(run) > 1)) {
    return null;
  }
  if (converted.includes(";")) {
    return converted;
  }
  const everyNumberHasOne = runs.every((run) => pointsIn(run) === 1);
  return !converted.includes(",") && everyNumberHasOne ? converted : null;
}
