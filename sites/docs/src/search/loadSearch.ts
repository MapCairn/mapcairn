// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SearchRecord } from "../../scripts/searchRecords";
import { createSearch, type Search } from "./searchEngine";

let pending: Promise<Search> | null = null;

/**
 * Fetches the search index from this origin and builds the search, once: a
 * second call, such as reopening the dialog, gets the same search. A failure
 * is forgotten, so the next call tries again.
 * @param url - Where the build put `search-index.json`.
 */
export function loadSearch(url: string): Promise<Search> {
  if (pending === null) {
    // biome-ignore lint/style/noRestrictedGlobals: the documentation site is not the SDK; the index is a same-origin static file the build wrote
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index answered ${response.status}`);
        }
        return response.json() as Promise<SearchRecord[]>;
      })
      .then(createSearch)
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}
