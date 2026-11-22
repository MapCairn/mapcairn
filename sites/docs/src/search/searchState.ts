// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * Where the search index is in being fetched. `retrying` is a second or later
 * fetch after a failure, which is shown as loading even with an empty box, so
 * pressing Try again is answered on screen and aloud.
 */
export type IndexStatus = "loading" | "retrying" | "ready" | "error";

/** What the search dialog shows below the box. */
export type SearchView = "hint" | "loading" | "error" | "empty" | "results";

/** What the dialog says about a set of results. */
export interface ResultSummary {
  /** How many results are shown. */
  readonly shown: number;
  /** How many sections matched, which is more than `shown` when the cap cut the list. */
  readonly total: number;
  /** Whether no section had every word, so sections with some of them are shown. */
  readonly partial: boolean;
}

/** Said, and shown, when the index could not be fetched. */
export const ERROR_MESSAGE =
  "Search could not be loaded. Check your connection, then try again.";

/** Said, and shown, after the query when nothing matched. */
export const EMPTY_ADVICE = "Try a shorter word, or the name of an export.";

/** Said, and shown, when no section has every word and some have a few. */
export const PARTIAL_MESSAGE =
  "No section has all of those words. Showing sections with some of them.";

/** The one short line shown in every state but the error, which the box points at. */
export const HINT_LINE =
  "Enter opens the first result when there is one. Down arrow moves through the results. Escape closes. Ctrl or Cmd and K also open search.";

/**
 * The sentence for a list the cap cut short.
 * @param shown - How many results are shown.
 */
export function capMessage(shown: number): string {
  return `Showing the first ${shown} results. Add a word to narrow them.`;
}

/**
 * The sentence for nothing found, the same on screen and aloud.
 * @param query - What is in the box.
 */
export function emptyMessage(query: string): string {
  return `No results for “${query.trim()}”. ${EMPTY_ADVICE}`;
}

/**
 * Chooses what the dialog shows. A failed index is shown at once, so the
 * person is not left typing into a box that cannot answer; a retry is shown as
 * loading; an empty box shows the hint; otherwise loading, results or nothing
 * found.
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
  if (status === "retrying") {
    return "loading";
  }
  if (query.trim() === "") {
    return "hint";
  }
  if (status === "loading") {
    return "loading";
  }
  return count > 0 ? "results" : "empty";
}

/** The count of what is shown, in words: the cap wording when the list was cut, never a shown count that is less than what matched. */
function countSentence(summary: ResultSummary): string {
  if (summary.total > summary.shown) {
    return capMessage(summary.shown);
  }
  return summary.shown === 1 ? "1 result" : `${summary.shown} results`;
}

/** The count, then the note that the words were only partly matched, as sentences. */
function resultsAnnouncement(summary: ResultSummary): string {
  const count = countSentence(summary);
  if (!summary.partial) {
    return count;
  }
  const sentence = count.endsWith(".") ? count : `${count}.`;
  return `${sentence} ${PARTIAL_MESSAGE}`;
}

/**
 * The sentence a screen reader hears when the view changes, for the polite
 * live region. The hint is static text and is not announced.
 * @param view - What is shown.
 * @param query - What is in the box.
 * @param summary - What the results are.
 */
export function announcement(
  view: SearchView,
  query: string,
  summary: ResultSummary,
): string {
  switch (view) {
    case "results":
      return resultsAnnouncement(summary);
    case "empty":
      return emptyMessage(query);
    case "loading":
      return "Loading search";
    case "error":
      return ERROR_MESSAGE;
    case "hint":
      return "";
  }
}
