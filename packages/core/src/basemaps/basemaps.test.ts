import { describe, expect, it } from "vitest";
import {
  AUTO_BASEMAP_ID,
  BASEMAPS,
  buildAttribution,
  DEFAULT_BASEMAP_ID,
  getBasemap,
  isKnownBasemapChoice,
  MAPLIBRE_CREDIT,
  resolveBasemap,
} from "./basemaps";

describe("BASEMAPS", () => {
  it("contains the four built-in basemaps in picker order", () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual([
      "positron",
      "liberty",
      "dark",
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

  it("references only dark variants that exist and are dark", () => {
    for (const basemap of BASEMAPS) {
      if (basemap.darkVariantId !== undefined) {
        const variant = getBasemap(basemap.darkVariantId);
        expect(variant).toBeDefined();
        expect(variant?.appearance).toBe("dark");
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
    expect(sources.dark).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/dark",
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
    for (const id of ["positron", "liberty", "dark"]) {
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

  it("marks the dark basemap as dark and the rest as light", () => {
    const appearances = Object.fromEntries(
      BASEMAPS.map((basemap) => [basemap.id, basemap.appearance]),
    );
    expect(appearances).toEqual({
      positron: "light",
      liberty: "light",
      dark: "dark",
      osm: "light",
    });
  });

  it("links positron and liberty to the dark basemap", () => {
    expect(getBasemap("positron")?.darkVariantId).toBe("dark");
    expect(getBasemap("liberty")?.darkVariantId).toBe("dark");
    expect(getBasemap("dark")?.darkVariantId).toBeUndefined();
    expect(getBasemap("osm")?.darkVariantId).toBeUndefined();
  });
});

describe("getBasemap", () => {
  it("finds a basemap by id and returns undefined otherwise", () => {
    expect(getBasemap("liberty")?.name).toBe("Liberty");
    expect(getBasemap("nope")).toBeUndefined();
    expect(getBasemap("__proto__")).toBeUndefined();
  });
});

describe("isKnownBasemapChoice", () => {
  it("accepts auto and every built-in id", () => {
    expect(isKnownBasemapChoice(AUTO_BASEMAP_ID)).toBe(true);
    for (const basemap of BASEMAPS) {
      expect(isKnownBasemapChoice(basemap.id)).toBe(true);
    }
  });

  it("rejects the id of a basemap that no longer exists, and anything else", () => {
    expect(isKnownBasemapChoice("removed-basemap")).toBe(false);
    expect(isKnownBasemapChoice("")).toBe(false);
    expect(isKnownBasemapChoice("__proto__")).toBe(false);
  });
});

describe("resolveBasemap", () => {
  it("exports the default and auto ids", () => {
    expect(DEFAULT_BASEMAP_ID).toBe("positron");
    expect(AUTO_BASEMAP_ID).toBe("auto");
    expect(getBasemap(DEFAULT_BASEMAP_ID)).toBeDefined();
  });

  it("auto follows the theme: positron in light, its dark variant in dark", () => {
    expect(resolveBasemap("auto", "light").id).toBe("positron");
    expect(resolveBasemap("auto", "dark").id).toBe("dark");
  });

  it("keeps auto in step with the default basemap's declared dark variant", () => {
    const variantId = getBasemap(DEFAULT_BASEMAP_ID)?.darkVariantId;
    expect(variantId).toBeDefined();
    expect(resolveBasemap("auto", "dark")).toBe(getBasemap(variantId ?? ""));
    expect(resolveBasemap("auto", "light")).toBe(
      getBasemap(DEFAULT_BASEMAP_ID),
    );
  });

  it("returns an explicit choice whatever the theme", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(resolveBasemap("liberty", theme).id).toBe("liberty");
      expect(resolveBasemap("osm", theme).id).toBe("osm");
    }
  });

  it("falls back to the default for unknown ids", () => {
    expect(resolveBasemap("missing", "light").id).toBe("positron");
    expect(resolveBasemap("missing", "dark").id).toBe("positron");
    expect(resolveBasemap("", "light").id).toBe("positron");
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
    const dark = getBasemap("dark");
    if (dark === undefined) {
      throw new Error("missing basemap dark");
    }
    const before = dark.attribution.length;
    buildAttribution(dark);
    expect(dark.attribution.length).toBe(before);
  });
});
