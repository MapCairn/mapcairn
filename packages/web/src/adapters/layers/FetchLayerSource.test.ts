// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SAMPLE_ALERT_LAYER, SAMPLE_FEED_LAYER } from "@mapcairn/core";
import { runLayerSourceContract } from "@mapcairn/core/contracts";
import { describe, expect, it, vi } from "vitest";
import { FetchLayerSource } from "./FetchLayerSource";

type Reply = () => Promise<Response>;

/** A scripted `fetch` that replays `next` for every call and records each URL. */
function scriptedFetch() {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  let next: Reply = async () => new Response("{}");
  let gate: Promise<void> | null = null;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    inits.push(init);
    if (gate) {
      await gate;
    }
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return next();
  });
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    urls,
    inits,
    reply(body: unknown, headers: Record<string, string> = {}) {
      next = async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json", ...headers },
        });
    },
    replyWith(reply: Reply) {
      next = reply;
    },
    hold(): () => void {
      let release!: () => void;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return () => {
        gate = null;
        release();
      };
    },
  };
}

function geojson(features: unknown[]) {
  return { type: "FeatureCollection", features };
}

runLayerSourceContract("FetchLayerSource", () => {
  const net = scriptedFetch();
  return {
    source: new FetchLayerSource({ fetch: net.fetch }),
    controls: {
      respondWith: (points) => {
        net.reply(
          geojson(
            points.map((point) => ({
              type: "Feature",
              id: point.id,
              geometry: { type: "Point", coordinates: [point.lng, point.lat] },
              properties: { title: point.title },
            })),
          ),
        );
      },
      respondWithDetailLine: (from, to) => {
        net.reply(
          geojson([
            {
              type: "Feature",
              id: "line",
              geometry: { type: "LineString", coordinates: [from, to] },
              properties: {},
            },
          ]),
        );
      },
      failWith: (kind) => {
        net.replyWith(
          kind === "network"
            ? async () => {
                throw new TypeError("Failed to fetch");
              }
            : async () => new Response("<html>not json</html>"),
        );
      },
      hold: () => net.hold(),
    },
  };
});

describe("FetchLayerSource", () => {
  const now = Date.UTC(2026, 10, 9, 8);
  const point = (id: string, kind = "keep") => ({
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [18.4, -33.9] },
    properties: { title: id, kind },
  });

  it("requests the definition's URL for the controls, without credentials or a referrer", async () => {
    const net = scriptedFetch();
    net.reply(geojson([point("a")]));
    const source = new FetchLayerSource({ fetch: net.fetch });
    await source.load({
      definition: SAMPLE_FEED_LAYER,
      controls: { window: "day", small: "true" },
      now,
    });
    expect(net.urls).toEqual(["https://sample.test/feed/all_day.json"]);
    expect(net.inits[0]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
      mode: "cors",
    });
  });

  it("treats an error status as a network failure", async () => {
    const net = scriptedFetch();
    net.replyWith(async () => new Response("gone", { status: 404 }));
    const source = new FetchLayerSource({ fetch: net.fetch });
    await expect(
      source.load({ definition: SAMPLE_FEED_LAYER, controls: {}, now }),
    ).rejects.toMatchObject({ kind: "network" });
  });

  it("applies the definition's filter", async () => {
    const net = scriptedFetch();
    net.reply(geojson([point("a"), point("b", "drop")]));
    const source = new FetchLayerSource({ fetch: net.fetch });
    const features = await source.load({
      definition: SAMPLE_FEED_LAYER,
      controls: {},
      now,
    });
    expect(features.map((feature) => feature.id)).toEqual(["a"]);
  });

  it("reuses a response for its max-age, so layers over one feed cost one request", async () => {
    let clock = now;
    const net = scriptedFetch();
    net.reply(geojson([point("a")]), { "cache-control": "public, max-age=60" });
    const source = new FetchLayerSource({ fetch: net.fetch, now: () => clock });
    const request = { definition: SAMPLE_FEED_LAYER, controls: {}, now };
    await Promise.all([source.load(request), source.load(request)]);
    await source.load(request);
    expect(net.urls).toHaveLength(1);
    clock += 61_000;
    await source.load(request);
    expect(net.urls).toHaveLength(2);
  });

  it("keeps a response for the definition's cache time when the provider sends no max-age", async () => {
    let clock = now;
    const net = scriptedFetch();
    net.reply(geojson([point("a")]));
    const source = new FetchLayerSource({ fetch: net.fetch, now: () => clock });
    const definition = {
      ...SAMPLE_FEED_LAYER,
      source: { ...SAMPLE_FEED_LAYER.source, cacheSeconds: 300 },
    };
    await source.load({ definition, controls: {}, now });
    clock += 299_000;
    await source.load({ definition, controls: {}, now });
    expect(net.urls).toHaveLength(1);
  });

  it("never requests a detail URL off the declared origins", async () => {
    const net = scriptedFetch();
    const source = new FetchLayerSource({ fetch: net.fetch });
    await expect(
      source.loadDetail({
        definition: SAMPLE_ALERT_LAYER,
        feature: {
          id: "a",
          geometry: { type: "Point", coordinates: [0, 0] },
          fields: { area: "https://evil.test/area" },
        },
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(net.urls).toEqual([]);
  });

  it("reads the global fetch lazily when none is given", async () => {
    const original = globalThis.fetch;
    const net = scriptedFetch();
    net.reply(geojson([point("a")]));
    globalThis.fetch = net.fetch;
    try {
      await new FetchLayerSource().load({
        definition: SAMPLE_FEED_LAYER,
        controls: {},
        now,
      });
      expect(net.urls).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
