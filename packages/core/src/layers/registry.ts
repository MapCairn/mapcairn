/**
 * A read-only set of named plug-ins, such as decoders or formatters. A
 * definition names what it needs; the registry supplies it. `with` and
 * `without` return new registries, so a shared one is never changed.
 */
export interface NamedRegistry<T> {
  get(name: string): T | undefined;
  has(name: string): boolean;
  /** Every registered name, in the order added. */
  names(): readonly string[];
  /** A copy with `items` added, replacing any of the same name. */
  with(items: Readonly<Record<string, T>>): NamedRegistry<T>;
  /** A copy without `name`. */
  without(name: string): NamedRegistry<T>;
}

/** Builds a {@link NamedRegistry} over a fixed set of entries. */
export function createNamedRegistry<T>(
  entries: Iterable<readonly [string, T]>,
): NamedRegistry<T> {
  const items = new Map(entries);
  return {
    get: (name) => items.get(name),
    has: (name) => items.has(name),
    names: () => [...items.keys()],
    with: (extra) => createNamedRegistry([...items, ...Object.entries(extra)]),
    without: (name) =>
      createNamedRegistry([...items].filter(([key]) => key !== name)),
  };
}
