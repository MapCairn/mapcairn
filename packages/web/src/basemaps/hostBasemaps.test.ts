import { BASEMAPS, DEFAULT_BASEMAP_ID, getBasemap } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  HOST_BASEMAP_CATALOGUE,
  HOST_BASEMAP_IDS,
  HOST_OWN_BASEMAPS,
  selectBasemaps,
} from "./hostBasemaps";
import { OPEN_TOPO_MAP_BASEMAP } from "./openTopoMapBasemap";

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

  it("uses the SDK's own definitions for Bright, Positron, Streets and Dark, not copies", () => {
    for (const id of ["bright", "positron", "osm", "dark"]) {
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).toBe(getBasemap(id));
    }
  });

  it("offers Topographic from the host's own definition, which the SDK does not have", () => {
    const topographic = HOST_BASEMAP_CATALOGUE.get("topographic");
    expect(topographic).toBe(OPEN_TOPO_MAP_BASEMAP);
    expect(HOST_OWN_BASEMAPS).toEqual([OPEN_TOPO_MAP_BASEMAP]);
    expect(getBasemap("topographic")).toBeUndefined();
    expect(BASEMAPS.some((basemap) => basemap.id === "topographic")).toBe(
      false,
    );
  });

  it("names the id when neither the host nor the SDK has such a basemap, rather than offering fewer", () => {
    expect(() => selectBasemaps(["bright", "atlantis"])).toThrow(
      /no basemap "atlantis"/,
    );
    expect(() => selectBasemaps(["topographic"])).toThrow(
      /no basemap "topographic"/,
    );
    expect(
      selectBasemaps(["osm", "bright"]).map((basemap) => basemap.id),
    ).toEqual(["osm", "bright"]);
  });

  it("takes a host definition in preference to the SDK's and keeps the order given", () => {
    const ownOsm = { ...OPEN_TOPO_MAP_BASEMAP, id: "osm", name: "Own" };
    const picked = selectBasemaps(["osm", "bright"], [ownOsm]);
    expect(picked[0]).toBe(ownOsm);
    expect(picked[1]).toBe(getBasemap("bright"));
  });

  it("leaves the SDK's list with seven, so Liberty, Colorful and Fiord stay available to other hosts", () => {
    expect(BASEMAPS).toHaveLength(7);
    for (const id of ["liberty", "colorful", "fiord"]) {
      expect(
        BASEMAPS.some((basemap) => basemap.id === id),
        id,
      ).toBe(true);
    }
  });
});

describe("the Topographic basemap", () => {
  it("draws OpenTopoMap raster tiles, 256 px, to normalised zoom 17", () => {
    expect(OPEN_TOPO_MAP_BASEMAP.id).toBe("topographic");
    expect(OPEN_TOPO_MAP_BASEMAP.name).toBe("Topographic");
    expect(OPEN_TOPO_MAP_BASEMAP.source).toEqual({
      kind: "raster",
      tileUrl: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
      tileSize: 256,
    });
    expect(OPEN_TOPO_MAP_BASEMAP.minZoom).toBe(0);
    expect(OPEN_TOPO_MAP_BASEMAP.maxZoom).toBe(17);
    expect(OPEN_TOPO_MAP_BASEMAP.thumbnail).toBe("/basemaps/topographic.jpg");
    expect(OPEN_TOPO_MAP_BASEMAP.appearance).toBe("light");
    expect(OPEN_TOPO_MAP_BASEMAP.swatch).toBeUndefined();
  });

  it("credits OpenStreetMap contributors, SRTM, OpenTopoMap and CC-BY-SA, all linked over https", () => {
    expect(OPEN_TOPO_MAP_BASEMAP.attribution).toEqual([
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
      {
        text: "SRTM",
        href: "https://www.earthdata.nasa.gov/data/instruments/srtm",
      },
      { text: "© OpenTopoMap", href: "https://opentopomap.org" },
      {
        text: "CC-BY-SA",
        href: "https://creativecommons.org/licenses/by-sa/3.0/",
      },
    ]);
  });
});
