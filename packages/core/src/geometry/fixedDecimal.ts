// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A number as `String` writes it in exponent notation: sign, digits, point, exponent. */
const EXPONENT_FORM = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/;

/**
 * A JSON string, or a number written with an exponent. The string is matched
 * first so that text inside a string is never mistaken for a number.
 */
const STRING_OR_EXPONENT_NUMBER =
  /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?[eE][+-]?\d+/g;

/**
 * A finite number as plain decimal text, with no exponent: the digits
 * `String` gives, which are the fewest that read back as the same number,
 * with the decimal point moved. A number `String` already writes without an
 * exponent comes back exactly as `String` writes it, so text that was valid
 * before is unchanged. `7.8e-7` is `0.00000078`; `1e21` is a one and 21 zeros.
 * Some readers of Well-Known Text and CSV do not accept an exponent.
 */
export function fixedDecimal(value: number): string {
  const text = String(value);
  const match = EXPONENT_FORM.exec(text);
  if (match === null) {
    return text;
  }
  const [, sign = "", whole = "", fraction = "", exponent = "0"] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) {
    return `${sign}0.${"0".repeat(-point)}${digits}`;
  }
  // `String` writes an exponent only under 1e-6 or from 1e21 up, and a number
  // has at most 17 digits, so a positive exponent always puts the point after
  // the last digit.
  return `${sign}${digits}${"0".repeat(point - digits.length)}`;
}

/**
 * JSON text with every number that was written with an exponent written as
 * plain decimal text instead, with {@link fixedDecimal}. Strings are left as
 * they are. The result is still JSON, and equals the input when it holds no
 * exponent.
 */
export function withFixedDecimals(json: string): string {
  return json.replace(STRING_OR_EXPONENT_NUMBER, (match) =>
    match.startsWith('"') ? match : fixedDecimal(Number(match)),
  );
}
