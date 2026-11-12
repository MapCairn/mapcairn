// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  PortAbortError,
  SearchError,
  type SearchErrorKind,
} from "../ports/errors";
import type { SearchResult } from "../ports/search";
import type { SuggestionProvider } from "../ports/suggestions";

/**
 * How the suggestion contract scripts a provider. A real adapter implements
 * these by mocking its network layer, typically `fetch`.
 */
export interface SuggestionProviderControls {
  /** Makes the provider answer every later `suggest` with these results. */
  willReturn(results: readonly SearchResult[]): void;
  /** Makes every later request fail the way `kind` describes. */
  willFail(kind: SearchErrorKind): void;
  /** Keeps the next request pending until its signal aborts. */
  hold(): void;
}

/** One suggestion provider under test, with its controls. */
export interface SuggestionProviderSubject {
  readonly provider: SuggestionProvider;
  readonly controls: SuggestionProviderControls;
}

const PLACE: SearchResult = {
  id: "place-1",
  label: "Table Mountain",
  secondaryLabel: "Cape Town",
  centre: { lat: -33.9628, lng: 18.4098 },
};

const OTHER_PLACE: SearchResult = {
  id: "place-2",
  label: "Table Bay",
  centre: { lat: -33.9, lng: 18.45 },
  bounds: { south: -33.95, west: 18.4, north: -33.85, east: 18.5 },
};

const ERROR_KINDS: readonly SearchErrorKind[] = [
  "offline",
  "rate-limited",
  "failed",
];

/**
 * Runs the shared behavioural suite for a {@link SuggestionProvider}. Every
 * test calls `create` for a fresh subject.
 */
export function runSuggestionProviderContract(
  name: string,
  create: () => SuggestionProviderSubject,
): void {
  describe(`SuggestionProvider contract: ${name}`, () => {
    it("resolves suggestions that each have an id, a label and a centre", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE, OTHER_PLACE]);
      const results = await provider.suggest("table");
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
      expect(await provider.suggest("nowhere")).toEqual([]);
    });

    it("resolves an empty array, or rejects with a SearchError, for an empty query", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE]);
      const outcome = await provider.suggest("   ").then(
        (results) => results,
        (error: unknown) => error,
      );
      if (outcome instanceof Error) {
        expect(outcome).toBeInstanceOf(SearchError);
      } else {
        expect(outcome).toEqual([]);
      }
    });

    it("accepts a result limit", async () => {
      const { provider, controls } = create();
      controls.willReturn([PLACE]);
      const results = await provider.suggest("table", { limit: 5 });
      expect(Array.isArray(results)).toBe(true);
    });

    for (const kind of ERROR_KINDS) {
      it(`rejects a ${kind} request with a SearchError of that kind`, async () => {
        const { provider, controls } = create();
        controls.willFail(kind);
        const error = await provider.suggest("table").catch((e: unknown) => e);
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
        provider.suggest("table", { signal: controller.signal }),
      ).rejects.toBeInstanceOf(PortAbortError);
    });

    it("rejects with PortAbortError when the signal fires mid-request", async () => {
      const { provider, controls } = create();
      controls.hold();
      const controller = new AbortController();
      const pending = provider.suggest("table", { signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(PortAbortError);
    });
  });
}
