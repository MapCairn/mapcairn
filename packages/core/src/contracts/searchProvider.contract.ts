// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  PortAbortError,
  SearchError,
  type SearchErrorKind,
} from "../ports/errors";
import type { SearchProvider, SearchResult } from "../ports/search";

/**
 * How the search contract scripts a provider. A real adapter implements these
 * by mocking its network layer, typically `fetch`.
 */
export interface SearchProviderControls {
  /**
   * Makes the provider answer every later `search` with these results, and
   * every later `reverse` with the first one, or `null` when the list is empty.
   */
  willReturn(results: readonly SearchResult[]): void;
  /** Makes every later request fail the way `kind` describes. */
  willFail(kind: SearchErrorKind): void;
  /** Keeps the next request pending until its signal aborts. */
  hold(): void;
}

/** One search provider under test, with its controls. */
export interface SearchProviderSubject {
  readonly provider: SearchProvider;
  readonly controls: SearchProviderControls;
}

const PLACE: SearchResult = {
  id: "place-1",
  label: "Table Mountain",
  secondaryLabel: "Cape Town",
  centre: { lat: -33.9628, lng: 18.4098 },
};

const OTHER_PLACE: SearchResult = {
  id: "place-2",
  label: "Lion's Head",
  centre: { lat: -33.935, lng: 18.3897 },
  bounds: { south: -33.94, west: 18.38, north: -33.93, east: 18.4 },
};

const ERROR_KINDS: readonly SearchErrorKind[] = [
  "offline",
  "rate-limited",
  "failed",
];

/**
 * Runs the shared behavioural suite for a {@link SearchProvider}. Every test
 * calls `create` for a fresh subject.
 */
export function runSearchProviderContract(
  name: string,
  create: () => SearchProviderSubject,
): void {
  describe(`SearchProvider contract: ${name}`, () => {
    it("resolves results that each have an id, a label and a centre", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE, OTHER_PLACE]);
      const results = await provider.search("mountain");
      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(typeof result.id).toBe("string");
        expect(typeof result.label).toBe("string");
        expect(typeof result.centre.lat).toBe("number");
        expect(typeof result.centre.lng).toBe("number");
      }
      expect(results[0]?.label).toBe(PLACE.label);
    });

    it("resolves an empty array when nothing matches", async () => {
      const { provider, controls } = create();
      controls.willReturn([]);
      expect(await provider.search("nowhere")).toEqual([]);
    });

    it("resolves an empty array, or rejects with a SearchError, for an empty query", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE]);
      const outcome = await provider.search("   ").then(
        (results) => results,
        (error: unknown) => error,
      );
      if (outcome instanceof Error) {
        expect(outcome).toBeInstanceOf(SearchError);
      } else {
        expect(outcome).toEqual([]);
      }
    });

    it("accepts a result limit and a bias box", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE]);
      const results = await provider.search("mountain", {
        limit: 5,
        bias: { south: -35, west: 18, north: -33, east: 19 },
      });
      expect(Array.isArray(results)).toBe(true);
    });

    for (const kind of ERROR_KINDS) {
      it(`rejects a ${kind} search with a SearchError of that kind`, async () => {
        const { provider, controls } = create();
        controls.willFail(kind);
        const error = await provider
          .search("mountain")
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SearchError);
        expect((error as SearchError).kind).toBe(kind);
      });
    }

    it("rejects with PortAbortError when the signal is already aborted", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE]);
      const controller = new AbortController();
      controller.abort();
      await expect(
        provider.search("mountain", { signal: controller.signal }),
      ).rejects.toBeInstanceOf(PortAbortError);
    });

    it("rejects with PortAbortError when the signal fires mid-request", async () => {
      const { provider, controls } = create();
      controls.hold();
      const controller = new AbortController();
      const pending = provider.search("mountain", {
        signal: controller.signal,
      });
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    });

    it("reverses a position to a place", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE]);
      const result = await provider.reverse(PLACE.centre);
      expect(result?.id).toBe(PLACE.id);
      expect(result?.label).toBe(PLACE.label);
      expect(result?.centre.lat).toBeCloseTo(PLACE.centre.lat, 3);
    });

    it("reverses to null when there is no place", async () => {
      const { provider, controls } = create();
      controls.willReturn([]);
      expect(await provider.reverse({ lat: 0, lng: 0 })).toBeNull();
    });

    for (const kind of ERROR_KINDS) {
      it(`rejects a ${kind} reverse lookup with a SearchError of that kind`, async () => {
        const { provider, controls } = create();
        controls.willFail(kind);
        const error = await provider
          .reverse(PLACE.centre)
          .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(SearchError);
        expect((error as SearchError).kind).toBe(kind);
      });
    }

    it("aborts a reverse lookup before and during the request", async () => {
      const { provider, controls } = create();
      const aborted = new AbortController();
      aborted.abort();
      await expect(
        provider.reverse(PLACE.centre, { signal: aborted.signal }),
      ).rejects.toBeInstanceOf(PortAbortError);
      controls.hold();
      const controller = new AbortController();
      const pending = provider.reverse(PLACE.centre, {
        signal: controller.signal,
      });
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    });
  });
}
