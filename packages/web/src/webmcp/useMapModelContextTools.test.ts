import {
  BUILT_IN_BASEMAP_CATALOGUE,
  createBasemapCatalogue,
  FAKE_IMAGERY_BASEMAP,
  FAKE_VECTOR_BASEMAP,
  FakeSearchProvider,
  type SearchProvider,
  type SearchResult,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "../basemaps/hostBasemaps";
import {
  basemapChoices,
  geocodeAll,
  MAX_MEASURE_LOCATIONS,
} from "./useMapModelContextTools";

describe("basemapChoices", () => {
  it("offers the basemaps the site's picker offers, in its order, except Satellite, with no auto choice", () => {
    const choices = basemapChoices(HOST_BASEMAP_CATALOGUE);
    expect(choices).toEqual([
      "bright",
      "positron",
      "osm",
      "topographic",
      "dark",
    ]);
    expect(choices).not.toContain("auto");
    expect(choices).not.toContain("satellite");
    for (const removed of ["liberty", "colorful", "fiord"]) {
      expect(choices).not.toContain(removed);
    }
  });

  it("follows whatever catalogue the host supplies", () => {
    const choices = basemapChoices(BUILT_IN_BASEMAP_CATALOGUE);
    expect(choices).toHaveLength(7);
    expect(choices).toContain("liberty");
    expect(choices).not.toContain("topographic");
  });

  // An agent must not accept a provider's licence on a person's behalf.
  it("leaves out a basemap whose licence is non-commercial", () => {
    const choices = basemapChoices(
      createBasemapCatalogue([FAKE_VECTOR_BASEMAP, FAKE_IMAGERY_BASEMAP]),
    );
    expect(choices).toEqual([FAKE_VECTOR_BASEMAP.id]);
  });
});

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
