import {
  createFakeServices,
  PortAbortError,
  type SearchResult,
} from "@karta/core";
import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import { LiveRegionProvider } from "../../ui/LiveRegion";
import {
  MIN_SEARCH_LENGTH,
  SEARCH_DEBOUNCE_MS,
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

  it("waits for the debounce before searching", async () => {
    const { result, services } = setup();
    services.fakes.search.setResults("ca", [CAPE_TOWN]);
    act(() => result.current.setQuery("ca"));
    expect(result.current.query).toBe("ca");
    await advance(SEARCH_DEBOUNCE_MS - 1);
    expect(services.fakes.search.searchCalls).toHaveLength(0);
    await advance(1);
    expect(services.fakes.search.searchCalls).toHaveLength(1);
    expect(result.current.state).toEqual({
      status: "results",
      results: [CAPE_TOWN],
    });
  });

  it("restarts the debounce on every keystroke and searches once", async () => {
    const { result, services } = setup();
    act(() => result.current.setQuery("ca"));
    await advance(200);
    act(() => result.current.setQuery("cap"));
    await advance(200);
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(services.fakes.search.searchCalls.map((c) => c.query)).toEqual([
      "cape",
    ]);
  });

  it("does not search for fewer than two characters, ignoring spaces", async () => {
    const { result, services } = setup();
    expect(MIN_SEARCH_LENGTH).toBe(2);
    act(() => result.current.setQuery("c"));
    act(() => result.current.setQuery(" c "));
    await advance(1000);
    expect(services.fakes.search.searchCalls).toHaveLength(0);
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("searches for the trimmed text and passes the bias", async () => {
    const bias = { south: -34, west: 18, north: -33, east: 19 };
    const { result, services } = setup({ bias });
    act(() => result.current.setQuery("  cape  "));
    await advance(SEARCH_DEBOUNCE_MS);
    const [call] = services.fakes.search.searchCalls;
    expect(call?.query).toBe("cape");
    expect(call?.options?.bias).toBe(bias);
    expect(call?.options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("goes back to idle, and cancels the request, when the text becomes too short", async () => {
    const { result, services } = setup();
    const held = services.fakes.search.holdNext();
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.state).toEqual({ status: "loading" });
    const signal = services.fakes.search.searchCalls[0]?.options?.signal;
    act(() => result.current.setQuery("c"));
    expect(signal?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: "idle" });
    await act(async () => held.resolve([CAPE_TOWN]));
    expect(result.current.state).toEqual({ status: "idle" });
    expect(polite()).toBe("");
  });

  it("shows loading while a request is pending", async () => {
    const { result, services } = setup();
    services.fakes.search.holdNext();
    act(() => result.current.setQuery("cape"));
    expect(result.current.state).toEqual({ status: "idle" });
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.state).toEqual({ status: "loading" });
  });

  it("aborts the previous request and renders only the latest results", async () => {
    const { result, services } = setup();
    const first = services.fakes.search.holdNext();
    const second = services.fakes.search.holdNext();
    act(() => result.current.setQuery("ca"));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.setQuery("cap"));
    await advance(SEARCH_DEBOUNCE_MS);
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
    act(() => result.current.setQuery("ca"));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.setQuery("cap"));
    await advance(SEARCH_DEBOUNCE_MS);
    await act(async () => first.reject(new Error("late")));
    expect(result.current.state).toEqual({ status: "loading" });
    expect(assertive()).toBe("");
  });

  it("announces the result count once the search settles", async () => {
    const { result, services } = setup();
    services.fakes.search.setResults("cape", [CAPE_TOWN, CAPRICORN]);
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(polite()).toBe("2 results");
  });

  it("announces no results", async () => {
    const { result } = setup();
    act(() => result.current.setQuery("zzzz"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(result.current.state).toEqual({ status: "empty" });
    expect(polite()).toBe("No results");
  });

  it("does not announce while still loading", async () => {
    const { result, services } = setup();
    services.fakes.search.holdNext();
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(polite()).toBe("");
  });

  it("does not announce an identical state twice in a row", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    act(() => result.current.setQuery("ca"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(polite()).toBe("1 result");
    services.fakes.search.setDefaultResults([CAPRICORN]);
    // Past the announcer's own de-duplication window, so only the hook can suppress.
    await advance(5000);
    act(() => result.current.setQuery("cap"));
    await advance(SEARCH_DEBOUNCE_MS);
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
    act(() => result.current.setQuery("ca"));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.clear());
    services.fakes.search.setDefaultResults([CAPE_TOWN, CAPRICORN]);
    await advance(3000);
    act(() => result.current.setQuery("cap"));
    await advance(SEARCH_DEBOUNCE_MS);
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
      act(() => result.current.setQuery("cape"));
      await advance(SEARCH_DEBOUNCE_MS);
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
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
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
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
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
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.clear());
    await act(async () => deliver([CAPE_TOWN]));
    expect(result.current.state).toEqual({ status: "idle" });
    expect(polite()).toBe("");
  });

  it("retries the current query at once", async () => {
    const { result, services } = setup();
    services.fakes.search.failWith("failed");
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
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

  it("settle fills the box without searching, and the next keystroke searches", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.settle("Cape Town"));
    expect(result.current.query).toBe("Cape Town");
    expect(result.current.state).toEqual({ status: "idle" });
    await advance(1000);
    expect(services.fakes.search.searchCalls).toHaveLength(1);

    // The label equals the text, the case that stuck the old boolean flag.
    act(() => result.current.settle("Cape Town"));
    act(() => result.current.setQuery("Cape Towns"));
    await advance(SEARCH_DEBOUNCE_MS);
    expect(services.fakes.search.searchCalls).toHaveLength(2);
  });

  it("settle cancels a search that is waiting or in flight", async () => {
    const { result, services } = setup();
    services.fakes.search.holdNext();
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    const signal = services.fakes.search.searchCalls[0]?.options?.signal;
    act(() => result.current.setQuery("cape t"));
    act(() => result.current.settle("Cape Town"));
    expect(signal?.aborted).toBe(true);
    await advance(1000);
    expect(services.fakes.search.searchCalls).toHaveLength(1);
  });

  it("clear empties the box and returns to idle", async () => {
    const { result, services } = setup();
    services.fakes.search.setDefaultResults([CAPE_TOWN]);
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    act(() => result.current.clear());
    expect(result.current.query).toBe("");
    expect(result.current.state).toEqual({ status: "idle" });
  });

  it("aborts the request and drops the timer on unmount", async () => {
    const { result, services, unmount } = setup();
    services.fakes.search.holdNext();
    act(() => result.current.setQuery("cape"));
    await advance(SEARCH_DEBOUNCE_MS);
    const signal = services.fakes.search.searchCalls[0]?.options?.signal;
    act(() => result.current.setQuery("cape town"));
    unmount();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(services.fakes.search.searchCalls).toHaveLength(1);
  });
});
