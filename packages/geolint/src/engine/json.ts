// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

/** A JSON object: not null, not an array. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** Whether a value is a JSON object (not null, not an array). */
export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value is a finite number. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether a value is a position: an array of at least two finite numbers
 * (longitude, latitude, optional altitude and more). RFC 7946 allows three
 * elements; more are accepted here and left to the `structure` rule.
 */
export function isPosition(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

/** Escapes one reference token for a JSON pointer (RFC 6901). */
export function escapePointerToken(token: string | number): string {
  return String(token).replaceAll("~", "~0").replaceAll("/", "~1");
}

/** Appends tokens to a JSON pointer. */
export function pointer(
  base: string,
  ...tokens: readonly (string | number)[]
): string {
  return tokens.reduce<string>(
    (path, token) => `${path}/${escapePointerToken(token)}`,
    base,
  );
}
