// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** One entry of a route table, as `@react-router/dev/routes` builds it. */
interface RouteEntry {
  readonly path?: string;
  readonly index?: boolean;
  readonly children?: readonly RouteEntry[];
}

/** The page path an entry serves itself: `""` for the index, none for a layout. */
function ownPath(entry: RouteEntry): string[] {
  if (entry.index) {
    return [""];
  }
  return entry.path === undefined ? [] : [entry.path];
}

/**
 * Every page path a route table serves, nested routes included: `""` for the
 * index and each route's own path. A layout route without a path adds none of
 * its own. The sitemap, `llms.txt` and the route table's tests read the table
 * through it.
 */
export function routePaths(entries: readonly RouteEntry[]): string[] {
  return entries.flatMap((entry) => [
    ...ownPath(entry),
    ...routePaths(entry.children ?? []),
  ]);
}
