import type { Bounds, LatLng } from "./geometry";

/** A place a search found. */
export interface SearchResult {
  readonly id: string;
  readonly label: string;
  readonly secondaryLabel?: string;
  readonly centre: LatLng;
  /** When present, the map fits these bounds instead of centring on a point. */
  readonly bounds?: Bounds;
}

/** Options for a search or a reverse lookup. */
export interface SearchOptions {
  /** Favour results inside this box. */
  readonly bias?: Bounds;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

/**
 * Finds places by name. Implementations throw `SearchError` for offline,
 * rate-limited or failed requests and `PortAbortError` when the signal fires.
 * Debounce and cancellation live in one ui hook, never in an implementation.
 */
export interface SearchProvider {
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
