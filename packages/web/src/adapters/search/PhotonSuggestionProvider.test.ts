// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
} from "@mapcairn/core";
import { runSuggestionProviderContract } from "@mapcairn/core/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotonSuggestionProvider } from "./PhotonSuggestionProvider";

type Script =
  | { kind: "results"; results: readonly SearchResult[] }
  | { kind: "fail"; failure: SearchErrorKind }
  | { kind: "hold" };

function toPhoton(result: SearchResult) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [result.centre.lng, result.centre.lat],
    },
    properties: {
      osm_type: "N",
      osm_id: Number(result.id.replace(/\D/g, "")) || 1,
      name: result.label,
      ...(result.secondaryLabel ? { city: result.secondaryLabel } : {}),
      ...(result.bounds
        ? {
            extent: [
              result.bounds.west,
              result.bounds.north,
              result.bounds.east,
              result.bounds.south,
            ],
          }
        : {}),
    },
  };
}

function collection(features: readonly unknown[]) {
  return { type: "FeatureCollection", features };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A scripted `fetch` that behaves like the real one when its signal aborts. */
function scriptedFetch() {
  let script: Script = { kind: "results", results: [] };
  let online = true;
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetchMock = vi.fn(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: new URL(String(input)), init });
      const current = script;
      if (current.kind === "hold") {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        });
      }
      if (current.kind === "fail") {
        if (current.failure === "offline") {
          online = false;
          return Promise.reject(new TypeError("Failed to fetch"));
        }
        return Promise.resolve(
          jsonResponse({}, current.failure === "rate-limited" ? 429 : 500),
        );
      }
      return Promise.resolve(
        jsonResponse(collection(current.results.map(toPhoton))),
      );
    },
  );
  return {
    fetchMock,
    calls,
    isOnline: () => online,
    setScript(next: Script) {
      script = next;
    },
    /** Answers with a ready-made body instead of a script. */
    answerWith(response: () => Promise<Response>) {
      fetchMock.mockImplementation((input, init) => {
        calls.push({ url: new URL(String(input)), init });
        return response();
      });
    },
  };
}

function setup(
  options: Partial<
    ConstructorParameters<typeof PhotonSuggestionProvider>[0]
  > = {},
) {
  const scripted = scriptedFetch();
  const provider = new PhotonSuggestionProvider({
    fetch: scripted.fetchMock as unknown as typeof fetch,
    isOnline: scripted.isOnline,
    minIntervalMs: 0,
    ...options,
  });
  return { scripted, provider };
}

runSuggestionProviderContract("PhotonSuggestionProvider", () => {
  const { scripted, provider } = setup();
  return {
    provider,
    controls: {
      willReturn: (results) => scripted.setScript({ kind: "results", results }),
      willFail: (failure) => scripted.setScript({ kind: "fail", failure }),
      hold: () => scripted.setScript({ kind: "hold" }),
    },
  };
});

describe("PhotonSuggestionProvider", () => {
  it("sends the documented request, with no cookies and no referrer", async () => {
    const { scripted, provider } = setup();
    await provider.suggest("  Table Mountain ");
    const call = scripted.calls[0];
    expect(call?.url.origin).toBe("https://photon.komoot.io");
    expect(call?.url.pathname).toBe("/api/");
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
      q: "Table Mountain",
      limit: "5",
      lang: "en",
    });
    expect(call?.init?.headers).toEqual({ Accept: "application/json" });
    expect(call?.init?.credentials).toBe("omit");
    expect(call?.init?.referrerPolicy).toBe("no-referrer");
  });

  it("sends no position, so typing never says where the map is", async () => {
    const { scripted, provider } = setup();
    await provider.suggest("a");
    const params = scripted.calls[0]?.url.searchParams;
    expect(params?.has("lat")).toBe(false);
    expect(params?.has("lon")).toBe(false);
  });

  it("honours a limit, an endpoint and a default limit", async () => {
    const { scripted, provider } = setup({
      endpoint: "https://geo.example.org/photon",
      defaultLimit: 3,
    });
    await provider.suggest("a");
    await provider.suggest("b", { limit: 8 });
    expect(scripted.calls[0]?.url.origin).toBe("https://geo.example.org");
    expect(scripted.calls[0]?.url.pathname).toBe("/photon");
    expect(scripted.calls[0]?.url.searchParams.get("limit")).toBe("3");
    expect(scripted.calls[1]?.url.searchParams.get("limit")).toBe("8");
  });

  it("sends nothing for a blank query", async () => {
    const { scripted, provider } = setup();
    expect(await provider.suggest("   ")).toEqual([]);
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the signal has already fired", async () => {
    const { scripted, provider } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.suggest("a", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PortAbortError);
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });

  describe("reading features", () => {
    function featureFor(
      properties: Record<string, unknown>,
      geometry: unknown = { type: "Point", coordinates: [18.4241, -33.9249] },
    ) {
      return { type: "Feature", geometry, properties };
    }

    async function read(...features: unknown[]) {
      const { scripted, provider } = setup();
      scripted.answerWith(() =>
        Promise.resolve(jsonResponse(collection(features))),
      );
      return provider.suggest("cape");
    }

    it("reads the centre as longitude then latitude, and the extent as west, north, east, south", async () => {
      const [result] = await read(
        featureFor({
          osm_type: "R",
          osm_id: 79604,
          name: "Cape Town",
          state: "Western Cape",
          country: "South Africa",
          extent: [18.3, -33.8, 18.9, -34.4],
        }),
      );
      expect(result).toEqual({
        id: "photon:R79604",
        label: "Cape Town",
        secondaryLabel: "Western Cape, South Africa",
        centre: { lat: -33.9249, lng: 18.4241 },
        bounds: { west: 18.3, north: -33.8, east: 18.9, south: -34.4 },
      });
    });

    it("builds the secondary label from the places around, without repeats", async () => {
      const [result] = await read(
        featureFor({
          osm_type: "N",
          osm_id: 1,
          name: "Cape Town",
          district: "Cape Town",
          city: "Cape Town",
          county: "City of Cape Town",
          state: "Western Cape",
          country: "South Africa",
        }),
      );
      expect(result?.secondaryLabel).toBe(
        "City of Cape Town, Western Cape, South Africa",
      );
    });

    it("labels a place with no name by its street line", async () => {
      const [result] = await read(
        featureFor({
          osm_type: "W",
          osm_id: 2,
          housenumber: "12",
          street: "Long Street",
          city: "Cape Town",
        }),
      );
      expect(result?.label).toBe("12 Long Street");
      expect(result?.secondaryLabel).toBe("Cape Town");
    });

    it("keeps the street line in the secondary label of a named place", async () => {
      const [result] = await read(
        featureFor({
          osm_type: "N",
          osm_id: 3,
          name: "Mount Nelson",
          street: "Orange Street",
          city: "Cape Town",
        }),
      );
      expect(result?.secondaryLabel).toBe("Orange Street, Cape Town");
    });

    it("gives a place a label only when it has a name or a street", async () => {
      const results = await read(
        featureFor({ osm_type: "N", osm_id: 4, city: "Cape Town" }),
      );
      expect(results).toEqual([]);
    });

    it("leaves out the extent when it is not four numbers", async () => {
      const [short, text] = await read(
        featureFor({ osm_type: "N", osm_id: 5, name: "A", extent: [1, 2, 3] }),
        featureFor({
          osm_type: "N",
          osm_id: 6,
          name: "B",
          extent: [1, 2, "x", 4],
        }),
      );
      expect(short?.bounds).toBeUndefined();
      expect(text?.bounds).toBeUndefined();
    });

    it("falls back to the position for the id when there is no OpenStreetMap id", async () => {
      const [result] = await read(featureFor({ name: "A" }));
      expect(result?.id).toBe("photon:-33.9249,18.4241");
    });

    it("skips features that are not a point with two finite coordinates", async () => {
      const results = await read(
        featureFor({ name: "line" }, { type: "LineString", coordinates: [] }),
        featureFor({ name: "short" }, { type: "Point", coordinates: [1] }),
        featureFor({ name: "text" }, { type: "Point", coordinates: ["1", 2] }),
        featureFor({ name: "nan" }, { type: "Point", coordinates: [1, null] }),
        featureFor({ name: "none" }, null),
        { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] } },
        featureFor({ name: "kept", osm_type: "N", osm_id: 7 }),
      );
      expect(results.map((result) => result.label)).toEqual(["kept"]);
    });

    it("keeps one of two features with the same OpenStreetMap id", async () => {
      const results = await read(
        featureFor({ osm_type: "N", osm_id: 8, name: "Twice" }),
        featureFor({ osm_type: "N", osm_id: 8, name: "Twice" }),
      );
      expect(results).toHaveLength(1);
    });
  });

  describe("failures", () => {
    it("is offline when the network fails and the browser says it is offline", async () => {
      const { scripted, provider } = setup({ isOnline: () => false });
      scripted.answerWith(() => Promise.reject(new TypeError("Failed")));
      const error = await provider.suggest("a").catch((e: unknown) => e);
      expect((error as SearchError).kind).toBe("offline");
    });

    it("has failed when the network fails and the browser says it is online", async () => {
      const { scripted, provider } = setup({ isOnline: () => true });
      scripted.answerWith(() => Promise.reject(new TypeError("Failed")));
      const error = await provider.suggest("a").catch((e: unknown) => e);
      expect((error as SearchError).kind).toBe("failed");
    });

    it("reports offline from navigator.onLine by default", async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError("boom"));
      const provider = new PhotonSuggestionProvider({
        fetch: fetchMock,
        minIntervalMs: 0,
      });
      const onLine = vi.spyOn(navigator, "onLine", "get");
      onLine.mockReturnValue(false);
      const offline = await provider.suggest("x").catch((e: unknown) => e);
      expect((offline as SearchError).kind).toBe("offline");
      onLine.mockReturnValue(true);
      const online = await provider.suggest("x").catch((e: unknown) => e);
      expect((online as SearchError).kind).toBe("failed");
      onLine.mockRestore();
    });

    it("uses the global fetch when none is given", async () => {
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(collection([])));
      const provider = new PhotonSuggestionProvider({ minIntervalMs: 0 });
      expect(await provider.suggest("x")).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockRestore();
    });

    it("has failed on an HTTP error, saying which", async () => {
      const { scripted, provider } = setup();
      scripted.answerWith(() => Promise.resolve(jsonResponse({}, 503)));
      const error = await provider.suggest("a").catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).kind).toBe("failed");
      expect((error as SearchError).message).toContain("503");
    });

    it("has failed when the body is not JSON", async () => {
      const { scripted, provider } = setup({ isOnline: () => false });
      scripted.answerWith(() =>
        Promise.resolve(new Response("<html>", { status: 200 })),
      );
      const error = await provider.suggest("a").catch((e: unknown) => e);
      expect((error as SearchError).kind).toBe("failed");
    });

    it.each([
      ["an array", []],
      ["null", null],
      ["an object with no features", { type: "FeatureCollection" }],
      ["features that are not a list", { features: "none" }],
    ])("has failed when the body is %s", async (_name, body) => {
      const { scripted, provider } = setup();
      scripted.answerWith(() => Promise.resolve(jsonResponse(body)));
      const error = await provider.suggest("a").catch((e: unknown) => e);
      expect((error as SearchError).kind).toBe("failed");
    });

    it("treats an abort while the body is read as a cancellation", async () => {
      const { scripted, provider } = setup();
      const controller = new AbortController();
      scripted.answerWith(() => {
        const response = new Response("{}");
        vi.spyOn(response, "json").mockImplementation(() => {
          controller.abort();
          return Promise.reject(new DOMException("aborted", "AbortError"));
        });
        return Promise.resolve(response);
      });
      await expect(
        provider.suggest("a", { signal: controller.signal }),
      ).rejects.toBeInstanceOf(PortAbortError);
    });

    it("treats an AbortError the caller did not cause as a cancellation", async () => {
      const { scripted, provider } = setup();
      scripted.answerWith(() =>
        Promise.reject(new DOMException("aborted", "AbortError")),
      );
      await expect(provider.suggest("a")).rejects.toBeInstanceOf(
        PortAbortError,
      );
    });
  });

  describe("timing", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("fails with a timeout error when the service does not answer in time", async () => {
      const { scripted, provider } = setup({ timeoutMs: 1000 });
      scripted.setScript({ kind: "hold" });
      const pending = provider.suggest("a").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(999);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const error = await pending;
      expect(error).toBeInstanceOf(SearchError);
      expect((error as SearchError).kind).toBe("failed");
      expect((error as SearchError).message).toContain("timed out");
    });

    it("does not time out a request that has answered", async () => {
      const { provider } = setup({ timeoutMs: 1000 });
      await provider.suggest("a");
      await vi.advanceTimersByTimeAsync(5000);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("starts requests at least the minimum interval apart", async () => {
      const { scripted, provider } = setup({ minIntervalMs: 250 });
      const first = provider.suggest("a");
      const second = provider.suggest("b");
      await first;
      await vi.advanceTimersByTimeAsync(249);
      expect(scripted.fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(scripted.fetchMock).toHaveBeenCalledTimes(2);
    });

    it("abandons a queued request when its signal fires, without sending it", async () => {
      const { scripted, provider } = setup({ minIntervalMs: 250 });
      await provider.suggest("a");
      const controller = new AbortController();
      const queued = provider.suggest("b", { signal: controller.signal });
      controller.abort();
      await expect(queued).rejects.toBeInstanceOf(PortAbortError);
      await vi.advanceTimersByTimeAsync(1000);
      expect(scripted.fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not time out the wait in the queue", async () => {
      const { scripted, provider } = setup({
        minIntervalMs: 2000,
        timeoutMs: 1000,
      });
      await provider.suggest("a");
      const second = provider.suggest("b");
      await vi.advanceTimersByTimeAsync(2000);
      await second;
      expect(scripted.fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
