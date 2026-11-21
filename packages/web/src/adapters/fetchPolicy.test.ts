// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
 * Every fetch adapter in `packages/web/src/adapters`, with what it may send
 * and how many requests the calls below make. The routing and Nominatim servers' terms ask for a valid Referer, so
 * they get the site's origin and never the page, the query or the fragment;
 * the layer and Photon requests send none. None sends a cookie. A change here
 * is a change to what a provider learns, and to the privacy texts.
 */
const POLICIES: readonly {
  readonly name: string;
  /** The adapter's source file, in this folder, that the static check finds. */
  readonly file: string;
  readonly count: number;
  readonly policy: FetchPolicy;
  readonly requests: (fetch: typeof globalThis.fetch) => Promise<unknown>[];
}[] = [
  {
    name: "Valhalla routing",
    file: "routing/ValhallaRoutingProvider.ts",
    count: 2,
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
    file: "search/NominatimSearchProvider.ts",
    count: 2,
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
    file: "search/PhotonSuggestionProvider.ts",
    count: 1,
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
    file: "layers/FetchLayerSource.ts",
    count: 1,
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
    async ({ policy, requests, count }) => {
      const net = recordingFetch();
      await Promise.allSettled(requests(net.fetch));
      expect(net.inits).toHaveLength(count);
      for (const init of net.inits) {
        expect(init?.credentials).toBe(policy.credentials);
        expect(init?.referrerPolicy).toBe(policy.referrerPolicy);
        expect(init?.referrer).toBeUndefined();
      }
    },
  );
});

/**
 * Adapter files that call `fetch` and are not in the table: the shared
 * wrapper, which only forwards to the global `fetch`, and the error reporter,
 * which posts to this site's own report endpoint and never to a provider.
 */
const NOT_PROVIDERS: ReadonlySet<string> = new Set([
  "shared/fetch.ts",
  "errorReporting/BeaconErrorReporter.ts",
]);

const ADAPTERS = path.dirname(fileURLToPath(import.meta.url));

/** The source files below `dir`, as paths relative to the adapters folder. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    const isSource = /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name);
    return isSource
      ? [path.relative(ADAPTERS, full).split(path.sep).join("/")]
      : [];
  });
}

/** The source with its comments dropped, so a word in prose is not a call. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the table above", () => {
  it("lists every adapter file that calls fetch, once for each call site", () => {
    const calling = new Map<string, number>();
    for (const file of sourceFiles(ADAPTERS)) {
      const source = withoutComments(
        readFileSync(path.join(ADAPTERS, file), "utf8"),
      );
      const sites = source.match(
        /(?<![\w$])(?:this\.)?#?fetch\(|\.fetch\(|\bglobalThis\.fetch\(/g,
      );
      if (sites && !NOT_PROVIDERS.has(file)) {
        calling.set(file, sites.length);
      }
    }
    expect(Object.fromEntries(calling)).toEqual(
      Object.fromEntries(POLICIES.map(({ file }) => [file, 1])),
    );
  });
});
