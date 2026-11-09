import {
  announceNoResults,
  announceSearchError,
  announceSearchResults,
  type Bounds,
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
} from "@karta/core";
import { useLatestRef } from "@karta/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchProvider } from "../../services/hooks";
import { useAnnounce } from "../../ui/LiveRegion";

/** How long typing must pause before a search starts. */
export const SEARCH_DEBOUNCE_MS = 260;

/** The fewest characters (after trimming) that start a search. */
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
  /** Favour results inside this box. Read when each search starts. */
  readonly bias?: Bounds;
}

/** What {@link useSearch} returns. */
export interface UseSearch {
  /** The text in the search box. */
  readonly query: string;
  /** Where the search stands. */
  readonly state: SearchState;
  /**
   * Sets the text as the user typed it. Starts a search after
   * {@link SEARCH_DEBOUNCE_MS} of quiet when it has at least
   * {@link MIN_SEARCH_LENGTH} characters, and cancels anything older.
   */
  readonly setQuery: (query: string) => void;
  /**
   * Puts text in the box without searching: cancels anything pending or in
   * flight and returns to `idle`. Used when the user picks a result, so the
   * label that fills the box does not search for itself. It is an action, not
   * a flag, so there is nothing to forget to reset.
   */
  readonly settle: (query: string) => void;
  /** Empties the box and cancels everything. */
  readonly clear: () => void;
  /** Runs the current query again at once, for the Retry button. */
  readonly retry: () => void;
}

const IDLE: SearchState = { status: "idle" };

/**
 * Debounced, cancellable place search over the services' `SearchProvider`.
 * This is the one place that owns the debounce and the `AbortController`:
 * each query aborts the one before it, and an aborted request never changes
 * state or reaches the announcer.
 *
 * Announcements go through the app-wide announcer: the result count (or "No
 * results", or the error) once the search settles. An identical message is
 * not repeated for consecutive searches until the box has been emptied or
 * Retry is pressed.
 */
export function useSearch({ bias }: UseSearchOptions = {}): UseSearch {
  const provider = useSearchProvider();
  const announce = useAnnounce();
  const providerRef = useLatestRef(provider);
  const announceRef = useLatestRef(announce);
  const biasRef = useLatestRef(bias);

  const [query, setQueryState] = useState("");
  const [state, setState] = useState<SearchState>(IDLE);
  const queryRef = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastAnnounced = useRef<string | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
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

  const run = useCallback(
    async (text: string) => {
      controller.current?.abort();
      const own = new AbortController();
      controller.current = own;
      setState({ status: "loading" });
      try {
        const results = await providerRef.current.search(text, {
          bias: biasRef.current,
          signal: own.signal,
        });
        if (own.signal.aborted) {
          return;
        }
        if (results.length === 0) {
          setState({ status: "empty" });
          announceOnce(announceNoResults(), "polite");
        } else {
          setState({ status: "results", results });
          announceOnce(announceSearchResults(results.length), "polite");
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
    [providerRef, biasRef, announceOnce],
  );

  const setQuery = useCallback(
    (next: string) => {
      queryRef.current = next;
      setQueryState(next);
      cancel();
      const trimmed = next.trim();
      if (trimmed.length < MIN_SEARCH_LENGTH) {
        lastAnnounced.current = null;
        setState(IDLE);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        void run(trimmed);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancel, run],
  );

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

  return { query, state, setQuery, settle, clear, retry };
}
