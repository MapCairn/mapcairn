// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { SearchResult } from "./search";

/** Options for one suggestion request. */
export interface SuggestOptions {
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

/**
 * Offers places that match text the person has only partly typed. It is a
 * separate port from {@link SearchProvider} because the two have different
 * usage terms: a service that suits a submitted search often forbids a request
 * on every keystroke, and one built for typing seldom promises the same data.
 * Each suggestion is a full {@link SearchResult} with a centre and an
 * optional extent, so picking one needs no second lookup.
 *
 * Implementations throw `SearchError` for offline, rate-limited, timed-out or
 * failed requests and `PortAbortError` when the signal fires. When to ask
 * (debounce, a minimum length), cancelling a superseded request and backing
 * off after repeated failures belong to one ui hook. A service's own usage
 * limits belong to its implementation, since every caller shares them.
 */
export interface SuggestionProvider {
  suggest(
    query: string,
    options?: SuggestOptions,
  ): Promise<readonly SearchResult[]>;
}
