import {
  FakeSearchProvider,
  type SearchProvider,
  type SearchResult,
} from "@karta/core";
import { describe, expect, it, vi } from "vitest";
import { geocodeAll, MAX_MEASURE_LOCATIONS } from "./useMapModelContextTools";

function place(id: string): SearchResult {
  return { id, label: id, centre: { lat: 0, lng: 0 } };
}

describe("geocodeAll", () => {
  it("looks places up one at a time, starting each only after the last has answered", async () => {
    const fake = new FakeSearchProvider();
    const first = fake.holdNext();
    const second = fake.holdNext();

    const pending = geocodeAll(fake, ["a", "b"]);
    await Promise.resolve();
    expect(fake.searchCalls.map((call) => call.query)).toEqual(["a"]);

    first.resolve([place("a")]);
    await vi.waitFor(() => {
      expect(fake.searchCalls.map((call) => call.query)).toEqual(["a", "b"]);
    });
    second.resolve([place("b")]);

    expect(await pending).toEqual({ found: [place("a"), place("b")] });
  });

  it("asks for one result per place", async () => {
    const fake = new FakeSearchProvider();
    fake.setDefaultResults([place("x")]);
    await geocodeAll(fake, ["a"]);
    expect(fake.searchCalls[0]?.options?.limit).toBe(1);
  });

  it("stops at the first place with no match and names it", async () => {
    const search = vi.fn<SearchProvider["search"]>(async (query) =>
      query === "nowhere" ? [] : [place(query)],
    );
    const provider: SearchProvider = {
      search,
      reverse: async () => null,
    };

    expect(await geocodeAll(provider, ["a", "nowhere", "c"])).toEqual({
      missing: "nowhere",
    });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe("MAX_MEASURE_LOCATIONS", () => {
  it("caps a measurement at ten places", () => {
    expect(MAX_MEASURE_LOCATIONS).toBe(10);
  });
});
