// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MountServices } from "../types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Whether two values hold the same plain data: equal primitives, functions and
 * other objects by identity, and arrays and plain objects by their contents,
 * all the way down. A page that builds its definitions again on every render
 * gives the element new objects with the same data, and that is not a change.
 */
export function samePlainData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length && a.every((item, at) => samePlainData(item, b[at]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every(
        (key) => Object.hasOwn(b, key) && samePlainData(a[key], b[key]),
      )
    );
  }
  return false;
}

/**
 * Whether two sets of providers are the same: the same names, each with the
 * same provider object. A provider is an object with behaviour, so it is
 * compared by identity and never by its contents.
 */
export function sameServices(
  a: MountServices | undefined,
  b: MountServices | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  const keys = Object.keys(a) as (keyof MountServices)[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && a[key] === b[key])
  );
}
