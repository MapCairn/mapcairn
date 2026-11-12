import {
  announceNoSuggestions,
  announceSuggestions,
  announceSuggestionsUnavailable,
  PortAbortError,
  SearchError,
  type SearchResult,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import { useEffect, useRef, useState } from "react";
import { useSuggestionProvider } from "../../services/hooks";
import { useAnnounce } from "../../ui/LiveRegion";

/** How long the text must stay unchanged before suggestions are asked for. */
export const SUGGEST_DEBOUNCE_MS = 275;

/** The fewest characters (after trimming) that suggestions are asked for. */
export const MIN_SUGGEST_LENGTH = 3;

/** How many requests in a row may fail before suggestions pause. */
export const SUGGEST_FAILURE_LIMIT = 3;

/** How long suggestions stay paused after repeated failures, in milliseconds. */
export const SUGGEST_COOLDOWN_MS = 60_000;

const NONE: readonly SearchResult[] = [];

/**
 * A run of letters that makes text a place name. Text with none (digits,
 * signs, a degree mark and at most a compass letter or two) may be a
 * coordinate pair still being typed, which is never sent to a service.
 */
const WORD = /\p{L}{3,}/u;

/**
 * Suggests places for text as it is typed, over the services' optional
 * `SuggestionProvider`. Returns the suggestions for the latest text that has
 * settled, or none.
 *
 * A request starts only when the trimmed text has been unchanged for
 * {@link SUGGEST_DEBOUNCE_MS}, is at least {@link MIN_SUGGEST_LENGTH}
 * characters and has a word in it, so a coordinate pair typed digit by digit
 * is never sent (the search itself answers a whole pair without a service).
 * Each change of text aborts the request before it, so an
 * answer for older text never arrives after a newer one. Nothing is asked
 * while `enabled` is false, which a caller uses after the person has picked
 * a suggestion so the box showing its label does not suggest again.
 *
 * When the service fails the person is not interrupted: no suggestions show,
 * and Enter still searches. After {@link SUGGEST_FAILURE_LIMIT} failures in a
 * row, or one `rate-limited` answer, it stops asking for
 * {@link SUGGEST_COOLDOWN_MS} and announces once that suggestions are
 * unavailable and Enter still works. It announces again only after a request
 * has worked in between. A host without a provider gets no suggestions and no
 * announcements.
 *
 * Counts go out through the app-wide announcer, politely.
 */
export function useSuggestions(
  query: string,
  enabled: boolean,
): readonly SearchResult[] {
  const provider = useSuggestionProvider();
  const announce = useAnnounce();
  const announceRef = useLatestRef(announce);
  const text = query.trim();
  const [suggestions, setSuggestions] = useState<readonly SearchResult[]>(NONE);
  const failures = useRef(0);
  const pausedUntil = useRef(0);
  const toldUnavailable = useRef(false);

  useEffect(() => {
    if (
      provider === undefined ||
      !enabled ||
      text.length < MIN_SUGGEST_LENGTH ||
      !WORD.test(text)
    ) {
      setSuggestions(NONE);
      return;
    }

    const own = new AbortController();

    const fail = (error: unknown) => {
      failures.current += 1;
      setSuggestions(NONE);
      const slowDown =
        error instanceof SearchError && error.kind === "rate-limited";
      if (!slowDown && failures.current < SUGGEST_FAILURE_LIMIT) {
        return;
      }
      pausedUntil.current = Date.now() + SUGGEST_COOLDOWN_MS;
      if (!toldUnavailable.current) {
        toldUnavailable.current = true;
        announceRef.current(announceSuggestionsUnavailable(), {
          priority: "polite",
        });
      }
    };

    const request = async () => {
      if (Date.now() < pausedUntil.current) {
        setSuggestions(NONE);
        return;
      }
      try {
        const results = await provider.suggest(text, { signal: own.signal });
        if (own.signal.aborted) {
          return;
        }
        failures.current = 0;
        toldUnavailable.current = false;
        setSuggestions(results);
        announceRef.current(
          results.length === 0
            ? announceNoSuggestions()
            : announceSuggestions(results.length),
          { priority: "polite" },
        );
      } catch (error) {
        if (own.signal.aborted || error instanceof PortAbortError) {
          return;
        }
        fail(error);
      }
    };

    const timer = setTimeout(() => {
      void request();
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      own.abort();
    };
  }, [provider, enabled, text, announceRef]);

  return suggestions;
}
