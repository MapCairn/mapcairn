/**
 * Reads a value by dotted path, such as `properties.url.geometry` or
 * `geometry.coordinates.2`. Returns `undefined` when any step is missing or
 * passes through a primitive. Only own properties are read, so a path in a
 * definition can never reach `__proto__` or `constructor`.
 */
export function readPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const step of path.split(".")) {
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.hasOwn(current, step)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[step];
  }
  return current;
}
