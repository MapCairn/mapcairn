import { describe, expect, it } from "vitest";
import {
  BASEMAPS,
  buildAttribution,
  DEFAULT_BASEMAP_BACKGROUND,
  DEFAULT_BASEMAP_ID,
  getBasemap,
  MAPLIBRE_CREDIT,
  omittedLayers,
  resolveBasemap,
} from "./basemaps";

describe("BASEMAPS", () => {
  it("contains the three built-in basemaps in picker order, the default first", () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual([
      "liberty",
      "positron",
      "osm",
    ]);
  });

  it("has unique ids", () => {
    const ids = BASEMAPS.map((basemap) => basemap.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every basemap at least one attribution entry with text", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.attribution.length).toBeGreaterThan(0);
      for (const entry of basemap.attribution) {
        expect(entry.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("only links attribution entries to https URLs", () => {
    for (const basemap of BASEMAPS) {
      for (const entry of basemap.attribution) {
        if (entry.href !== undefined) {
          expect(entry.href).toMatch(/^https:\/\//);
        }
      }
    }
  });

  it("gives raster entries a 256 px https tile URL with the z, x and y placeholders", () => {
    let rasters = 0;
    for (const basemap of BASEMAPS) {
      if (basemap.source.kind === "raster") {
        rasters += 1;
        expect(basemap.source.tileUrl).toMatch(/^https:\/\//);
        expect(basemap.source.tileUrl).toContain("{z}");
        expect(basemap.source.tileUrl).toContain("{x}");
        expect(basemap.source.tileUrl).toContain("{y}");
        expect(basemap.source.tileSize).toBe(256);
      }
    }
    expect(rasters).toBeGreaterThan(0);
  });

  it("gives vector entries an https style URL", () => {
    let vectors = 0;
    for (const basemap of BASEMAPS) {
      if (basemap.source.kind === "vector") {
        vectors += 1;
        expect(basemap.source.styleUrl).toMatch(/^https:\/\//);
      }
    }
    expect(vectors).toBeGreaterThan(0);
  });

  it("uses normalised zoom limits of 0 to 22 for vector styles and 0 to 19 for OpenStreetMap tiles", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.minZoom).toBe(0);
      expect(basemap.maxZoom).toBe(basemap.source.kind === "vector" ? 22 : 19);
    }
  });

  it("points each thumbnail at its committed preview", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.thumbnail).toBe(`/basemaps/${basemap.id}.jpg`);
    }
  });

  it("uses the OpenFreeMap style URLs and the standard OpenStreetMap tile URL", () => {
    const sources = Object.fromEntries(
      BASEMAPS.map((basemap) => [basemap.id, basemap.source]),
    );
    expect(sources.positron).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/positron",
    });
    expect(sources.liberty).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    });
    expect(sources.osm).toEqual({
      kind: "raster",
      tileSize: 256,
      tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    });
  });

  it("names the OpenStreetMap basemap Streets", () => {
    expect(getBasemap("osm")?.name).toBe("Streets");
  });

  it("credits OpenStreetMap, OpenFreeMap and OpenMapTiles on the vector styles", () => {
    for (const id of ["positron", "liberty"]) {
      const text = getBasemap(id)
        ?.attribution.map((entry) => entry.text)
        .join(" ");
      expect(text).toMatch(/OpenStreetMap/);
      expect(text).toMatch(/OpenFreeMap/);
      expect(text).toMatch(/OpenMapTiles/);
    }
  });

  it("credits OpenStreetMap contributors, linked to the copyright page, on Streets", () => {
    expect(getBasemap("osm")?.attribution).toEqual([
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
    ]);
  });

  it("has no dark basemap: every built-in basemap is light", () => {
    expect(getBasemap("dark")).toBeUndefined();
    for (const basemap of BASEMAPS) {
      expect(basemap.appearance, basemap.id).toBe("light");
    }
  });

  it("has no basemap that swaps itself for another in a dark theme", () => {
    for (const basemap of BASEMAPS) {
      expect(Object.keys(basemap)).not.toContain("darkVariantId");
    }
  });
});

describe("getBasemap", () => {
  it("finds a basemap by id and returns undefined otherwise", () => {
    expect(getBasemap("liberty")?.name).toBe("Liberty");
    expect(getBasemap("nope")).toBeUndefined();
    expect(getBasemap("__proto__")).toBeUndefined();
  });
});

describe("resolveBasemap", () => {
  it("makes Liberty the default basemap", () => {
    expect(DEFAULT_BASEMAP_ID).toBe("liberty");
    expect(getBasemap(DEFAULT_BASEMAP_ID)?.name).toBe("Liberty");
  });

  it("returns an explicit choice", () => {
    for (const basemap of BASEMAPS) {
      expect(resolveBasemap(basemap.id)).toBe(basemap);
    }
  });

  it("falls back to the default for an unknown id, including the retired auto and dark choices", () => {
    for (const id of ["auto", "dark", "missing", "", "__proto__"]) {
      expect(resolveBasemap(id).id).toBe("liberty");
    }
  });
});

describe("DEFAULT_BASEMAP_BACKGROUND", () => {
  // Copied from the `background` layer's `background-color` in
  // https://tiles.openfreemap.org/styles/liberty (checked 2026-11-09). The
  // style writes it as six-digit lowercase hex, and so does this constant.
  it("is the Liberty style's background colour, in the style's own format", () => {
    expect(DEFAULT_BASEMAP_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/);
    expect(DEFAULT_BASEMAP_BACKGROUND).toBe("#f8f4f0");
  });
});

describe("buildAttribution", () => {
  it("lists the provider credits, then MapLibre, for every basemap", () => {
    for (const basemap of BASEMAPS) {
      expect(buildAttribution(basemap)).toEqual([
        ...basemap.attribution,
        MAPLIBRE_CREDIT,
      ]);
    }
    expect(MAPLIBRE_CREDIT).toEqual({
      text: "MapLibre",
      href: "https://maplibre.org",
    });
  });

  it("never mutates the basemap's own list", () => {
    const positron = getBasemap("positron");
    if (positron === undefined) {
      throw new Error("missing basemap positron");
    }
    const before = positron.attribution.length;
    buildAttribution(positron);
    expect(positron.attribution.length).toBe(before);
  });
});

describe("omittedLayers", () => {
  const liberty = resolveBasemap("liberty");

  it("lists the layers a basemap leaves out in Save data mode, and only then", () => {
    expect(omittedLayers(liberty, true)).toEqual(["natural_earth"]);
    expect(omittedLayers(liberty, false)).toEqual([]);
  });

  it("is empty for a basemap that names no such layers", () => {
    for (const basemap of BASEMAPS) {
      if (basemap.saveDataOmitLayers === undefined) {
        expect(omittedLayers(basemap, true)).toEqual([]);
      }
    }
    expect(omittedLayers(resolveBasemap("positron"), true)).toEqual([]);
    expect(omittedLayers(resolveBasemap("osm"), true)).toEqual([]);
  });

  // Checked against https://tiles.openfreemap.org/styles/liberty on 2026-11-09:
  // the one raster layer, "natural_earth" (Natural Earth shaded relief, 933 KB
  // of the first view's 2,689 KB, drawn from zoom 0 to 7).
  it("names only vector basemaps, which have a style to take layers from", () => {
    for (const basemap of BASEMAPS) {
      if (basemap.saveDataOmitLayers !== undefined) {
        expect(basemap.source.kind).toBe("vector");
        expect(basemap.saveDataOmitLayers.length).toBeGreaterThan(0);
      }
    }
  });
});
