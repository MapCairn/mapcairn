// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A number as `String` writes it in exponent notation: sign, digits, point, exponent. */
const EXPONENT_FORM = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/;

/** The characters a JSON number is made of, once it has begun with a digit or a minus. */
const NUMBER_CHARACTER = /[0-9+\-.eE]/;

/** The index just past the string that opens at `start`, or the end of the text when it never closes. */
function endOfString(json: string, start: number): number {
  let index = start + 1;
  while (index < json.length && json.charAt(index) !== '"') {
    index += json.charAt(index) === "\\" ? 2 : 1;
  }
  return Math.min(index + 1, json.length);
}

/** The index just past the run of number characters that begins at `start`. */
function endOfNumber(json: string, start: number): number {
  let index = start + 1;
  while (index < json.length && NUMBER_CHARACTER.test(json.charAt(index))) {
    index += 1;
  }
  return index;
}

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

/** A number of JSON text, in plain decimal text when it was written with an exponent. */
function numberText(token: string): string {
  const value = Number(token);
  return /[eE]/.test(token) && Number.isFinite(value)
    ? fixedDecimal(value)
    : token;
}

/**
 * JSON text with every number that was written with an exponent written as
 * plain decimal text instead, with {@link fixedDecimal}. Strings are left as
 * they are. The result is still JSON, and equals the input when it holds no
 * exponent. The text is read once, from left to right, so the time taken is in
 * proportion to its length whatever it holds.
 */
export function withFixedDecimals(json: string): string {
  const parts: string[] = [];
  let index = 0;
  while (index < json.length) {
    const char = json.charAt(index);
    let end = index + 1;
    if (char === '"') {
      end = endOfString(json, index);
      parts.push(json.slice(index, end));
    } else if (char === "-" || (char >= "0" && char <= "9")) {
      end = endOfNumber(json, index);
      parts.push(numberText(json.slice(index, end)));
    } else {
      parts.push(char);
    }
    index = end;
  }
  return parts.join("");
}
