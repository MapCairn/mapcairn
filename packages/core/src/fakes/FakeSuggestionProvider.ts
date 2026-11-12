import { SearchError, type SearchErrorKind } from "../ports/errors";
import type { SearchResult } from "../ports/search";
import type { SuggestionProvider, SuggestOptions } from "../ports/suggestions";
import {
  abortable,
  createDeferred,
  type Deferred,
  type HeldCall,
} from "./internal";

/** A recorded call to {@link FakeSuggestionProvider.suggest}. */
export interface RecordedSuggestCall {
  readonly query: string;
  readonly options: SuggestOptions | undefined;
}

/** Handle for a request held with {@link FakeSuggestionProvider.holdNext}. */
export type HeldSuggestCall = HeldCall<readonly SearchResult[]>;

/**
 * A scripted {@link SuggestionProvider} with no network and no timers.
 *
 * How to script it:
 * - `setResults(query, results)` answers one query; `setDefaultResults`
 *   answers every other query (empty by default). Queries are matched after
 *   trimming.
 * - `failWith(kind)` makes every call reject with a `SearchError` until
 *   `clearFailure()`.
 * - `holdNext()` keeps the next call pending until the returned handle
 *   resolves or rejects it. Holds queue in order.
 * - A blank query resolves to an empty array without using any script.
 * - Every call honours its `AbortSignal` by rejecting with `PortAbortError`.
 * - `suggestCalls` records what the ui asked.
 */
export class FakeSuggestionProvider implements SuggestionProvider {
  readonly suggestCalls: RecordedSuggestCall[] = [];

  #byQuery = new Map<string, readonly SearchResult[]>();
  #defaultResults: readonly SearchResult[] = [];
  #failure: SearchErrorKind | null = null;
  #holds: Deferred<readonly SearchResult[]>[] = [];

  /** Answers suggestions for `query` (trimmed) with `results`. */
  setResults(query: string, results: readonly SearchResult[]): void {
    this.#byQuery.set(query.trim(), results);
  }

  /** Answers every query that has no specific script. */
  setDefaultResults(results: readonly SearchResult[]): void {
    this.#defaultResults = results;
  }

  /** Makes every later call reject with a `SearchError` of this kind. */
  failWith(kind: SearchErrorKind): void {
    this.#failure = kind;
  }

  /** Stops {@link FakeSuggestionProvider.failWith} failing calls. */
  clearFailure(): void {
    this.#failure = null;
  }

  /** Holds the next call until the handle settles it. */
  holdNext(): HeldSuggestCall {
    const deferred = createDeferred<readonly SearchResult[]>();
    this.#holds.push(deferred);
    return deferred;
  }

  suggest(
    query: string,
    options?: SuggestOptions,
  ): Promise<readonly SearchResult[]> {
    this.suggestCalls.push({ query, options });
    return abortable(() => {
      const key = query.trim();
      if (key === "") {
        return Promise.resolve([]);
      }
      const hold = this.#holds.shift();
      if (hold !== undefined) {
        return hold.promise;
      }
      if (this.#failure !== null) {
        return Promise.reject(new SearchError(this.#failure));
      }
      return Promise.resolve(this.#byQuery.get(key) ?? this.#defaultResults);
    }, options?.signal);
  }
}
