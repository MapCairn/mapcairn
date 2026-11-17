// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  PortAbortError,
  SearchError,
  type SearchErrorKind,
  type SearchResult,
} from "@mapcairn/core";
import {
  runSearchProviderContract,
  runSuggestionProviderContract,
} from "@mapcairn/core/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createPlacesFetch,
  PLACES_ENDPOINT,
  PlaceSearchProvider,
  PlaceSuggestionProvider,
  type PlacesFetch,
} from "./placeSearch";
import { SAMPLE_PLACES } from "./samplePlaces";

type Script =
  | { kind: "results"; results: readonly SearchResult[] }
  | { kind: "fail"; failure: SearchErrorKind }
  | { kind: "hold" };

/** A result as the example's service would send it. */
function toItem(result: SearchResult) {
  const { bounds } = result;
  return {
    id: result.id,
    name: result.label,
    ...(result.secondaryLabel ? { area: result.secondaryLabel } : {}),
    lat: result.centre.lat,
    lon: result.centre.lng,
    ...(bounds
      ? { box: [bounds.south, bounds.west, bounds.north, bounds.east] }
      : {}),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A scripted `fetch` that rejects the way the real one does when aborted. */
function scriptedFetch() {
  let script: Script = { kind: "results", results: [] };
  let online = true;
  const urls: URL[] = [];
  const fetchMock = vi.fn(
    (input: string, init?: RequestInit): Promise<Response> => {
      urls.push(new URL(input));
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
      if (input.includes("/nearest")) {
        const first = current.results[0];
        return Promise.resolve(
          jsonResponse({ result: first ? toItem(first) : null }),
        );
      }
      return Promise.resolve(
        jsonResponse({ results: current.results.map(toItem) }),
      );
    },
  );
  return {
    fetchMock,
    urls,
    isOnline: () => online,
    setScript(next: Script) {
      script = next;
    },
  };
}

function scriptedControls(scripted: ReturnType<typeof scriptedFetch>) {
  return {
    willReturn: (results: readonly SearchResult[]) =>
      scripted.setScript({ kind: "results", results }),
    willFail: (failure: SearchErrorKind) =>
      scripted.setScript({ kind: "fail", failure }),
    hold: () => scripted.setScript({ kind: "hold" }),
  };
}

function setupSearch() {
  const scripted = scriptedFetch();
  const provider = new PlaceSearchProvider({
    fetch: scripted.fetchMock as PlacesFetch,
    isOnline: scripted.isOnline,
  });
  return { scripted, provider };
}

function setupSuggestions() {
  const scripted = scriptedFetch();
  const provider = new PlaceSuggestionProvider({
    fetch: scripted.fetchMock as PlacesFetch,
    isOnline: scripted.isOnline,
  });
  return { scripted, provider };
}

runSearchProviderContract("PlaceSearchProvider", () => {
  const { scripted, provider } = setupSearch();
  return { provider, controls: scriptedControls(scripted) };
});

runSuggestionProviderContract("PlaceSuggestionProvider", () => {
  const { scripted, provider } = setupSuggestions();
  return { provider, controls: scriptedControls(scripted) };
});

describe("the requests the providers send", () => {
  it("sends the trimmed query and the limit to the service's search path", async () => {
    const { scripted, provider } = setupSearch();

    await provider.search("  glen ", { limit: 3 });

    const url = scripted.urls[0];
    expect(url?.origin).toBe(PLACES_ENDPOINT);
    expect(url?.pathname).toBe("/search");
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      q: "glen",
      limit: "3",
    });
  });

  it("asks for a reverse lookup by position and for suggestions on their own path", async () => {
    const search = setupSearch();
    const suggestions = setupSuggestions();

    await search.provider.reverse({ lat: 57.05, lng: -3.65 });
    await suggestions.provider.suggest("gle");

    expect(search.scripted.urls[0]?.pathname).toBe("/nearest");
    expect(search.scripted.urls[0]?.searchParams.get("lat")).toBe("57.05");
    expect(search.scripted.urls[0]?.searchParams.get("lon")).toBe("-3.65");
    expect(suggestions.scripted.urls[0]?.pathname).toBe("/suggest");
  });

  it("sends nothing for a blank query", async () => {
    const search = setupSearch();
    const suggestions = setupSuggestions();

    expect(await search.provider.search("   ")).toEqual([]);
    expect(await suggestions.provider.suggest("")).toEqual([]);

    expect(search.scripted.fetchMock).not.toHaveBeenCalled();
    expect(suggestions.scripted.fetchMock).not.toHaveBeenCalled();
  });
});

describe("the mapping from the service's items to search results", () => {
  it("reads the id, labels, centre and the extent as south, west, north, east", async () => {
    const { scripted, provider } = setupSearch();
    scripted.setScript({
      kind: "results",
      results: [
        {
          id: "a",
          label: "A",
          secondaryLabel: "Somewhere",
          centre: { lat: 1, lng: 2 },
          bounds: { south: 0, west: 1, north: 3, east: 4 },
        },
      ],
    });

    expect(await provider.search("a")).toEqual([
      {
        id: "a",
        label: "A",
        secondaryLabel: "Somewhere",
        centre: { lat: 1, lng: 2 },
        bounds: { south: 0, west: 1, north: 3, east: 4 },
      },
    ]);
  });

  it("drops an item with no usable position or name, and an extent that is not four numbers", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          results: [
            { id: "no-position", name: "No position" },
            { id: "no-name", lat: 1, lon: 2 },
            { id: "bad-extent", name: "Bad extent", lat: 1, lon: 2, box: [1] },
            "not an object",
          ],
        }),
      ),
    );
    const provider = new PlaceSearchProvider({
      fetch: fetchMock as PlacesFetch,
    });

    expect(await provider.search("x")).toEqual([
      { id: "bad-extent", label: "Bad extent", centre: { lat: 1, lng: 2 } },
    ]);
  });

  it("fails a body that is not what the service documents", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ nope: 1 })));
    const provider = new PlaceSearchProvider({
      fetch: fetchMock as PlacesFetch,
    });

    const error = await provider.search("x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SearchError);
    expect((error as SearchError).kind).toBe("failed");
  });

  it("fails a body that is not JSON, and tells a cancelled request from a failed one", async () => {
    const notJson = new PlaceSearchProvider({
      fetch: (() =>
        Promise.resolve(
          new Response("<html>", { status: 200 }),
        )) as PlacesFetch,
    });
    const controller = new AbortController();
    const cancelled = new PlaceSearchProvider({
      fetch: (() => {
        controller.abort();
        return Promise.resolve(new Response("<html>", { status: 200 }));
      }) as PlacesFetch,
    });

    await expect(notJson.search("x")).rejects.toMatchObject({ kind: "failed" });
    await expect(
      cancelled.search("x", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PortAbortError);
  });

  it("reports a network failure as offline only when the browser says it is offline", async () => {
    const fetchMock = (() =>
      Promise.reject(new TypeError("Failed to fetch"))) as PlacesFetch;

    await expect(
      new PlaceSearchProvider({
        fetch: fetchMock,
        isOnline: () => true,
      }).search("x"),
    ).rejects.toMatchObject({ kind: "failed" });
    await expect(
      new PlaceSearchProvider({
        fetch: fetchMock,
        isOnline: () => false,
      }).search("x"),
    ).rejects.toMatchObject({ kind: "offline" });
  });

  it("reads the browser's own online state when it is given none", async () => {
    const provider = new PlaceSearchProvider({
      fetch: (() =>
        Promise.reject(new TypeError("Failed to fetch"))) as PlacesFetch,
    });

    await expect(provider.search("x")).rejects.toMatchObject({
      kind: "failed",
    });
  });

  it("answers a reverse lookup with no place as null, and a malformed body as a failure", async () => {
    const empty = new PlaceSearchProvider({
      fetch: (() =>
        Promise.resolve(jsonResponse({ result: null }))) as PlacesFetch,
    });
    const malformed = new PlaceSearchProvider({
      fetch: (() => Promise.resolve(jsonResponse([]))) as PlacesFetch,
    });

    expect(await empty.reverse({ lat: 0, lng: 0 })).toBeNull();
    await expect(malformed.reverse({ lat: 0, lng: 0 })).rejects.toMatchObject({
      kind: "failed",
    });
  });
});

describe("the example's local service", () => {
  const local = createPlacesFetch(SAMPLE_PLACES);
  const search = new PlaceSearchProvider({ fetch: local });
  const suggestions = new PlaceSuggestionProvider({ fetch: local });

  it("finds a place by any part of its name or area, ignoring case", async () => {
    const byName = await search.search("CAIRN");
    const byArea = await search.search("example glen");

    expect(byName.map((result) => result.label)).toEqual(["Cairn Hollow"]);
    expect(byArea.map((result) => result.label)).toEqual([
      "Cairn Hollow",
      "Loch Invented",
    ]);
  });

  it("returns an extent for a place that has one, so the map can fit it", async () => {
    const [glen] = await search.search("Glen Example");

    expect(glen?.bounds).toEqual({
      south: 57.03,
      west: -3.76,
      north: 57.11,
      east: -3.64,
    });
  });

  it("returns nothing for a query that matches nothing, and honours the limit", async () => {
    expect(await search.search("zzz")).toEqual([]);
    expect(await search.search("sample", { limit: 2 })).toHaveLength(2);
  });

  it("suggests the places a word of whose name starts with the typed text", async () => {
    const suggested = await suggestions.suggest("pla");

    expect(suggested.map((result) => result.label)).toEqual([
      "Ben Placeholder",
    ]);
    expect(await suggestions.suggest("ben", { limit: 1 })).toHaveLength(1);
  });

  it("finds the place at a position, and none far from every place", async () => {
    const near = await search.reverse({ lat: 57.0521, lng: -3.6479 });
    const far = await search.reverse({ lat: 0, lng: 0 });

    expect(near?.label).toBe("Cairn Hollow");
    expect(far).toBeNull();
  });

  it("rejects a request that is already cancelled, and answers 404 for an unknown path", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      search.search("glen", { signal: controller.signal }),
    ).rejects.toBeInstanceOf(PortAbortError);
    await expect(
      local(`${PLACES_ENDPOINT}/elsewhere`, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect((await local(`${PLACES_ENDPOINT}/elsewhere`)).status).toBe(404);
  });
});
