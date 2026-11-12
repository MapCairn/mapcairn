// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * How many levels of arrays and objects {@link jsonEqual} follows. A value
 * nested deeper is reported as different rather than compared, so data from a
 * server cannot overflow the stack. Layer definitions nest far less deeply.
 */
export const MAX_JSON_DEPTH = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arraysEqual(
  a: readonly unknown[],
  b: readonly unknown[],
  depth: number,
): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => equalWithin(item, b[i], depth + 1))
  );
}

function recordsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  depth: number,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && equalWithin(a[key], b[key], depth + 1),
    )
  );
}

function equalWithin(a: unknown, b: unknown, depth: number): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return depth < MAX_JSON_DEPTH && arraysEqual(a, b, depth);
  }
  if (isRecord(a) && isRecord(b)) {
    return depth < MAX_JSON_DEPTH && recordsEqual(a, b, depth);
  }
  return a === b;
}

/**
 * Whether two JSON-shaped values hold the same data: the same primitives, in
 * arrays of the same order and objects with the same own keys, whatever order
 * the keys are in. It is for data that came from JSON, so it does not handle
 * cycles, dates or class instances. Arrays and objects nested
 * {@link MAX_JSON_DEPTH} levels deep or more are never equal, so a very deep
 * value counts as changed.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return equalWithin(a, b, 0);
}
