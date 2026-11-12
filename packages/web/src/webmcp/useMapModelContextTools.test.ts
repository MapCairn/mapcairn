// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BUILT_IN_BASEMAP_CATALOGUE,
  createBasemapCatalogue,
  FAKE_HYBRID_BASEMAP,
  FAKE_VECTOR_BASEMAP,
  FakeSearchProvider,
  type SearchProvider,
  type SearchResult,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "../basemaps/hostBasemaps";
import {
  basemapChoices,
  findPlace,
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
      createBasemapCatalogue([FAKE_VECTOR_BASEMAP, FAKE_HYBRID_BASEMAP]),
    );
    expect(choices).toEqual([FAKE_VECTOR_BASEMAP.id]);
  });
});

function place(id: string): SearchResult {
  return { id, label: id, centre: { lat: 0, lng: 0 } };
}

// The privacy policy says a search that is only coordinates is read in the
// browser and never sent to the geocoder; the agent tools keep to that too.
describe("findPlace", () => {
  it("reads coordinates in the browser and sends nothing", async () => {
    const fake = new FakeSearchProvider();
    const found = await findPlace(fake, "-33.9249, 18.4241");
    expect(found?.centre).toEqual({ lat: -33.9249, lng: 18.4241 });
    expect(fake.searchCalls).toHaveLength(0);
  });

  it("asks the provider for the best match for a name", async () => {
    const fake = new FakeSearchProvider();
    fake.setDefaultResults([place("x"), place("y")]);
    expect(await findPlace(fake, "Cape Town")).toEqual(place("x"));
    expect(fake.searchCalls.map((call) => call.query)).toEqual(["Cape Town"]);
    expect(fake.searchCalls[0]?.options?.limit).toBe(1);
  });

  it("finds nothing when the provider has no match", async () => {
    const fake = new FakeSearchProvider();
    fake.setDefaultResults([]);
    expect(await findPlace(fake, "Atlantis")).toBeNull();
  });
});

describe("geocodeAll", () => {
  it("searches only the names, reading coordinates in the browser", async () => {
    const fake = new FakeSearchProvider();
    fake.setDefaultResults([place("Cape Town")]);
    const result = await geocodeAll(fake, ["Cape Town", "-26.2041, 28.0473"]);
    expect(fake.searchCalls.map((call) => call.query)).toEqual(["Cape Town"]);
    expect(result).toEqual({
      found: [
        place("Cape Town"),
        expect.objectContaining({ centre: { lat: -26.2041, lng: 28.0473 } }),
      ],
    });
  });

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
