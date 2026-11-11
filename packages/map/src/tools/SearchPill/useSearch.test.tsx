import {
  createFakeServices,
  PortAbortError,
  type SearchResult,
} from "@mapcairn/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import {
  MIN_SEARCH_LENGTH,
  type UseSearch,
  type UseSearchOptions,
  useSearch,
} from "./useSearch";

const CAPE_TOWN: SearchResult = {
  id: "ct",
  label: "Cape Town",
  secondaryLabel: "Western Cape",
  centre: { lat: -33.9249, lng: 18.4241 },
};
const CAPRICORN: SearchResult = {
  id: "cp",
  label: "Capricorn",
  centre: { lat: -23.9, lng: 29.4 },
};

function setup(options?: UseSearchOptions, services = createFakeServices()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>
      <LiveRegionProvider>{children}</LiveRegionProvider>
    </ServicesProvider>
  );
  const view = renderHook(() => useSearch(options), { wrapper });
  return { ...view, services };
}

const polite = () => screen.getByTestId("live-region-polite").textContent;
const assertive = () => screen.getByTestId("live-region-assertive").textContent;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Types the text, then submits it, as Enter or the Search button does. */
async function searchFor(result: { current: UseSearch }, text: string) {
  act(() => result.current.setQuery(text));
  await act(async () => result.current.submit());
}

describe("useSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts idle with an empty query", () => {
    const { result } = setup();
    expect(result.current.query).toBe("");
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("never searches while the text is only typed", async () => {
    const { result, services } = setup();
    act(() => result.current.setQuery("ca"));
    act(() => result.current.setQuery("cap"));
    act(() => result.current.setQuery("cape"));
    await advance(10_000);
    expect(result.current.query).toBe("cape");
    expect(services.fakes.search.searchCalls).toHaveLength(0);
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("searches once for the text when it is submitted", async () => {
    const { result, services } = setup();
    services.fakes.search.setResults("cape", [CAPE_TOWN]);
    await searchFor(result, "cape");
    expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
      "cape",
    ]);
    expect(result.current.state).toEqual({
      status: "results",
      results: [CAPE_TOWN],
    });
  });

  it("does not search for fewer than two characters, ignoring spaces", async () => {
    const { result, services } = setup();
    expect(MIN_SEARCH_LENGTH).toBe(2);
    await searchFor(result, "c");
    await searchFor(result, " c ");
    expect(services.fakes.search.searchCalls).toHaveLength(0);
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("searches for the trimmed text and reads the bias when it submits", async () => {
    const first = { south: -34, west: 18, north: -33, east: 19 };
    const second = { south: -35, west: 17, north: -32, east: 20 };
    let bias = first;
    const { result, services } = setup({ getBias: () => bias });
    bias = second;
    await searchFor(result, "  cape  ");
    const [call] = services.fakes.search.searchCalls;
    expect(call?.query).toBe("cape");
    expect(call?.options?.bias).toBe(second);
    expect(call?.options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends no bias when there is none", async () => {
    const { result, services } = setup({ getBias: () => undefined });
    await searchFor(result, "cape");
    expect(services.fakes.search.searchCalls[0]?.options?.bias).toBeUndefined();
  });

  it("does not search again when the same text is submitted while its results show", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    await searchFor(result, "cape");
    await act(async () => result.current.submit());
    expect(services.fakes.search.searchCalls).toHaveLength(1);
    expect(result.current.state.status).toBe("results");
  });

  it("searches again when the same text is submitted after a failure", async () => {
    const { result, services } = setup();
    services.fakes.search.failWith("failed");
    await searchFor(result, "cape");
    services.fakes.search.clearFailure();
    await act(async () => result.current.submit());
    expect(services.fakes.search.searchCalls).toHaveLength(2);
  });

  it("goes back to idle, and cancels the request, when the text changes", async () => {
    const { result, services } = setup();
    const held = services.fakes.search.holdNext();
    await searchFor(result, "cape");
    expect(result.current.state).toEqual({ status: "loading" });
    const signal = services.fakes.search.searchCalls[0]?.options?.signal;
    act(() => result.current.setQuery("cape t"));
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: "idle" });
    await act(async () => held.resolve([CAPE_TOWN]));
    expect(result.current.state).toEqual({ status: "idle" });
    expect(polite()).toBe("");
  });

  it("hides results for older text as soon as the text changes", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    await searchFor(result, "cape");
    act(() => result.current.setQuery("capr"));
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("shows loading while a request is pending", async () => {
    const { result, services } = setup();
    services.fakes.search.holdNext();
    act(() => result.current.setQuery("cape"));
    expect(result.current.state).toEqual({ status: "idle" });
    await act(async () => result.current.submit());
    expect(result.current.state).toEqual({ status: "loading" });
  });

  it("aborts the previous request and renders only the latest results", async () => {
    const { result, services } = setup();
    const first = services.fakes.search.holdNext();
    const second = services.fakes.search.holdNext();
    await searchFor(result, "ca");
    await searchFor(result, "cap");
    const [firstCall, secondCall] = services.fakes.search.searchCalls;
    expect(firstCall?.options?.signal?.aborted).toBe(true);
    expect(secondCall?.options?.signal?.aborted).toBe(false);

    await act(async () => second.resolve([CAPRICORN]));
    await act(async () => first.resolve([CAPE_TOWN]));
    expect(result.current.state).toEqual({
      status: "results",
      results: [CAPRICORN],
    });
    expect(polite()).toBe("1 result");
  });

  it("ignores an aborted request that fails afterwards", async () => {
    const { result, services } = setup();
    const first = services.fakes.search.holdNext();
    services.fakes.search.holdNext();
    await searchFor(result, "ca");
    await searchFor(result, "cap");
    await act(async () => first.reject(new Error("late")));
    expect(result.current.state).toEqual({ status: "loading" });
    expect(assertive()).toBe("");
  });

  it("announces the result count once the search settles", async () => {
    const { result, services } = setup();
    services.fakes.search.setResults("cape", [CAPE_TOWN, CAPRICORN]);
    await searchFor(result, "cape");
    expect(polite()).toBe("2 results");
  });

  it("announces no results", async () => {
    const { result } = setup();
    await searchFor(result, "zzzz");
    expect(result.current.state).toEqual({ status: "empty" });
    expect(polite()).toBe("No results");
  });

  it("does not announce while still loading", async () => {
    const { result, services } = setup();
    services.fakes.search.holdNext();
    await searchFor(result, "cape");
    expect(polite()).toBe("");
  });

  it("does not announce an identical state twice in a row", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    await searchFor(result, "ca");
    expect(polite()).toBe("1 result");
    services.fakes.search.setDefaultResults([CAPRICORN]);
    // Past the announcer's own de-duplication window, so only the hook can suppress.
    await advance(5000);
    await searchFor(result, "cap");
    expect(result.current.state).toEqual({
      status: "results",
      results: [CAPRICORN],
    });
    // A repeat would empty the region for a moment before refilling it.
    expect(polite()).toBe("1 result");
  });

  it("announces again after the box has been emptied", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    await searchFor(result, "ca");
    act(() => result.current.clear());
    services.fakes.search.setDefaultResults([CAPE_TOWN, CAPRICORN]);
    await advance(3000);
    await searchFor(result, "cap");
    expect(polite()).toBe("2 results");
  });

  it.each([
    [
      "offline",
      "You appear to be offline. Check your connection and try again.",
    ],
    [
      "rate-limited",
      "Too many searches in a short time. Wait a moment and try again.",
    ],
    ["failed", "Search did not work. Try again in a moment."],
  ] as const)(
    "maps a %s failure to an error state and an assertive announcement",
    async (kind, message) => {
      const { result, services } = setup();
      services.fakes.search.failWith(kind);
      await searchFor(result, "cape");
      expect(result.current.state).toEqual({ status: "error", kind });
      expect(assertive()).toBe(message);
      expect(polite()).toBe("");
    },
  );

  it("treats an unexpected error as a failed search", async () => {
    const services = createFakeServices({
      search: {
        search: () => Promise.reject(new Error("boom")),
        reverse: () => Promise.resolve(null),
      },
    });
    const { result } = setup(undefined, services);
    await searchFor(result, "cape");
    expect(result.current.state).toEqual({ status: "error", kind: "failed" });
  });

  it("ignores a PortAbortError that is not from its own signal", async () => {
    const services = createFakeServices({
      search: {
        search: () => Promise.reject(new PortAbortError()),
        reverse: () => Promise.resolve(null),
      },
    });
    const { result } = setup(undefined, services);
    await searchFor(result, "cape");
    expect(result.current.state).toEqual({ status: "loading" });
    expect(assertive()).toBe("");
  });

  it("drops results that arrive after cancel from a provider that ignores its signal", async () => {
    let deliver: (results: SearchResult[]) => void = () => undefined;
    const services = createFakeServices({
      search: {
        search: () =>
          new Promise((resolve) => {
            deliver = resolve;
          }),
        reverse: () => Promise.resolve(null),
      },
    });
    const { result } = setup(undefined, services);
    await searchFor(result, "cape");
    act(() => result.current.clear());
    await act(async () => deliver([CAPE_TOWN]));
    expect(result.current.state).toEqual({ status: "idle" });
    expect(polite()).toBe("");
  });

  it("retries the current query at once", async () => {
    const { result, services } = setup();
    services.fakes.search.failWith("failed");
    await searchFor(result, "cape");
    expect(result.current.state).toEqual({ status: "error", kind: "failed" });
    services.fakes.search.clearFailure();
    services.fakes.search.setResults("cape", [CAPE_TOWN]);
    await act(async () => result.current.retry());
    expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
      "cape",
      "cape",
    ]);
    expect(result.current.state).toEqual({
      status: "results",
      results: [CAPE_TOWN],
    });
  });

  it("does nothing on retry when the text is too short", async () => {
    const { result, services } = setup();
    await act(async () => result.current.retry());
    expect(services.fakes.search.searchCalls).toHaveLength(0);
  });

  it("settle fills the box without searching, and the next submit searches", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    await searchFor(result, "cape");
    act(() => result.current.settle("Cape Town"));
    expect(result.current.query).toBe("Cape Town");
    expect(result.current.state).toEqual({ status: "idle" });
    await advance(1000);
    expect(services.fakes.search.searchCalls).toHaveLength(1);

    await act(async () => result.current.submit());
    expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
      "cape",
      "Cape Town",
    ]);
  });

  it("settle cancels a search in flight", async () => {
    const { result, services } = setup();
    services.fakes.search.holdNext();
    await searchFor(result, "cape");
    const signal = services.fakes.search.searchCalls[0]?.options?.signal;
    act(() => result.current.settle("Cape Town"));
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("clear empties the box and returns to idle", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    await searchFor(result, "cape");
    act(() => result.current.clear());
    expect(result.current.query).toBe("");
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("aborts the request on unmount", async () => {
    const { result, services, unmount } = setup();
    services.fakes.search.holdNext();
    await searchFor(result, "cape");
    const signal = services.fakes.search.searchCalls[0]?.options?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  describe("coordinates", () => {
    const JOHANNESBURG_RESULT: SearchResult = {
      id: "coordinates:-26.20410,28.04730",
      label: "Coordinates 26.20410° S, 28.04730° E",
      centre: { lat: -26.2041, lng: 28.0473 },
    };

    it.each([
      "-26.2041, 28.0473",
      "-26.2041 28.0473",
      "26.2041S 28.0473E",
      "S26.2041 E28.0473",
      `26°12'14.8"S 28°02'50.3"E`,
    ])(
      "answers %j with its own result and never asks the geocoder",
      async (text) => {
        const { result, services } = setup();
        await searchFor(result, text);
        expect(services.fakes.search.searchCalls).toHaveLength(0);
        const state = result.current.state;
        expect(state.status).toBe("results");
        if (state.status === "results") {
          expect(state.results).toHaveLength(1);
          expect(state.results[0]?.centre.lat).toBeCloseTo(-26.2041, 4);
          expect(state.results[0]?.centre.lng).toBeCloseTo(28.0473, 4);
        }
      },
    );

    it("never goes through a loading state", async () => {
      const { result } = setup();
      act(() => result.current.setQuery("-26.2041, 28.0473"));
      act(() => result.current.submit());
      expect(result.current.state).toEqual({
        status: "results",
        results: [JOHANNESBURG_RESULT],
      });
    });

    it("announces the result with its label, through the polite region", async () => {
      const { result } = setup();
      await searchFor(result, "-26.2041, 28.0473");
      expect(polite()).toBe("1 result, Coordinates 26.20410° S, 28.04730° E");
    });

    it("announces a second coordinate search for another place", async () => {
      const { result } = setup();
      await searchFor(result, "-26.2041, 28.0473");
      await advance(5000);
      await searchFor(result, "51.5, -0.12");
      expect(polite()).toBe("1 result, Coordinates 51.50000° N, 0.12000° W");
    });

    it.each(["02-123", "00-001", "12-34", "44-100", "12-14", "12 34", "E1 6"])(
      "sends %j to the geocoder, because it is not a coordinate pair",
      async (text) => {
        const { result, services } = setup();
        services.fakes.search.setDefaultResults([CAPE_TOWN]);
        await searchFor(result, text);
        expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
          text,
        ]);
        expect(result.current.state).toEqual({
          status: "results",
          results: [CAPE_TOWN],
        });
      },
    );

    it("sends no request while the coordinates are only typed", async () => {
      const { result, services } = setup();
      act(() => result.current.setQuery("-26.2041, 28.0473"));
      await advance(10_000);
      expect(result.current.state).toEqual({ status: "idle" });
      expect(services.fakes.search.searchCalls).toHaveLength(0);
    });

    it("still searches for text that is not a coordinate pair", async () => {
      const { result, services } = setup();
      services.fakes.search.setResults("2196", [CAPE_TOWN]);
      await searchFor(result, "2196");
      expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
        "2196",
      ]);
      await searchFor(result, "91, 200");
      expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
        "2196",
        "91, 200",
      ]);
    });

    it("cancels a search in flight when coordinates are submitted instead", async () => {
      const { result, services } = setup();
      services.fakes.search.holdNext();
      await searchFor(result, "cape");
      const signal = services.fakes.search.searchCalls[0]?.options?.signal;
      await searchFor(result, "-26.2041, 28.0473");
      expect(signal?.aborted).toBe(true);
      expect(result.current.state).toEqual({
        status: "results",
        results: [JOHANNESBURG_RESULT],
      });
    });

    it("does not answer again for the same text while its result shows", async () => {
      const { result } = setup();
      await searchFor(result, "-26.2041, 28.0473");
      await act(async () => result.current.submit());
      expect(result.current.state.status).toBe("results");
      expect(polite()).toBe("1 result, Coordinates 26.20410° S, 28.04730° E");
    });

    it("answers again on retry", async () => {
      const { result, services } = setup();
      await searchFor(result, "-26.2041, 28.0473");
      act(() => result.current.retry());
      expect(result.current.state).toEqual({
        status: "results",
        results: [JOHANNESBURG_RESULT],
      });
      expect(services.fakes.search.searchCalls).toHaveLength(0);
    });

    it("reads the label of its own result back, so the box can show it", async () => {
      const { result, services } = setup();
      await searchFor(result, "-26.2041, 28.0473");
      act(() => result.current.settle(JOHANNESBURG_RESULT.label));
      await act(async () => result.current.submit());
      expect(result.current.state.status).toBe("results");
      expect(services.fakes.search.searchCalls).toHaveLength(0);
    });
  });
});
