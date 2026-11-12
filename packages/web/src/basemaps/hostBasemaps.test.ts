// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { existsSync } from "node:fs";
import { join } from "node:path";
import { BASEMAPS, DEFAULT_BASEMAP_ID, getBasemap } from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { BASEMAP_THUMBNAILS } from "./basemapThumbnails";
import {
  HOST_BASEMAP_CATALOGUE,
  HOST_BASEMAP_IDS,
  HOST_OWN_BASEMAPS,
  selectBasemaps,
} from "./hostBasemaps";
import { OPEN_TOPO_MAP_BASEMAP } from "./openTopoMapBasemap";
import { SATELLITE_BASEMAP, SATELLITE_IMAGERY_YEAR } from "./satelliteBasemap";

/** The folder the site serves at its root, where a thumbnail path points. */
const PUBLIC_DIRECTORY = join(__dirname, "../../public");

describe("the reference host's basemaps", () => {
  it("offers six basemaps, two full rows of three, in this order", () => {
    expect(HOST_BASEMAP_IDS).toEqual([
      "bright",
      "positron",
      "osm",
      "topographic",
      "satellite",
      "dark",
    ]);
    expect(
      HOST_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.id),
    ).toEqual([...HOST_BASEMAP_IDS]);
    expect(
      HOST_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.name),
    ).toEqual([
      "Bright",
      "Positron",
      "Streets",
      "Topographic",
      "Satellite",
      "Dark",
    ]);
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

  it("names a preview for every basemap it offers, and the site serves each file", () => {
    for (const basemap of HOST_BASEMAP_CATALOGUE.basemaps) {
      expect(basemap.thumbnail, basemap.id).toBeDefined();
      const file = join(PUBLIC_DIRECTORY, basemap.thumbnail ?? "");
      expect(existsSync(file), `${basemap.id}: ${file}`).toBe(true);
    }
  });

  it("resolves each offered id to itself", () => {
    for (const id of HOST_BASEMAP_IDS) {
      expect(HOST_BASEMAP_CATALOGUE.resolve(id).id).toBe(id);
    }
  });

  it("uses the SDK's definitions for Bright, Positron, Streets and Dark, with the host's preview added and nothing else changed", () => {
    for (const id of ["bright", "positron", "osm", "dark"]) {
      expect(getBasemap(id)?.thumbnail, id).toBeUndefined();
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).toEqual({
        ...getBasemap(id),
        thumbnail: `/basemaps/${id}.jpg`,
      });
      expect(HOST_BASEMAP_CATALOGUE.get(id), id).not.toBe(getBasemap(id));
    }
  });

  it("leaves every SDK definition and the host's own definitions without a preview", () => {
    for (const basemap of [...BASEMAPS, ...HOST_OWN_BASEMAPS]) {
      expect(basemap.thumbnail, basemap.id).toBeUndefined();
    }
  });

  it("lists a preview for exactly the basemaps it offers, each the jpg of its own id", () => {
    expect(Object.keys(BASEMAP_THUMBNAILS).sort()).toEqual(
      [...HOST_BASEMAP_IDS].sort(),
    );
    for (const [id, path] of Object.entries(BASEMAP_THUMBNAILS)) {
      expect(path, id).toBe(`/basemaps/${id}.jpg`);
    }
  });

  it("offers Topographic from the host's own definition, which the SDK does not have", () => {
    const topographic = HOST_BASEMAP_CATALOGUE.get("topographic");
    expect(topographic).toEqual({
      ...OPEN_TOPO_MAP_BASEMAP,
      thumbnail: "/basemaps/topographic.jpg",
    });
    expect(HOST_OWN_BASEMAPS).toEqual([
      OPEN_TOPO_MAP_BASEMAP,
      SATELLITE_BASEMAP,
    ]);
    expect(getBasemap("topographic")).toBeUndefined();
    expect(BASEMAPS.some((basemap) => basemap.id === "topographic")).toBe(
      false,
    );
  });

  it("offers Satellite from the host's own definition, which the SDK must never have", () => {
    expect(HOST_BASEMAP_CATALOGUE.get("satellite")).toEqual({
      ...SATELLITE_BASEMAP,
      thumbnail: "/basemaps/satellite.jpg",
    });
    expect(getBasemap("satellite")).toBeUndefined();
    expect(BASEMAPS.some((basemap) => basemap.nonCommercial)).toBe(false);
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

describe("the Satellite basemap", () => {
  const year = SATELLITE_IMAGERY_YEAR;

  it("draws EOX Sentinel-2 cloudless imagery, 256 px Web Mercator tiles in row then column order, with real detail to level 14", () => {
    expect(SATELLITE_BASEMAP.id).toBe("satellite");
    expect(SATELLITE_BASEMAP.name).toBe("Satellite");
    expect(SATELLITE_BASEMAP.source).toMatchObject({
      kind: "hybrid",
      tileUrl: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${year}_3857/default/g/{z}/{y}/{x}.jpg`,
      tileSize: 256,
      maxTileZoom: 14,
    });
    expect(SATELLITE_BASEMAP.minZoom).toBe(0);
    expect(SATELLITE_BASEMAP.maxZoom).toBe(17);
  });

  it("draws the place names, roads and borders of OpenFreeMap Bright over the imagery, without its ferry routes", () => {
    expect(SATELLITE_BASEMAP.source).toMatchObject({
      labelStyleUrl: "https://tiles.openfreemap.org/styles/bright",
      labelSourceLayers: [
        "transportation",
        "transportation_name",
        "boundary",
        "place",
        "water_name",
        "aerodrome_label",
      ],
      labelOmitLayers: ["ferry"],
    });
  });

  it("is a dark map with a dark swatch of the host's own, for Save data mode", () => {
    expect(SATELLITE_BASEMAP.appearance).toBe("dark");
    expect(SATELLITE_BASEMAP.swatch).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is marked non-commercial, so no agent tool offers it", () => {
    expect(SATELLITE_BASEMAP.nonCommercial).toBe(true);
  });

  it("gives EOX's credit in its own words, with the address in the text, the licence, the link back to EOX::Maps that its tile service asks for, and the label credits", () => {
    expect(SATELLITE_BASEMAP.attribution).toEqual([
      {
        text: `EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${year})`,
        href: "https://cloudless.eox.at",
      },
      {
        text: "CC BY-NC-SA 4.0",
        href: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
      },
      { text: "EOX::Maps", href: "https://maps.eox.at" },
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
      { text: "OpenFreeMap", href: "https://openfreemap.org" },
      { text: "OpenMapTiles", href: "https://openmaptiles.org" },
    ]);
  });
});
