import {
  announceCoordinateResult,
  announceNoResults,
  announceSearchError,
  announceSearchResults,
  type Bounds,
  coordinateSearchResult,
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchProvider } from "../../services/hooks";
import { useAnnounce } from "../../ui/LiveRegion";

/** The fewest characters (after trimming) that a submitted search needs. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * The one message shown for every kind of failed search. The next step is in
 * the sentence and in the Retry button beside it; the screen reader hears the
 * more specific, per-kind wording through the announcer instead.
 */
export const SEARCH_UNAVAILABLE_MESSAGE =
  "Search is unavailable right now. Please try again.";

/** Where a search stands. Exactly one of these is true at a time. */
export type SearchState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "results"; readonly results: readonly SearchResult[] }
  | { readonly status: "empty" }
  | { readonly status: "error"; readonly kind: SearchErrorKind };

/** Options for {@link useSearch}. */
export interface UseSearchOptions {
  /**
   * Returns the box to favour results inside, usually the visible map. Called
   * once when each search starts, so the bias follows the map without the
   * caller recomputing it on every frame.
   */
  readonly getBias?: () => Bounds | undefined;
}

/** What {@link useSearch} returns. */
export interface UseSearch {
  /** The text in the search box. */
  readonly query: string;
  /** Where the search stands. */
  readonly state: SearchState;
  /**
   * Sets the text as the user typed it. Never searches: it cancels any search
   * in flight and returns to `idle`, so results for older text never sit
   * under new text.
   */
  readonly setQuery: (query: string) => void;
  /**
   * Searches for the current text, for Enter or the Search button. Answers a
   * coordinate pair itself, without the provider. Does
   * nothing when the trimmed text is shorter than {@link MIN_SEARCH_LENGTH},
   * or when the text's own search is already loading or showing its outcome
   * (after a failure it searches again).
   */
  readonly submit: () => void;
  /**
   * Puts text in the box without searching: cancels anything in flight and
   * returns to `idle`. Used when the user picks a result, so the box shows
   * its label.
   */
  readonly settle: (query: string) => void;
  /** Empties the box and cancels everything. */
  readonly clear: () => void;
  /** Runs the current query again at once, for the Retry button. */
  readonly retry: () => void;
}

const IDLE: SearchState = { status: "idle" };

/**
 * Cancellable place search over the services' `SearchProvider`, run only
 * when the user submits. Text that is a coordinate pair, such as
 * `-26.2041, 28.0473` or `26°12'14.8"S 28°02'50.3"E`, is answered here with
 * one result for that place and never reaches the provider, so it sends no
 * request. Nothing is sent while they type, as the
 * OpenStreetMap Foundation's Nominatim policy forbids client-side
 * autocomplete. This is the one place that owns the `AbortController`: each
 * search aborts the one before it, and an aborted request never changes state
 * or reaches the announcer. The provider itself keeps to the service's rate
 * limit.
 *
 * Announcements go through the app-wide announcer: the result count (or "No
 * results", or the error) once the search settles. An identical message is
 * not repeated for consecutive searches until the box has been emptied or
 * Retry is pressed.
 */
export function useSearch({ getBias }: UseSearchOptions = {}): UseSearch {
  const provider = useSearchProvider();
  const announce = useAnnounce();
  const providerRef = useLatestRef(provider);
  const announceRef = useLatestRef(announce);
  const getBiasRef = useLatestRef(getBias);

  const [query, setQueryState] = useState("");
  const [state, setState] = useState<SearchState>(IDLE);
  const stateRef = useLatestRef(state);
  const queryRef = useRef("");
  const controller = useRef<AbortController | null>(null);
  const lastAnnounced = useRef<string | null>(null);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const announceOnce = useCallback(
    (message: string, priority: "polite" | "assertive") => {
      if (message === lastAnnounced.current) {
        return;
      }
      lastAnnounced.current = message;
      announceRef.current(message, { priority });
    },
    [announceRef],
  );

  const showResults = useCallback(
    (results: readonly SearchResult[], message: string) => {
      setState({ status: "results", results });
      announceOnce(message, "polite");
    },
    [announceOnce],
  );

  const run = useCallback(
    async (text: string) => {
      controller.current?.abort();
      const coordinates = coordinateSearchResult(text);
      if (coordinates !== null) {
        controller.current = null;
        showResults([coordinates], announceCoordinateResult(coordinates.label));
        return;
      }
      const own = new AbortController();
      controller.current = own;
      setState({ status: "loading" });
      try {
        const results = await providerRef.current.search(text, {
          bias: getBiasRef.current?.(),
          signal: own.signal,
        });
        if (own.signal.aborted) {
          return;
        }
        if (results.length === 0) {
          setState({ status: "empty" });
          announceOnce(announceNoResults(), "polite");
        } else {
          showResults(results, announceSearchResults(results.length));
        }
      } catch (error) {
        if (own.signal.aborted || error instanceof PortAbortError) {
          return;
        }
        const kind: SearchErrorKind =
          error instanceof SearchError ? error.kind : "failed";
        setState({ status: "error", kind });
        announceOnce(announceSearchError(kind), "assertive");
      }
    },
    [providerRef, getBiasRef, announceOnce, showResults],
  );

  const setQuery = useCallback(
    (next: string) => {
      queryRef.current = next;
      setQueryState(next);
      cancel();
      if (next.trim().length < MIN_SEARCH_LENGTH) {
        lastAnnounced.current = null;
      }
      setState(IDLE);
    },
    [cancel],
  );

  const submit = useCallback(() => {
    const trimmed = queryRef.current.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      return;
    }
    // Any state but idle or error belongs to this same text: setQuery and
    // settle are the only ways the text changes, and both return to idle.
    const status = stateRef.current.status;
    if (status !== "idle" && status !== "error") {
      return;
    }
    void run(trimmed);
  }, [run, stateRef]);

  const settle = useCallback(
    (next: string) => {
      queryRef.current = next;
      setQueryState(next);
      cancel();
      lastAnnounced.current = null;
      setState(IDLE);
    },
    [cancel],
  );

  const clear = useCallback(() => {
    settle("");
  }, [settle]);

  const retry = useCallback(() => {
    const trimmed = queryRef.current.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      return;
    }
    cancel();
    lastAnnounced.current = null;
    void run(trimmed);
  }, [cancel, run]);

  useEffect(() => cancel, [cancel]);

  return { query, state, setQuery, submit, settle, clear, retry };
}
