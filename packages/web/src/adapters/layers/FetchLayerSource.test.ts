// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type IdentifiableLayerDefinition,
  type IdentifyTarget,
  identifyUrl,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_QUERY_LAYER,
} from "@mapcairn/core";
import {
  CONTRACT_IDENTIFY_LAYER,
  runLayerSourceContract,
} from "@mapcairn/core/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  FetchLayerSource,
  MAX_IDENTIFY_RESPONSE_BYTES,
} from "./FetchLayerSource";

type Reply = () => Promise<Response>;

/** A held call: every request whose URL contains `match` waits for `promise`. */
interface Gate {
  readonly match: string;
  readonly promise: Promise<void>;
}

/** A scripted `fetch` that replays `next` for every call and records each URL. */
function scriptedFetch() {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  let next: Reply = async () => new Response("{}");
  let gate: Gate | null = null;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    inits.push(init);
    if (gate && String(input).includes(gate.match)) {
      await gate.promise;
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
    /** Holds the calls whose URL contains `match` (every call by default). */
    hold(match = ""): () => void {
      let release!: () => void;
      gate = {
        match,
        promise: new Promise((resolve) => {
          release = resolve;
        }),
      };
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

/** A GeoJSON answer with one point feature for each contract point. */
function pointsAnswer(
  points: readonly {
    id: string;
    title: string;
    lng: number;
    lat: number;
  }[],
) {
  return geojson(
    points.map((point) => ({
      type: "Feature",
      id: point.id,
      geometry: { type: "Point", coordinates: [point.lng, point.lat] },
      properties: { title: point.title },
    })),
  );
}

const textEncoder = new TextEncoder();

/**
 * A GeoJSON answer of exactly `bytes` bytes holding `feature`, padded with a
 * property, and streamed in chunks with no `Content-Length`, as a provider
 * that does not say how much it will send.
 */
function streamedAnswerOfBytes(feature: object, bytes: number): Response {
  const build = (filler: string) =>
    JSON.stringify(
      geojson([
        {
          ...feature,
          properties: {
            ...(feature as { properties?: object }).properties,
            filler,
          },
        },
      ]),
    );
  const empty = textEncoder.encode(build("")).byteLength;
  const whole = textEncoder.encode(build("x".repeat(bytes - empty)));
  const chunkBytes = 512;
  let at = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= whole.byteLength) {
          controller.close();
          return;
        }
        controller.enqueue(whole.slice(at, at + chunkBytes));
        at += chunkBytes;
      },
    }),
    { status: 200 },
  );
}

const contractPoint = {
  type: "Feature",
  id: "a",
  geometry: { type: "Point", coordinates: [18.4, -33.9] },
  properties: { title: "Alpha" },
};

const contractLine = {
  type: "Feature",
  id: "line",
  geometry: {
    type: "LineString",
    coordinates: [
      [0, 0],
      [1, 1],
    ],
  },
  properties: {},
};

/** What a failing `fetch` does for each kind of failure the contract asks for. */
const failure = (kind: "network" | "invalid"): Reply =>
  kind === "network"
    ? async () => {
        throw new TypeError("Failed to fetch");
      }
    : async () => new Response("<html>not json</html>");

/** The limit the contract subject lowers its source to, so an oversize answer stays small. */
const CONTRACT_LIMIT_BYTES = 2048;

runLayerSourceContract("FetchLayerSource", () => {
  const net = scriptedFetch();
  return {
    source: new FetchLayerSource({
      fetch: net.fetch,
      maxResponseBytes: CONTRACT_LIMIT_BYTES,
    }),
    controls: {
      respondWith: (points) => {
        net.reply(pointsAnswer(points));
      },
      respondToIdentifyWith: (points) => {
        net.reply(pointsAnswer(points));
      },
      failIdentifyWith: (kind) => {
        net.replyWith(failure(kind));
      },
      holdIdentify: () =>
        net.hold(new URL(CONTRACT_IDENTIFY_LAYER.identify.url).pathname),
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
      respondWithOversizeAnswer: (kind) => {
        net.replyWith(async () =>
          streamedAnswerOfBytes(
            kind === "feed" ? contractPoint : contractLine,
            CONTRACT_LIMIT_BYTES + 1,
          ),
        );
      },
      failWith: (kind) => {
        net.replyWith(failure(kind));
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

  it("asks once for each side of the antimeridian and keeps a feature both sides hold once", async () => {
    const net = scriptedFetch();
    net.replyWith(async () => {
      const east = net.urls.at(-1)?.includes("bbox=177");
      return new Response(
        JSON.stringify(
          geojson(
            east ? [point("a"), point("edge")] : [point("edge"), point("b")],
          ),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const source = new FetchLayerSource({ fetch: net.fetch });
    const features = await source.load({
      definition: SAMPLE_QUERY_LAYER,
      controls: {},
      now,
      area: { west: 177, south: -19, east: 183, north: -15 },
    });
    expect(net.urls).toEqual([
      "https://query.test/items?bbox=177,-19,180,-15&limit=4",
      "https://query.test/items?bbox=-180,-19,-177,-15&limit=4",
    ]);
    expect(features.map((feature) => feature.id).sort()).toEqual([
      "a",
      "b",
      "edge",
    ]);
  });

  it("fails the load when either side of the antimeridian fails", async () => {
    const net = scriptedFetch();
    net.replyWith(async () =>
      net.urls.length === 1
        ? new Response(JSON.stringify(geojson([point("a")])))
        : new Response("gone", { status: 500 }),
    );
    const source = new FetchLayerSource({ fetch: net.fetch });
    await expect(
      source.load({
        definition: SAMPLE_QUERY_LAYER,
        controls: {},
        now,
        area: { west: 177, south: -19, east: 183, north: -15 },
      }),
    ).rejects.toMatchObject({ kind: "network" });
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

describe("FetchLayerSource identify", () => {
  const now = Date.UTC(2026, 10, 9, 8);
  const encoder = new TextEncoder();
  /** A tap, moved a little east for each `step`, so each has its own URL. */
  const tap = (step = 0): IdentifyTarget => ({
    latlng: { lat: -33.9, lng: 18.4 + step * 0.001 },
    zoom: 10,
  });
  const found = {
    type: "Feature",
    id: "pit",
    geometry: { type: "Point", coordinates: [18.4, -33.9] },
    properties: { name: "Pit", depth: 2 },
  };
  const ask = (
    source: FetchLayerSource,
    options: {
      definition?: IdentifiableLayerDefinition;
      at?: IdentifyTarget;
      signal?: AbortSignal;
    } = {},
  ) =>
    source.identify({
      definition: options.definition ?? SAMPLE_IDENTIFY_LAYER,
      controls: {},
      now,
      at: options.at ?? tap(),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  /** The `{"features": []}` document padded to be exactly `bytes` long. */
  const documentOfBytes = (bytes: number): string => {
    const shell = '{"features":[],"filler":""}';
    return `{"features":[],"filler":"${"x".repeat(bytes - shell.length)}"}`;
  };

  it("requests the URL core builds, without credentials or a referrer, and can be cancelled", async () => {
    const net = scriptedFetch();
    net.reply(geojson([found]));
    const controller = new AbortController();
    const features = await ask(new FetchLayerSource({ fetch: net.fetch }), {
      signal: controller.signal,
    });
    expect(net.urls).toEqual([
      identifyUrl(SAMPLE_IDENTIFY_LAYER, {}, now, tap()),
    ]);
    expect(net.inits[0]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
      mode: "cors",
      signal: controller.signal,
    });
    expect(features.map((feature) => feature.fields.title)).toEqual(["Pit"]);
  });

  it("places a feature the service gave no geometry at the tap", async () => {
    const net = scriptedFetch();
    net.reply(geojson([{ ...found, geometry: null }]));
    const [feature] = await ask(new FetchLayerSource({ fetch: net.fetch }));
    expect(feature?.geometry).toEqual({
      type: "Point",
      coordinates: [tap().latlng.lng, tap().latlng.lat],
    });
  });

  it.each([401, 403, 404, 500])(
    "treats a %i answer as a network failure",
    async (status) => {
      const net = scriptedFetch();
      net.replyWith(async () => new Response("no", { status }));
      await expect(
        ask(new FetchLayerSource({ fetch: net.fetch })),
      ).rejects.toMatchObject({ kind: "network" });
    },
  );

  it("refuses an identify URL that is not https, without asking", async () => {
    const net = scriptedFetch();
    const definition = {
      ...SAMPLE_IDENTIFY_LAYER,
      identify: {
        ...SAMPLE_IDENTIFY_LAYER.identify,
        url: "http://api.test/identify?bbox={bbox}",
      },
    };
    await expect(
      ask(new FetchLayerSource({ fetch: net.fetch }), { definition }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(net.urls).toEqual([]);
  });

  it("refuses a tap it cannot build a URL for, without asking", async () => {
    const net = scriptedFetch();
    await expect(
      ask(new FetchLayerSource({ fetch: net.fetch }), {
        at: { latlng: { lat: -33.9, lng: 18.4 }, zoom: Number.NaN },
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect(net.urls).toEqual([]);
  });

  it("keeps no answer, whatever its Cache-Control says", async () => {
    const net = scriptedFetch();
    net.reply(geojson([found]), { "cache-control": "max-age=3600" });
    const source = new FetchLayerSource({ fetch: net.fetch });
    await ask(source);
    await ask(source);
    expect(net.urls).toHaveLength(2);
  });

  it("shares no request in flight, even for the same tap", async () => {
    const net = scriptedFetch();
    net.reply(geojson([found]));
    const source = new FetchLayerSource({ fetch: net.fetch });
    await Promise.all([ask(source), ask(source)]);
    expect(net.urls).toHaveLength(2);
  });

  it("leaves a feed response in the shared cache through 20 identify calls", async () => {
    const net = scriptedFetch();
    const everything = geojson([
      {
        ...found,
        properties: { name: "Pit", title: "Pit", kind: "keep", depth: 2 },
      },
    ]);
    net.reply(everything, { "cache-control": "max-age=3600" });
    const source = new FetchLayerSource({ fetch: net.fetch, now: () => now });
    const feed = { definition: SAMPLE_FEED_LAYER, controls: {}, now };
    await source.load(feed);
    for (let step = 0; step < 20; step += 1) {
      await ask(source, { at: tap(step) });
    }
    await source.load(feed);
    expect(net.urls).toHaveLength(21);
  });

  describe("the size of an answer", () => {
    it("reads an answer of exactly the limit", async () => {
      const net = scriptedFetch();
      net.replyWith(
        async () =>
          new Response(documentOfBytes(MAX_IDENTIFY_RESPONSE_BYTES), {
            status: 200,
          }),
      );
      await expect(
        ask(new FetchLayerSource({ fetch: net.fetch })),
      ).resolves.toEqual([]);
    });

    it("refuses an answer over the limit that says so in Content-Length, unread", async () => {
      const net = scriptedFetch();
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(encoder.encode("{}"));
        },
        cancel() {
          cancelled = true;
        },
      });
      net.replyWith(
        async () =>
          new Response(body, {
            status: 200,
            headers: {
              "content-length": String(MAX_IDENTIFY_RESPONSE_BYTES + 1),
            },
          }),
      );
      await expect(
        ask(new FetchLayerSource({ fetch: net.fetch })),
      ).rejects.toMatchObject({ kind: "invalid" });
      expect(cancelled).toBe(true);
    });

    it("stops reading an answer over the limit that gives no Content-Length", async () => {
      const net = scriptedFetch();
      let cancelled = false;
      let sent = 0;
      const chunk = encoder.encode("x".repeat(MAX_IDENTIFY_RESPONSE_BYTES / 4));
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          sent += 1;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });
      net.replyWith(async () => new Response(body, { status: 200 }));
      await expect(
        ask(new FetchLayerSource({ fetch: net.fetch })),
      ).rejects.toMatchObject({ kind: "invalid" });
      expect(cancelled).toBe(true);
      expect(sent).toBeLessThan(8);
    });

    it("counts bytes, not characters", async () => {
      const net = scriptedFetch();
      const euros = "€".repeat(MAX_IDENTIFY_RESPONSE_BYTES / 3 + 1);
      expect(euros.length).toBeLessThan(MAX_IDENTIFY_RESPONSE_BYTES);
      net.replyWith(async () => new Response(`{"note":"${euros}"}`));
      await expect(
        ask(new FetchLayerSource({ fetch: net.fetch })),
      ).rejects.toMatchObject({ kind: "invalid" });
    });

    it("reads a multi-byte character split across two chunks", async () => {
      const net = scriptedFetch();
      const whole = encoder.encode(
        JSON.stringify(
          geojson([{ ...found, properties: { name: "Café", depth: 2 } }]),
        ),
      );
      const split = whole.indexOf(0xc3) + 1;
      net.replyWith(async () => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(whole.slice(0, split));
            controller.enqueue(whole.slice(split));
            controller.close();
          },
        });
        return new Response(body, { status: 200 });
      });
      const [feature] = await ask(new FetchLayerSource({ fetch: net.fetch }));
      expect(feature?.fields.title).toBe("Café");
    });

    it("refuses an answer with no body as not JSON", async () => {
      const net = scriptedFetch();
      net.replyWith(async () => new Response(null, { status: 200 }));
      await expect(
        ask(new FetchLayerSource({ fetch: net.fetch })),
      ).rejects.toMatchObject({ kind: "invalid" });
    });

    it("rejects with aborted, not invalid, when the signal fires while the body is read", async () => {
      const net = scriptedFetch();
      const controller = new AbortController();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          controller.signal.addEventListener("abort", () => {
            stream.error(new DOMException("Aborted", "AbortError"));
          });
        },
      });
      net.replyWith(async () => new Response(body, { status: 200 }));
      const asking = ask(new FetchLayerSource({ fetch: net.fetch }), {
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(net.urls).toHaveLength(1));
      controller.abort();
      await expect(asking).rejects.toMatchObject({ kind: "aborted" });
    });
  });
});

describe("FetchLayerSource, the size of a feed or detail answer", () => {
  const now = Date.UTC(2026, 10, 9, 8);
  const feedPoint = {
    type: "Feature",
    id: "a",
    geometry: { type: "Point", coordinates: [18.4, -33.9] },
    properties: { title: "a", kind: "keep" },
  };
  const loadFeed = (
    net: ReturnType<typeof scriptedFetch>,
    maxResponseBytes?: number,
    definition: LayerDefinition = SAMPLE_FEED_LAYER,
  ) =>
    new FetchLayerSource({
      fetch: net.fetch,
      ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
    }).load({ definition, controls: {}, now });

  it("reads a feed answer of exactly the default limit", async () => {
    const net = scriptedFetch();
    net.replyWith(async () =>
      streamedAnswerOfBytes(feedPoint, DEFAULT_MAX_RESPONSE_BYTES),
    );
    await expect(loadFeed(net)).resolves.toHaveLength(1);
  });

  it("refuses a feed answer one byte over the default limit", async () => {
    const net = scriptedFetch();
    net.replyWith(async () =>
      streamedAnswerOfBytes(feedPoint, DEFAULT_MAX_RESPONSE_BYTES + 1),
    );
    await expect(loadFeed(net)).rejects.toMatchObject({ kind: "invalid" });
  });

  it("stops reading a feed answer over the limit that has no Content-Length", async () => {
    const net = scriptedFetch();
    let cancelled = false;
    let sent = 0;
    const chunk = textEncoder.encode(
      "x".repeat(DEFAULT_MAX_RESPONSE_BYTES / 4),
    );
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    net.replyWith(async () => new Response(body, { status: 200 }));
    await expect(loadFeed(net)).rejects.toMatchObject({ kind: "invalid" });
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(8);
  });

  it("refuses a feed answer whose Content-Length is over the limit without reading it", async () => {
    const net = scriptedFetch();
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(textEncoder.encode("{}"));
      },
      pull(controller) {
        pulls += 1;
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    net.replyWith(
      async () =>
        new Response(body, {
          status: 200,
          headers: { "content-length": String(DEFAULT_MAX_RESPONSE_BYTES + 1) },
        }),
    );
    await expect(loadFeed(net)).rejects.toMatchObject({ kind: "invalid" });
    expect(cancelled).toBe(true);
    expect(pulls).toBe(0);
  });

  it("applies the limit its options set, lower or higher than the default", async () => {
    const lower = scriptedFetch();
    lower.replyWith(async () => streamedAnswerOfBytes(feedPoint, 4000));
    await expect(loadFeed(lower, 3999)).rejects.toMatchObject({
      kind: "invalid",
    });
    const higher = scriptedFetch();
    higher.replyWith(async () =>
      streamedAnswerOfBytes(feedPoint, DEFAULT_MAX_RESPONSE_BYTES + 1),
    );
    await expect(
      loadFeed(higher, DEFAULT_MAX_RESPONSE_BYTES + 1),
    ).resolves.toHaveLength(1);
  });

  it("says how large the refused answer was allowed to be", async () => {
    const net = scriptedFetch();
    net.replyWith(async () => streamedAnswerOfBytes(feedPoint, 4000));
    await expect(loadFeed(net, 3999)).rejects.toMatchObject({
      kind: "invalid",
      message: "The response is larger than 3999 bytes.",
    });
  });

  it("does not keep a refused answer, so a later load asks again", async () => {
    const net = scriptedFetch();
    net.replyWith(async () => streamedAnswerOfBytes(feedPoint, 4000));
    const source = new FetchLayerSource({
      fetch: net.fetch,
      maxResponseBytes: 3999,
    });
    const request = { definition: SAMPLE_FEED_LAYER, controls: {}, now };
    await expect(source.load(request)).rejects.toMatchObject({
      kind: "invalid",
    });
    await expect(source.load(request)).rejects.toMatchObject({
      kind: "invalid",
    });
    expect(net.urls).toHaveLength(2);
  });

  it("treats two layers that share a URL alike, whichever asks first", async () => {
    const sibling = { ...SAMPLE_FEED_LAYER, id: "sample-points-too" };
    const refused = scriptedFetch();
    refused.replyWith(async () => streamedAnswerOfBytes(feedPoint, 4000));
    const small = new FetchLayerSource({
      fetch: refused.fetch,
      maxResponseBytes: 3999,
    });
    const request = (definition: LayerDefinition) => ({
      definition,
      controls: {},
      now,
    });
    const settled = await Promise.allSettled([
      small.load(request(SAMPLE_FEED_LAYER)),
      small.load(request(sibling)),
    ]);
    expect(settled.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    const kept = scriptedFetch();
    kept.reply(geojson([feedPoint]), { "cache-control": "max-age=60" });
    const big = new FetchLayerSource({ fetch: kept.fetch });
    const loaded = await Promise.all([
      big.load(request(SAMPLE_FEED_LAYER)),
      big.load(request(sibling)),
    ]);
    expect(loaded.map((features) => features.length)).toEqual([1, 1]);
    expect(kept.urls).toHaveLength(1);
  });

  it("applies the same limit to a detail answer", async () => {
    const feature = {
      id: "a",
      geometry: { type: "Point" as const, coordinates: [0, 0] as const },
      fields: { area: "https://alerts.test/g" },
    };
    const line = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      properties: {},
    };
    const net = scriptedFetch();
    net.replyWith(async () => streamedAnswerOfBytes(line, 4000));
    const request = { definition: SAMPLE_ALERT_LAYER, feature };
    await expect(
      new FetchLayerSource({
        fetch: net.fetch,
        maxResponseBytes: 3999,
      }).loadDetail(request),
    ).rejects.toMatchObject({ kind: "invalid" });
    await expect(
      new FetchLayerSource({ fetch: net.fetch }).loadDetail(request),
    ).resolves.toHaveLength(1);
  });
});
