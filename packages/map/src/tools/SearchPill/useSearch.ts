// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceCoordinateResult,
  announceNoResults,
  announceSearchError,
  announceSearchPicked,
  announceSearchResults,
  type Bounds,
  coordinateSearchResult,
  type Message,
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMessages, useSearchProvider } from "../../services/hooks";
import { useAnnounce } from "../../ui/LiveRegion";

/**
 * The fewest characters (after trimming) that a submitted search needs.
 *
 * @internal
 */
export const MIN_SEARCH_LENGTH = 2;

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
   * caller recomputing it on every frame. Leave it out to send only the
   * query: a host that passes it sends that box to its geocoder with every
   * search, which can show where the person is, so its privacy text must say so.
   */
  readonly getBias?: () => Bounds | undefined;
  /**
   * Takes the result when a search finds exactly one place, so Enter goes
   * straight to it instead of opening a list of one. The box then shows the
   * place's label with nothing to choose, and the announcement says where the
   * map went, not how many results there were. Several results still become a
   * list, and without this option a single result does too.
   */
  readonly onPick?: (result: SearchResult) => void;
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
 * request. Nothing is sent to the geocoder while they type, as the
 * OpenStreetMap Foundation's Nominatim policy forbids client-side
 * autocomplete; suggestions as they type come from a separate provider (see
 * `useSuggestions`). This is the one place that owns the `AbortController`: each
 * search aborts the one before it, and an aborted request never changes state
 * or reaches the announcer. The provider itself keeps to the service's rate
 * limit.
 *
 * Announcements go through the app-wide announcer: the result count (or "No
 * results", or the error) once the search settles. An identical message is
 * not repeated for consecutive searches until the box has been emptied or
 * Retry is pressed.
 */
export function useSearch({
  getBias,
  onPick,
}: UseSearchOptions = {}): UseSearch {
  const provider = useSearchProvider();
  const announce = useAnnounce();
  const providerRef = useLatestRef(provider);
  const announceRef = useLatestRef(announce);
  const messagesRef = useLatestRef(useMessages());
  const getBiasRef = useLatestRef(getBias);
  const onPickRef = useLatestRef(onPick);

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
    (message: Message, priority: "polite" | "assertive") => {
      // The same outcome, by key and parameters, is said once.
      const outcome = JSON.stringify(message);
      if (outcome === lastAnnounced.current) {
        return;
      }
      lastAnnounced.current = outcome;
      announceRef.current(message, { priority });
    },
    [announceRef],
  );

  /**
   * Takes the only result: the box shows its label, there is no list, and
   * the announcement names the place. It is said every time, because the
   * person pressed Enter and expects to hear that it worked.
   */
  const pickOnly = useCallback(
    (result: SearchResult, pick: (result: SearchResult) => void) => {
      queryRef.current = result.label;
      setQueryState(result.label);
      setState(IDLE);
      lastAnnounced.current = null;
      announceRef.current(announceSearchPicked(result.label), {
        priority: "polite",
      });
      pick(result);
    },
    [announceRef],
  );

  const showResults = useCallback(
    (results: readonly SearchResult[], message: Message) => {
      const only = results.length === 1 ? results[0] : undefined;
      const pick = onPickRef.current;
      if (only && pick) {
        pickOnly(only, pick);
        return;
      }
      setState({ status: "results", results });
      announceOnce(message, "polite");
    },
    [announceOnce, onPickRef, pickOnly],
  );

  const run = useCallback(
    async (text: string) => {
      controller.current?.abort();
      const coordinates = coordinateSearchResult(text, messagesRef.current);
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
    [providerRef, getBiasRef, messagesRef, announceOnce, showResults],
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
