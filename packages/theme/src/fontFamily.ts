// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** The longest font-family list accepted, in characters. */
export const MAX_FONT_FAMILY_LENGTH = 512;

/** Why a field other than a colour could not be used. */
export type InvalidThemeFieldReason =
  | "not-a-string"
  | "too-long"
  | "forbidden-character"
  | "malformed"
  | "reserved-keyword";

/** The result of reading a font-family list. */
export type FontFamilyReading =
  | { ok: true; value: string }
  | { ok: false; reason: InvalidThemeFieldReason };

/**
 * The only characters a list may hold: letters, marks and numbers in any
 * script, a plain space, a comma, a hyphen, an underscore, a full stop and the
 * two quote marks. Everything that could end a declaration, open a block, a
 * comment, a function or an escape, or break a line is outside it.
 */
const ALLOWED_CHARACTERS = /^[\p{L}\p{M}\p{N} ,"'_.-]*$/u;

/** A quoted family name: one kind of quote around a name with no quote in it. */
const QUOTED_NAME = /^(["'])[\p{L}\p{M}\p{N}_.-][\p{L}\p{M}\p{N}_. -]*\1$/u;

/** An unquoted family name: identifiers, each starting with a letter, separated by one space. */
const UNQUOTED_NAME = /^-?[A-Za-z_][\w-]*(?: -?[A-Za-z_][\w-]*)*$/;

/** Words that mean something else as a whole value, so they are not family names. */
const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "default",
]);

type ItemReading = "ok" | "malformed" | "reserved-keyword";

function readItem(item: string): ItemReading {
  if (QUOTED_NAME.test(item)) {
    return "ok";
  }
  if (!UNQUOTED_NAME.test(item)) {
    return "malformed";
  }
  return RESERVED_KEYWORDS.has(item.toLowerCase()) ? "reserved-keyword" : "ok";
}

/**
 * Reads a font-family list from a host: comma-separated family names, each
 * quoted or a plain identifier, which covers the generic families as well.
 * Nothing else passes, so the value cannot carry a declaration, a rule, a
 * comment, `url()` or `var()` into a stylesheet. The result is written with
 * one comma and space between items.
 */
export function readFontFamily(value: unknown): FontFamilyReading {
  if (typeof value !== "string") {
    return { ok: false, reason: "not-a-string" };
  }
  if (value.length > MAX_FONT_FAMILY_LENGTH) {
    return { ok: false, reason: "too-long" };
  }
  if (!ALLOWED_CHARACTERS.test(value)) {
    return { ok: false, reason: "forbidden-character" };
  }
  const items = value.split(",").map((item) => item.trim());
  const readings = items.map(readItem);
  if (readings.includes("malformed")) {
    return { ok: false, reason: "malformed" };
  }
  if (readings.includes("reserved-keyword")) {
    return { ok: false, reason: "reserved-keyword" };
  }
  return { ok: true, value: items.join(", ") };
}
