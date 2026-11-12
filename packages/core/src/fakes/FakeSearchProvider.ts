// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SearchError, type SearchErrorKind } from "../ports/errors";
import type { LatLng } from "../ports/geometry";
import type {
  SearchOptions,
  SearchProvider,
  SearchResult,
} from "../ports/search";
import {
  abortable,
  createDeferred,
  type Deferred,
  type HeldCall,
} from "./internal";

/** A recorded call to {@link FakeSearchProvider.search}. */
export interface RecordedSearchCall {
  readonly query: string;
  readonly options: SearchOptions | undefined;
}

/** A recorded call to {@link FakeSearchProvider.reverse}. */
export interface RecordedReverseCall {
  readonly position: LatLng;
  readonly options: Pick<SearchOptions, "signal"> | undefined;
}

/**
 * Handle for a request held with {@link FakeSearchProvider.holdNext}.
 * For a `reverse` call, `resolve(results)` yields the first result, or
 * `null` when the list is empty.
 */
export type HeldSearchCall = HeldCall<readonly SearchResult[]>;

/**
 * A scripted {@link SearchProvider} with no network and no timers.
 *
 * How to script it:
 * - `setResults(query, results)` answers one query; `setDefaultResults`
 *   answers every other query (empty by default). Queries are matched after
 *   trimming.
 * - `setReverseResult(result | null)` answers every `reverse` call.
 * - `failWith(kind)` makes every call reject with a `SearchError` until
 *   `clearFailure()`.
 * - `holdNext()` keeps the next `search` or `reverse` call pending until the
 *   returned handle resolves or rejects it. Holds queue in order.
 * - A blank query resolves to an empty array without using any script.
 * - Every call honours its `AbortSignal` by rejecting with `PortAbortError`.
 * - `searchCalls` and `reverseCalls` record what the ui asked.
 */
export class FakeSearchProvider implements SearchProvider {
  readonly searchCalls: RecordedSearchCall[] = [];
  readonly reverseCalls: RecordedReverseCall[] = [];

  #byQuery = new Map<string, readonly SearchResult[]>();
  #defaultResults: readonly SearchResult[] = [];
  #reverseResult: SearchResult | null = null;
  #failure: SearchErrorKind | null = null;
  #holds: Deferred<readonly SearchResult[]>[] = [];

  /** Answers searches for `query` (trimmed) with `results`. */
  setResults(query: string, results: readonly SearchResult[]): void {
    this.#byQuery.set(query.trim(), results);
  }

  /** Answers every query that has no specific script. */
  setDefaultResults(results: readonly SearchResult[]): void {
    this.#defaultResults = results;
  }

  /** Sets what `reverse` finds. `null` means there is no place there. */
  setReverseResult(result: SearchResult | null): void {
    this.#reverseResult = result;
  }

  /** Makes every later call reject with a `SearchError` of this kind. */
  failWith(kind: SearchErrorKind): void {
    this.#failure = kind;
  }

  /** Stops {@link FakeSearchProvider.failWith} failing calls. */
  clearFailure(): void {
    this.#failure = null;
  }

  /** Holds the next call (search or reverse) until the handle settles it. */
  holdNext(): HeldSearchCall {
    const deferred = createDeferred<readonly SearchResult[]>();
    this.#holds.push(deferred);
    return deferred;
  }

  search(
    query: string,
    options?: SearchOptions,
  ): Promise<readonly SearchResult[]> {
    this.searchCalls.push({ query, options });
    return abortable(() => {
      const key = query.trim();
      if (key === "") {
        return Promise.resolve([]);
      }
      return this.#answer(() => this.#byQuery.get(key) ?? this.#defaultResults);
    }, options?.signal);
  }

  reverse(
    position: LatLng,
    options?: Pick<SearchOptions, "signal">,
  ): Promise<SearchResult | null> {
    this.reverseCalls.push({ position, options });
    return abortable(async () => {
      const results = await this.#answer(() =>
        this.#reverseResult === null ? [] : [this.#reverseResult],
      );
      return results[0] ?? null;
    }, options?.signal);
  }

  #answer(
    scripted: () => readonly SearchResult[],
  ): Promise<readonly SearchResult[]> {
    const hold = this.#holds.shift();
    if (hold !== undefined) {
      return hold.promise;
    }
    if (this.#failure !== null) {
      return Promise.reject(new SearchError(this.#failure));
    }
    return Promise.resolve(scripted());
  }
}
