// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Bounds, LatLng } from "./geometry";

/** A place a search found. */
export interface SearchResult {
  /** Identifies the place among the results. */
  readonly id: string;
  /** The place's name, as shown in the list. */
  readonly label: string;
  /** A second line, such as the region or country. */
  readonly secondaryLabel?: string;
  /** Where the map centres when the result is chosen. */
  readonly centre: LatLng;
  /** When present, the map fits these bounds instead of centring on a point. */
  readonly bounds?: Bounds;
}

/** Options for a search or a reverse lookup. */
export interface SearchOptions {
  /**
   * Favour results inside this box. Optional: an adapter sends it to its
   * service, so a host passes it only when its privacy text says so.
   */
  readonly bias?: Bounds;
  /** The most results to return. */
  readonly limit?: number;
  /** Cancels the request. It then rejects with a `PortAbortError`. */
  readonly signal?: AbortSignal;
}

/**
 * Finds places by name. Implementations throw `SearchError` for offline,
 * rate-limited or failed requests and `PortAbortError` when the signal fires.
 * When a search runs, and cancelling a superseded one, belong to one ui hook.
 * A service's own usage limits (such as Nominatim's one request per second)
 * belong to its implementation, since every caller shares them.
 */
export interface SearchProvider {
  /** Finds places that match the text. A blank query resolves to an empty list. */
  search(
    query: string,
    options?: SearchOptions,
  ): Promise<readonly SearchResult[]>;
  /** Finds the place at a position, or `null` when there is none. */
  reverse(
    position: LatLng,
    options?: Pick<SearchOptions, "signal">,
  ): Promise<SearchResult | null>;
}
