import { createFakeServices, type SearchResult } from "@mapcairn/core";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../../services/ServicesProvider";
import {
  MIN_SUGGEST_LENGTH,
  SUGGEST_COOLDOWN_MS,
  SUGGEST_DEBOUNCE_MS,
  SUGGEST_FAILURE_LIMIT,
  useSuggestions,
} from "./useSuggestions";

const announce = vi.hoisted(() => vi.fn());

vi.mock("../../ui/LiveRegion", () => ({ useAnnounce: () => announce }));

const CAPE_TOWN: SearchResult = {
  id: "ct",
  label: "Cape Town",
  centre: { lat: -33.9249, lng: 18.4241 },
};
const CAPRICORN: SearchResult = {
  id: "cp",
  label: "Capricorn",
  centre: { lat: -23.9, lng: 29.4 },
};

const UNAVAILABLE = [
  "Suggestions are unavailable. Press Enter to search.",
  { priority: "polite" },
];

interface Props {
  readonly query: string;
  readonly enabled?: boolean;
}

function setup(
  initial: Props,
  services: ReturnType<typeof createFakeServices> = createFakeServices(),
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesProvider services={services}>{children}</ServicesProvider>
  );
  const view = renderHook(
    ({ query, enabled = true }: Props) => useSuggestions(query, enabled),
    { wrapper, initialProps: initial },
  );
  return { ...view, services, fake: services.fakes.suggestions };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    announce.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks nothing until the text has settled, then asks once", async () => {
    const { rerender, fake } = setup({ query: "" });
    rerender({ query: "cap" });
    await advance(SUGGEST_DEBOUNCE_MS - 1);
    rerender({ query: "cape" });
    await advance(SUGGEST_DEBOUNCE_MS - 1);
    expect(fake.suggestCalls).toHaveLength(0);
    await advance(1);
    expect(fake.suggestCalls.map((call) => call.query)).toEqual(["cape"]);
  });

  it("returns the suggestions and announces how many, politely", async () => {
    const services = createFakeServices();
    services.fakes.suggestions.setDefaultResults([CAPE_TOWN, CAPRICORN]);
    const { result } = setup({ query: "cap" }, services);
    expect(result.current).toEqual([]);
    await advance(SUGGEST_DEBOUNCE_MS);
    expect(result.current).toEqual([CAPE_TOWN, CAPRICORN]);
    expect(announce).toHaveBeenCalledWith("2 suggestions", {
      priority: "polite",
    });
  });

  it("announces when nothing matches", async () => {
    const { result } = setup({ query: "zzz" });
    await advance(SUGGEST_DEBOUNCE_MS);
    expect(result.current).toEqual([]);
    expect(announce).toHaveBeenCalledWith("No suggestions", {
      priority: "polite",
    });
  });

  it(`asks nothing for fewer than ${MIN_SUGGEST_LENGTH} characters, and ignores spaces`, async () => {
    const { rerender, fake } = setup({ query: "ca" });
    await advance(SUGGEST_DEBOUNCE_MS * 2);
    rerender({ query: "  ca  " });
    await advance(SUGGEST_DEBOUNCE_MS * 2);
    expect(fake.suggestCalls).toHaveLength(0);
  });

  it("trims the text it asks about", async () => {
    const { fake } = setup({ query: "  cape  " });
    await advance(SUGGEST_DEBOUNCE_MS);
    expect(fake.suggestCalls.map((call) => call.query)).toEqual(["cape"]);
  });

  it("asks nothing for a pair of coordinates", async () => {
    const { result, fake } = setup({ query: "-26.2041, 28.0473" });
    await advance(SUGGEST_DEBOUNCE_MS * 2);
    expect(fake.suggestCalls).toHaveLength(0);
    expect(result.current).toEqual([]);
  });

  it("asks nothing while it is disabled, and clears what it had", async () => {
    const services = createFakeServices();
    services.fakes.suggestions.setDefaultResults([CAPE_TOWN]);
    const { result, rerender, fake } = setup({ query: "cape" }, services);
    await advance(SUGGEST_DEBOUNCE_MS);
    expect(result.current).toEqual([CAPE_TOWN]);
    rerender({ query: "cape", enabled: false });
    expect(result.current).toEqual([]);
    await advance(SUGGEST_DEBOUNCE_MS * 2);
    expect(fake.suggestCalls).toHaveLength(1);
  });

  it("clears the suggestions when the text becomes too short", async () => {
    const services = createFakeServices();
    services.fakes.suggestions.setDefaultResults([CAPE_TOWN]);
    const { result, rerender } = setup({ query: "cape" }, services);
    await advance(SUGGEST_DEBOUNCE_MS);
    rerender({ query: "ca" });
    expect(result.current).toEqual([]);
  });

  it("cancels the request in flight when the text changes, and drops its answer", async () => {
    const services = createFakeServices();
    const held = services.fakes.suggestions.holdNext();
    const { result, rerender, fake } = setup({ query: "cape" }, services);
    await advance(SUGGEST_DEBOUNCE_MS);
    const signal = fake.suggestCalls[0]?.options?.signal;
    expect(signal?.aborted).toBe(false);
    rerender({ query: "cape t" });
    expect(signal?.aborted).toBe(true);
    held.resolve([CAPRICORN]);
    await advance(0);
    expect(result.current).toEqual([]);
  });

  it("ignores an older answer that arrives after a newer one", async () => {
    const services = createFakeServices();
    const older = services.fakes.suggestions.holdNext();
    const newer = services.fakes.suggestions.holdNext();
    const { result, rerender } = setup({ query: "cape" }, services);
    await advance(SUGGEST_DEBOUNCE_MS);
    rerender({ query: "cape t" });
    await advance(SUGGEST_DEBOUNCE_MS);
    newer.resolve([CAPE_TOWN]);
    await advance(0);
    older.resolve([CAPRICORN]);
    await advance(0);
    expect(result.current).toEqual([CAPE_TOWN]);
  });

  it("cancels the request when it unmounts, and a waiting timer never fires", async () => {
    const services = createFakeServices();
    services.fakes.suggestions.holdNext();
    const { unmount, fake } = setup({ query: "cape" }, services);
    await advance(SUGGEST_DEBOUNCE_MS);
    const signal = fake.suggestCalls[0]?.options?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    setup({ query: "town" }, services).unmount();
    await advance(SUGGEST_DEBOUNCE_MS * 2);
    expect(fake.suggestCalls).toHaveLength(1);
  });

  it("does nothing, and shows nothing, when the host supplies no provider", async () => {
    const services = createFakeServices({ suggestions: undefined });
    const { result, fake } = setup({ query: "cape" }, services);
    await advance(SUGGEST_DEBOUNCE_MS * 2);
    expect(result.current).toEqual([]);
    expect(fake.suggestCalls).toHaveLength(0);
    expect(announce).not.toHaveBeenCalled();
  });

  describe("when the service fails", () => {
    /** Types a new text each time, so each one asks, and lets it fail. */
    async function typeAndFail(
      rerender: (props: Props) => void,
      count: number,
      prefix = "cape",
    ) {
      for (let attempt = 0; attempt < count; attempt += 1) {
        rerender({ query: `${prefix}${attempt}` });
        await advance(SUGGEST_DEBOUNCE_MS);
      }
    }

    it("shows nothing and stays silent for a failure or two", async () => {
      const { result, rerender, fake } = setup({ query: "" });
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT - 1);
      expect(fake.suggestCalls).toHaveLength(SUGGEST_FAILURE_LIMIT - 1);
      expect(result.current).toEqual([]);
      expect(announce).not.toHaveBeenCalled();
    });

    it("stops asking for a while after repeated failures, and says so once", async () => {
      const { rerender, fake } = setup({ query: "" });
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT);
      expect(announce.mock.calls).toEqual([UNAVAILABLE]);

      await typeAndFail(rerender, 3, "during");
      expect(fake.suggestCalls).toHaveLength(SUGGEST_FAILURE_LIMIT);

      await advance(SUGGEST_COOLDOWN_MS);
      await typeAndFail(rerender, 1, "after");
      expect(fake.suggestCalls).toHaveLength(SUGGEST_FAILURE_LIMIT + 1);
      // The service is still down, and the person is not told a second time.
      expect(announce.mock.calls).toEqual([UNAVAILABLE]);
    });

    it("asks again after the cooldown and shows what comes back", async () => {
      const { result, rerender, fake } = setup({ query: "" });
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT);
      fake.clearFailure();
      fake.setDefaultResults([CAPE_TOWN]);
      await advance(SUGGEST_COOLDOWN_MS);
      await typeAndFail(rerender, 1, "back");
      expect(result.current).toEqual([CAPE_TOWN]);
    });

    it("says so again if it fails again after a request has worked", async () => {
      const { rerender, fake } = setup({ query: "" });
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT);
      fake.clearFailure();
      await advance(SUGGEST_COOLDOWN_MS);
      await typeAndFail(rerender, 1, "works");
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT, "later");
      expect(
        announce.mock.calls.filter(([m]) => m === UNAVAILABLE[0]),
      ).toHaveLength(2);
    });

    it("stops at once when the service says to slow down", async () => {
      const { rerender, fake } = setup({ query: "" });
      fake.failWith("rate-limited");
      await typeAndFail(rerender, 1);
      expect(announce.mock.calls).toEqual([UNAVAILABLE]);
      await typeAndFail(rerender, 2, "next");
      expect(fake.suggestCalls).toHaveLength(1);
    });

    it("counts only failures that follow one another", async () => {
      const { rerender, fake } = setup({ query: "" });
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT - 1);
      fake.clearFailure();
      await typeAndFail(rerender, 1, "works");
      fake.failWith("failed");
      await typeAndFail(rerender, SUGGEST_FAILURE_LIMIT - 1, "fails");
      // Two failures, one success and two more failures: five asks, never paused.
      expect(fake.suggestCalls).toHaveLength(
        2 * (SUGGEST_FAILURE_LIMIT - 1) + 1,
      );
      expect(announce.mock.calls.map(([m]) => m)).not.toContain(UNAVAILABLE[0]);
    });
  });
});
