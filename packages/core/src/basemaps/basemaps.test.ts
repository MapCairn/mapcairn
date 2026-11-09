import { describe, expect, it } from "vitest";
import {
  AUTO_BASEMAP_ID,
  attributionFor,
  BASEMAPS,
  buildAttribution,
  DEFAULT_BASEMAP_ID,
  getBasemap,
  resolveBasemap,
} from "./basemaps";

describe("BASEMAPS", () => {
  it("contains the five built-in basemaps in picker order", () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual([
      "positron",
      "liberty",
      "dark",
      "satellite",
      "topo",
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

  it("gives raster entries a tile URL with the z, x and y placeholders", () => {
    let rasters = 0;
    for (const basemap of BASEMAPS) {
      if (basemap.source.kind === "raster") {
        rasters += 1;
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

  it("renders vector basemaps with MapLibre and raster basemaps with Leaflet", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.engine).toBe(
        basemap.source.kind === "vector" ? "maplibre" : "leaflet",
      );
    }
  });

  it("uses normalised zoom limits of 0 to 22 for vector and 0 to 18 for raster", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.minZoom).toBe(0);
      expect(basemap.maxZoom).toBe(basemap.source.kind === "vector" ? 22 : 18);
    }
  });

  it("points each thumbnail at its committed preview", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.thumbnail).toBe(`/basemaps/${basemap.id}.jpg`);
    }
  });

  it("reproduces the existing OpenFreeMap style URLs and Esri tile URLs", () => {
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
    expect(sources.satellite).toEqual({
      kind: "raster",
      tileSize: 256,
      tileUrl:
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    });
    expect(sources.topo).toEqual({
      kind: "raster",
      tileSize: 256,
      tileUrl:
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    });
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

  it("credits Esri, with a link, on the raster basemaps", () => {
    for (const id of ["satellite", "topo"]) {
      const entries = getBasemap(id)?.attribution ?? [];
      expect(entries.some((entry) => /Esri/.test(entry.text))).toBe(true);
      expect(entries.some((entry) => entry.href !== undefined)).toBe(true);
    }
  });

  it("marks the dark and satellite basemaps as dark and the rest as light", () => {
    const appearances = Object.fromEntries(
      BASEMAPS.map((basemap) => [basemap.id, basemap.appearance]),
    );
    expect(appearances).toEqual({
      positron: "light",
      liberty: "light",
      dark: "dark",
      satellite: "dark",
      topo: "light",
    });
  });

  it("links positron and liberty to the dark basemap", () => {
    expect(getBasemap("positron")?.darkVariantId).toBe("dark");
    expect(getBasemap("liberty")?.darkVariantId).toBe("dark");
    expect(getBasemap("dark")?.darkVariantId).toBeUndefined();
    expect(getBasemap("satellite")?.darkVariantId).toBeUndefined();
    expect(getBasemap("topo")?.darkVariantId).toBeUndefined();
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
      expect(resolveBasemap("satellite", theme).id).toBe("satellite");
    }
  });

  it("falls back to the default for unknown ids", () => {
    expect(resolveBasemap("missing", "light").id).toBe("positron");
    expect(resolveBasemap("missing", "dark").id).toBe("positron");
    expect(resolveBasemap("", "light").id).toBe("positron");
  });
});

describe("attribution credits", () => {
  function pick(id: string) {
    const basemap = getBasemap(id);
    if (basemap === undefined) {
      throw new Error(`missing basemap ${id}`);
    }
    return basemap;
  }

  it("appends the MapLibre credit for a vector basemap", () => {
    const positron = pick("positron");
    const entries = buildAttribution(positron);
    expect(entries.slice(0, positron.attribution.length)).toEqual(
      positron.attribution,
    );
    expect(entries.at(-1)).toEqual({
      text: "MapLibre",
      href: "https://maplibre.org",
    });
  });

  it("appends the Leaflet credit for a raster basemap", () => {
    expect(buildAttribution(pick("satellite")).at(-1)).toEqual({
      text: "Leaflet",
      href: "https://leafletjs.com",
    });
  });

  it("credits the engine that is actually rendering, not the basemap's default", () => {
    const topo = pick("topo");
    expect(attributionFor(topo, "maplibre").at(-1)?.text).toBe("MapLibre");
    expect(attributionFor(topo, "leaflet").at(-1)?.text).toBe("Leaflet");
  });

  it("never mutates the basemap's own list", () => {
    const dark = pick("dark");
    const before = dark.attribution.length;
    buildAttribution(dark);
    expect(dark.attribution.length).toBe(before);
  });
});
