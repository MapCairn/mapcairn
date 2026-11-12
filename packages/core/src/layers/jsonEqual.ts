// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]));
}

function recordsEqual(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && jsonEqual(a[key], b[key]))
  );
}

/**
 * Whether two JSON-shaped values hold the same data: the same primitives, in
 * arrays of the same order and objects with the same keys, whatever order the
 * keys are in. It is for data that came from JSON, so it does not handle
 * cycles, dates or class instances.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return arraysEqual(a, b);
  }
  if (isRecord(a) && isRecord(b)) {
    return recordsEqual(a, b);
  }
  return a === b;
}
