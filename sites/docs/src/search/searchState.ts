// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** Where the search index is in being fetched. */
export type IndexStatus = "loading" | "ready" | "error";

/** What the search dialog shows below the box. */
export type SearchView = "hint" | "loading" | "error" | "empty" | "results";

/**
 * Chooses what the dialog shows. A failed index is shown at once, so the
 * person is not left typing into a box that cannot answer; an empty box shows
 * the hint; otherwise loading, results or nothing found.
 * @param status - How the index fetch is going.
 * @param query - What is in the box.
 * @param count - How many results the query has.
 */
export function viewFor(
  status: IndexStatus,
  query: string,
  count: number,
): SearchView {
  if (status === "error") {
    return "error";
  }
  if (query.trim() === "") {
    return "hint";
  }
  if (status === "loading") {
    return "loading";
  }
  return count > 0 ? "results" : "empty";
}

/**
 * The sentence a screen reader hears when the view changes, for the polite
 * live region. The hint is static text and is not announced.
 * @param view - What is shown.
 * @param query - What is in the box.
 * @param count - How many results there are.
 */
export function announcement(
  view: SearchView,
  query: string,
  count: number,
): string {
  switch (view) {
    case "results":
      return count === 1 ? "1 result" : `${count} results`;
    case "empty":
      return `No results for “${query.trim()}”`;
    case "loading":
      return "Loading search";
    case "error":
      return "Search could not be loaded";
    case "hint":
      return "";
  }
}
