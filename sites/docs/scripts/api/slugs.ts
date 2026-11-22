// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** What a page's name is built from. */
export interface Sluggable {
  readonly name: string;
  readonly kind: string;
}

/**
 * Makes a name safe as a file name and URL segment: letters, digits, `-` and
 * `_` stay, anything else becomes `-`. A leading underscore is replaced,
 * because the documentation framework ignores a file that starts with one.
 */
export function slugOf(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_-]/g, "-");
  return safe.startsWith("_") ? `x${safe}` : safe;
}

/**
 * Chooses a distinct file name for each export of a module. A name is its own
 * file name, with the case kept so the address reads as the code does. Two
 * names that differ only by case would be one file on a case-insensitive disk,
 * and an export may share a name with a folder or the module's `index` page,
 * so each of those gets its kind added (`tokens-variable`).
 * @param items - The exports, in a stable order.
 * @param reserved - File names an export may not take.
 * @returns The file name without its extension, in the order of `items`.
 */
export function allocateSlugs(
  items: readonly Sluggable[],
  reserved: ReadonlySet<string>,
): string[] {
  const reservedFolded = new Set(
    [...reserved].map((name) => name.toLowerCase()),
  );
  const counts = new Map<string, number>();
  for (const item of items) {
    const folded = slugOf(item.name).toLowerCase();
    counts.set(folded, (counts.get(folded) ?? 0) + 1);
  }
  return items.map((item) => {
    const slug = slugOf(item.name);
    const folded = slug.toLowerCase();
    const taken = (counts.get(folded) ?? 0) > 1 || reservedFolded.has(folded);
    return taken ? `${slug}-${item.kind.toLowerCase()}` : slug;
  });
}
