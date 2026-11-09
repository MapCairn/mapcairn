import { describe, expect, it } from "vitest";
import { initialMapState, WORLD_VIEW } from "./initialView";

const shared = { center: { lat: 1, lng: 2 }, zoom: 9, bearing: 0 };
const saved = { center: { lat: -33.9, lng: 18.4 }, zoom: 11, bearing: 0 };

describe("initialMapState", () => {
  it("starts from a shared link's view and basemap", () => {
    expect(
      initialMapState({ view: shared, basemapId: "osm" }, { lastView: saved }),
    ).toEqual({ view: shared, basemapId: "osm" });
  });

  it("falls back to the view saved last time", () => {
    expect(initialMapState({}, { lastView: saved })).toEqual({
      view: saved,
      basemapId: undefined,
    });
  });

  it("shows the whole world on a first visit", () => {
    expect(initialMapState({}, { lastView: null }).view).toBe(WORLD_VIEW);
  });
});
