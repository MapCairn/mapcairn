import { BASEMAPS, DEFAULT_BASEMAP_ID } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  HOST_BASEMAP_CATALOGUE,
  HOST_BASEMAP_IDS,
  selectBasemaps,
} from "./hostBasemaps";

describe("the reference host's basemaps", () => {
  it("offers five basemaps, in this order", () => {
    expect(HOST_BASEMAP_IDS).toEqual([
      "bright",
      "positron",
      "osm",
      "topographic",
      "dark",
    ]);
    expect(
      HOST_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.id),
    ).toEqual([...HOST_BASEMAP_IDS]);
    expect(
      HOST_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.name),
    ).toEqual(["Bright", "Positron", "Streets", "Topographic", "Dark"]);
  });

  it("makes Bright the default", () => {
    expect(HOST_BASEMAP_CATALOGUE.defaultId).toBe(DEFAULT_BASEMAP_ID);
    expect(HOST_BASEMAP_CATALOGUE.defaultId).toBe("bright");
    expect(HOST_BASEMAP_CATALOGUE.basemaps[0]?.id).toBe("bright");
  });

  it("opens an id the site does not offer on Bright", () => {
    for (const id of [
      "liberty",
      "colorful",
      "fiord",
      "auto",
      "maptoolkit-dark",
      "",
      "__proto__",
    ]) {
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).toBeUndefined();
      expect(HOST_BASEMAP_CATALOGUE.resolve(id).id, id).toBe("bright");
    }
  });

  it("resolves each offered id to itself", () => {
    for (const id of HOST_BASEMAP_IDS) {
      expect(HOST_BASEMAP_CATALOGUE.resolve(id).id).toBe(id);
    }
  });

  it("uses the SDK's own definitions, not copies", () => {
    for (const basemap of HOST_BASEMAP_CATALOGUE.basemaps) {
      expect(basemap, basemap.id).toBe(
        BASEMAPS.find((candidate) => candidate.id === basemap.id),
      );
    }
  });

  it("names the id when the SDK has no such basemap, rather than offering fewer", () => {
    expect(() => selectBasemaps(["bright", "atlantis"])).toThrow(
      /SDK has no built-in basemap "atlantis"/,
    );
    expect(
      selectBasemaps(["osm", "bright"]).map((basemap) => basemap.id),
    ).toEqual(["osm", "bright"]);
  });

  it("leaves the SDK's list with all eight, so Liberty, Colorful and Fiord stay available to other hosts", () => {
    expect(BASEMAPS).toHaveLength(8);
    for (const id of ["liberty", "colorful", "fiord"]) {
      expect(
        BASEMAPS.some((basemap) => basemap.id === id),
        id,
      ).toBe(true);
    }
  });
});
