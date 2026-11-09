import {
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
} from "@karta/core";
import { runSearchProviderContract } from "@karta/core/contracts";
import { describe, expect, it, vi } from "vitest";
import { NominatimSearchProvider } from "./NominatimSearchProvider";

type Script =
  | { kind: "results"; results: readonly SearchResult[] }
  | { kind: "fail"; failure: SearchErrorKind }
  | { kind: "hold" };

function toNominatim(result: SearchResult) {
  const secondary = result.secondaryLabel ? `, ${result.secondaryLabel}` : "";
  return {
    place_id: result.id,
    name: result.label,
    display_name: `${result.label}${secondary}`,
    lat: String(result.centre.lat),
    lon: String(result.centre.lng),
    ...(result.bounds
      ? {
          boundingbox: [
            String(result.bounds.south),
            String(result.bounds.north),
            String(result.bounds.west),
            String(result.bounds.east),
          ],
        }
      : {}),
  };
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
      const url = new URL(String(input));
      calls.push({ url, init });
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
      if (url.pathname.endsWith("/reverse")) {
        const first = current.results[0];
        return Promise.resolve(
          jsonResponse(
            first ? toNominatim(first) : { error: "Unable to geocode" },
          ),
        );
      }
      return Promise.resolve(jsonResponse(current.results.map(toNominatim)));
    },
  );
  return {
    fetchMock,
    calls,
    isOnline: () => online,
    setScript(next: Script) {
      script = next;
    },
  };
}

function setup(
  options: Partial<
    ConstructorParameters<typeof NominatimSearchProvider>[0]
  > = {},
) {
  const scripted = scriptedFetch();
  const provider = new NominatimSearchProvider({
    fetch: scripted.fetchMock as unknown as typeof fetch,
    isOnline: scripted.isOnline,
    minIntervalMs: 0,
    ...options,
  });
  return { scripted, provider };
}

runSearchProviderContract("NominatimSearchProvider", () => {
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

describe("NominatimSearchProvider", () => {
  it("sends the documented search request", async () => {
    const { scripted, provider } = setup();
    await provider.search("  Table Mountain ");
    const call = scripted.calls[0];
    expect(call?.url.origin).toBe("https://nominatim.openstreetmap.org");
    expect(call?.url.pathname).toBe("/search");
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
      q: "Table Mountain",
      format: "jsonv2",
      limit: "6",
      addressdetails: "0",
    });
    expect(call?.init?.headers).toEqual({ Accept: "application/json" });
  });

  it("honours a limit, a bias box, country codes, an endpoint and a default limit", async () => {
    const { scripted, provider } = setup({
      countryCodes: "za",
      endpoint: "https://geo.example.org/",
      defaultLimit: 3,
    });
    await provider.search("a");
    expect(scripted.calls[0]?.url.origin).toBe("https://geo.example.org");
    expect(scripted.calls[0]?.url.searchParams.get("limit")).toBe("3");
    await provider.search("a", {
      limit: 9,
      bias: { south: -35, west: 18, north: -33, east: 19 },
    });
    const params = scripted.calls[1]?.url.searchParams;
    expect(params?.get("limit")).toBe("9");
    expect(params?.get("countrycodes")).toBe("za");
    expect(params?.get("viewbox")).toBe("18,-33,19,-35");
  });

  it("makes no request for a blank query", async () => {
    const { scripted, provider } = setup();
    expect(await provider.search("   ")).toEqual([]);
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });

  it("makes no request when the signal is already aborted", async () => {
    const { scripted, provider } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider.search("x", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PortAbortError);
    expect(scripted.fetchMock).not.toHaveBeenCalled();
  });

  it("sends the reverse request with the position", async () => {
    const { scripted, provider } = setup();
    await provider.reverse({ lat: -33.9, lng: 18.4 });
    const call = scripted.calls[0];
    expect(call?.url.pathname).toBe("/reverse");
    expect(Object.fromEntries(call?.url.searchParams ?? [])).toEqual({
      format: "jsonv2",
      lat: "-33.9",
      lon: "18.4",
    });
  });

  it("maps a Nominatim item to a result with labels, centre and bounds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          place_id: 42,
          name: "Table Mountain",
          display_name: "Table Mountain, Cape Town, South Africa",
          lat: "-33.9628",
          lon: "18.4098",
          boundingbox: ["-33.99", "-33.95", "18.39", "18.43"],
        },
      ]),
    );
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    expect(await provider.search("table")).toEqual([
      {
        id: "42",
        label: "Table Mountain",
        secondaryLabel: "Cape Town, South Africa",
        centre: { lat: -33.9628, lng: 18.4098 },
        bounds: { south: -33.99, west: 18.39, north: -33.95, east: 18.43 },
      },
    ]);
  });

  it("keeps the whole display name as the label when the place has no name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          place_id: 1,
          name: "",
          display_name: "12, Long Street, Cape Town",
          lat: "-33.92",
          lon: "18.42",
        },
        {
          place_id: 2,
          name: "Elsewhere",
          display_name: "Somewhere else entirely",
          lat: "1",
          lon: "2",
        },
      ]),
    );
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    const results = await provider.search("x");
    expect(results[0]).toEqual({
      id: "1",
      label: "12, Long Street, Cape Town",
      centre: { lat: -33.92, lng: 18.42 },
    });
    expect(results[1]?.label).toBe("Elsewhere");
    expect(results[1]?.secondaryLabel).toBe("Somewhere else entirely");
  });

  it("drops items that are unusable and bounds that are malformed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { place_id: 1, display_name: "No coordinates", lat: "x", lon: "y" },
        { display_name: "No id", lat: "1", lon: "2" },
        { place_id: 3, lat: "1", lon: "2" },
        {
          place_id: 4,
          display_name: "Bad box",
          lat: "1",
          lon: "2",
          boundingbox: ["a", "b", "c", "d"],
        },
        {
          place_id: 5,
          display_name: "Short box",
          lat: "1",
          lon: "2",
          boundingbox: ["1", "2"],
        },
      ]),
    );
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    const results = await provider.search("x");
    expect(results.map((result) => result.id)).toEqual(["4", "5"]);
    expect(results.every((result) => result.bounds === undefined)).toBe(true);
  });

  it("treats a reverse response with an error field as no place", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: "Unable to geocode" }));
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    expect(await provider.reverse({ lat: 0, lng: 0 })).toBeNull();
  });

  it("treats a reverse response that is not an object as no place", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    expect(await provider.reverse({ lat: 0, lng: 0 })).toBeNull();
  });

  it("reports failed for a body that is not a result list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ nope: true }));
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    const error = await provider.search("x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchError);
    expect((error as SearchError).kind).toBe("failed");
  });

  it("reports failed for a body that is not JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("<html>", { status: 200 }));
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    const error = await provider.search("x").catch((e: unknown) => e);
    expect((error as SearchError).kind).toBe("failed");
  });

  it("reports failed, not offline, for a network error while online", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("boom"));
    const provider = new NominatimSearchProvider({
      fetch: fetchMock,
      isOnline: () => true,
    });
    const error = await provider.search("x").catch((e: unknown) => e);
    expect((error as SearchError).kind).toBe("failed");
  });

  it("reports offline from navigator.onLine by default", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("boom"));
    const provider = new NominatimSearchProvider({
      fetch: fetchMock,
      minIntervalMs: 0,
    });
    const onLine = vi.spyOn(navigator, "onLine", "get");
    onLine.mockReturnValue(false);
    const offline = await provider.search("x").catch((e: unknown) => e);
    expect((offline as SearchError).kind).toBe("offline");
    onLine.mockReturnValue(true);
    const online = await provider.search("x").catch((e: unknown) => e);
    expect((online as SearchError).kind).toBe("failed");
    onLine.mockRestore();
  });

  it("treats an abort error from fetch as an abort even without a signal", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("aborted", "AbortError"));
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    await expect(provider.search("x")).rejects.toBeInstanceOf(PortAbortError);
  });

  it("treats a signal that fires while the body is read as an abort", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => {
        controller.abort();
        return Promise.reject(new DOMException("aborted", "AbortError"));
      },
    });
    const provider = new NominatimSearchProvider({ fetch: fetchMock });
    await expect(
      provider.search("x", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PortAbortError);
  });

  it("starts requests at least a second apart by default, as Nominatim's usage policy requires", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse([])));
      const provider = new NominatimSearchProvider({ fetch: fetchMock });

      void provider.search("first");
      void provider.reverse({ lat: 1, lng: 2 });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("abandons a queued request without sending it when its signal fires", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockImplementation(() => Promise.resolve(jsonResponse([])));
      const provider = new NominatimSearchProvider({ fetch: fetchMock });
      await provider.search("first");
      const controller = new AbortController();

      const queued = provider
        .search("second", { signal: controller.signal })
        .catch((error: unknown) => error);
      controller.abort();
      await vi.advanceTimersByTimeAsync(1000);

      expect(await queued).toBeInstanceOf(PortAbortError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads globalThis.fetch lazily when none is injected", async () => {
    const provider = new NominatimSearchProvider();
    const original = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      expect(await provider.search("x")).toEqual([]);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = original;
    }
  });
});
