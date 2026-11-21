// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SAMPLE_FEED_LAYER } from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { FetchLayerSource } from "./layers/FetchLayerSource";
import { ValhallaRoutingProvider } from "./routing/ValhallaRoutingProvider";
import { NominatimSearchProvider } from "./search/NominatimSearchProvider";
import { PhotonSuggestionProvider } from "./search/PhotonSuggestionProvider";

const PARIS = { lat: 48.85, lng: 2.35 };
const LYON = { lat: 45.76, lng: 4.84 };

/** What a provider's request must carry besides its URL: the whole policy. */
interface FetchPolicy {
  readonly credentials: "omit";
  readonly referrerPolicy: "no-referrer" | "strict-origin";
}

/** A `fetch` that records each init and fails, so a request is made and no answer is read. */
function recordingFetch() {
  const inits: (RequestInit | undefined)[] = [];
  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    inits.push(init);
    throw new TypeError("Failed to fetch");
  });
  return { inits, fetch: fetch as unknown as typeof globalThis.fetch };
}

/**
 * Every adapter that makes a browser request to a provider, with what it may
 * send. The routing and Nominatim servers' terms ask for a valid Referer, so
 * they get the site's origin and never the page, the query or the fragment;
 * the layer and Photon requests send none. None sends a cookie. A change here
 * is a change to what a provider learns, and to the privacy texts.
 */
const POLICIES: readonly {
  readonly name: string;
  readonly policy: FetchPolicy;
  readonly requests: (fetch: typeof globalThis.fetch) => Promise<unknown>[];
}[] = [
  {
    name: "Valhalla routing",
    policy: { credentials: "omit", referrerPolicy: "strict-origin" },
    requests: (fetch) => {
      const provider = new ValhallaRoutingProvider({ fetch, minIntervalMs: 0 });
      return [
        provider.route({ stops: [PARIS, LYON], mode: "drive" }),
        provider.reachableArea({ origin: PARIS, minutes: 5, mode: "walk" }),
      ];
    },
  },
  {
    name: "Nominatim search and reverse lookup",
    policy: { credentials: "omit", referrerPolicy: "strict-origin" },
    requests: (fetch) => {
      const provider = new NominatimSearchProvider({
        fetch,
        minIntervalMs: 0,
      });
      return [provider.search("Table Mountain"), provider.reverse(PARIS)];
    },
  },
  {
    name: "Photon suggestions",
    policy: { credentials: "omit", referrerPolicy: "no-referrer" },
    requests: (fetch) => [
      new PhotonSuggestionProvider({ fetch, minIntervalMs: 0 }).suggest(
        "Table",
        { limit: 5 },
      ),
    ],
  },
  {
    name: "layer feeds",
    policy: { credentials: "omit", referrerPolicy: "no-referrer" },
    requests: (fetch) => [
      new FetchLayerSource({ fetch }).load({
        definition: SAMPLE_FEED_LAYER,
        controls: { window: "day", small: "true" },
        now: Date.UTC(2026, 10, 9, 8),
      }),
    ],
  },
];

describe("the request policy of every provider adapter", () => {
  it.each(POLICIES)(
    "$name sends $policy and overrides no referrer",
    async ({ policy, requests }) => {
      const net = recordingFetch();
      await Promise.allSettled(requests(net.fetch));
      expect(net.inits.length).toBeGreaterThan(0);
      for (const init of net.inits) {
        expect(init?.credentials).toBe(policy.credentials);
        expect(init?.referrerPolicy).toBe(policy.referrerPolicy);
        expect(init?.referrer).toBeUndefined();
      }
    },
  );
});
