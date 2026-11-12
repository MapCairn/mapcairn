import { describe, expect, it } from "vitest";
import {
  FAKE_HYBRID_BASEMAP,
  FAKE_RASTER_BASEMAP,
  FAKE_VECTOR_BASEMAP,
} from "../fakes/fixtures";
import type { BasemapDefinition } from "../ports/basemap";
import {
  BASEMAPS,
  BUILT_IN_BASEMAP_CATALOGUE,
  buildAttribution,
  createBasemapCatalogue,
  creditsLine,
  DEFAULT_BASEMAP_BACKGROUND,
  DEFAULT_BASEMAP_ID,
  getBasemap,
  MAPLIBRE_CREDIT,
  omittedLayers,
  usesMoreData,
} from "./basemaps";

/** Every address a basemap's tiles or style come from, with the tile placeholders filled. */
function sourceUrls(basemap: BasemapDefinition): readonly string[] {
  const { source } = basemap;
  const tile = (url: string) => url.replace(/\{[zxy]\}/g, "0");
  switch (source.kind) {
    case "vector":
      return [source.styleUrl];
    case "raster":
      return [tile(source.tileUrl)];
    case "hybrid":
      return [tile(source.tileUrl), source.labelStyleUrl];
  }
}

describe("BASEMAPS", () => {
  it("contains the seven built-in basemaps in picker order, the default first: the general-purpose styles, then the light ones, then the dark ones", () => {
    expect(BASEMAPS.map((basemap) => basemap.id)).toEqual([
      "bright",
      "liberty",
      "colorful",
      "positron",
      "osm",
      "fiord",
      "dark",
    ]);
  });

  // The SDK is free for commercial use, so every provider named here must allow
  // that with no licence agreement. A new origin fails this test until someone
  // has read its terms and added it, with the reason, to this list.
  it("draws only from providers whose terms allow commercial use with no agreement", () => {
    const commercialOrigins: Record<string, string> = {
      "https://tiles.openfreemap.org": "OpenFreeMap: free, no key, credit",
      "https://tiles.versatiles.org": "VersaTiles: free demo server, credit",
      "https://tile.openstreetmap.org":
        "OpenStreetMap Foundation tile policy: credit and a valid Referer",
    };
    for (const basemap of BASEMAPS) {
      for (const url of sourceUrls(basemap)) {
        expect(Object.keys(commercialOrigins), basemap.id).toContain(
          new URL(url).origin,
        );
      }
    }
  });

  // A host may add a basemap whose licence is non-commercial, such as satellite
  // imagery; the SDK's own list must never hold one.
  it("holds no basemap whose licence is non-commercial", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.nonCommercial, basemap.id).toBeUndefined();
      for (const entry of basemap.attribution) {
        expect(entry.text, basemap.id).not.toMatch(/non-?commercial|\bNC\b/i);
        expect(entry.href ?? "", basemap.id).not.toMatch(/by-nc/i);
      }
    }
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

  it("uses normalised zoom limits of 0 to 22 for vector styles and to the deepest level each raster provider serves", () => {
    const rasterMaxZoom: Record<string, number> = { osm: 19 };
    for (const basemap of BASEMAPS) {
      expect(basemap.minZoom).toBe(0);
      expect(basemap.maxZoom, basemap.id).toBe(
        basemap.source.kind === "vector" ? 22 : rasterMaxZoom[basemap.id],
      );
    }
  });

  it("names no preview for any basemap, because the SDK ships no image files and a host adds its own paths", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.thumbnail, basemap.id).toBeUndefined();
    }
  });

  it("uses the OpenFreeMap style URLs, the VersaTiles Colorful style URL, and the standard OpenStreetMap tile URL", () => {
    const sources = Object.fromEntries(
      BASEMAPS.map((basemap) => [basemap.id, basemap.source]),
    );
    expect(sources.bright).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/bright",
    });
    expect(sources.positron).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/positron",
    });
    expect(sources.liberty).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    });
    expect(sources.fiord).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/fiord",
    });
    expect(sources.dark).toEqual({
      kind: "vector",
      styleUrl: "https://tiles.openfreemap.org/styles/dark",
    });
    expect(sources.colorful).toEqual({
      kind: "vector",
      styleUrl:
        "https://tiles.versatiles.org/assets/styles/colorful/style.json",
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
    for (const id of ["bright", "positron", "liberty", "fiord", "dark"]) {
      const text = getBasemap(id)
        ?.attribution.map((entry) => entry.text)
        .join(" ");
      expect(text).toMatch(/OpenStreetMap/);
      expect(text).toMatch(/OpenFreeMap/);
      expect(text).toMatch(/OpenMapTiles/);
    }
  });

  // Checked against https://tiles.versatiles.org/assets/styles/colorful/style.json
  // and https://docs.versatiles.org/basics/tilesets.html on 2026-11-11. The
  // style's two sources carry "© OpenStreetMap contributors" and "ESA
  // WorldCover 2021 (CC BY 4.0)", which the guide calls "the required
  // attribution". The tilesets page and ESA's download page give the land
  // cover the longer credit used here, which the image export wraps. VersaTiles
  // asks for no credit of its own, and it is named here as the provider.
  it("credits OpenStreetMap, VersaTiles and the ESA WorldCover land cover, with its licence, on Colorful", () => {
    expect(getBasemap("colorful")?.attribution).toEqual([
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
      { text: "VersaTiles", href: "https://versatiles.org" },
      {
        text: "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
        href: "https://esa-worldcover.org/en/data-access",
      },
      {
        text: "CC BY 4.0",
        href: "https://creativecommons.org/licenses/by/4.0/",
      },
    ]);
  });

  it("credits OpenStreetMap contributors, linked to the copyright page, on Streets", () => {
    expect(getBasemap("osm")?.attribution).toEqual([
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
    ]);
  });

  it("has two dark basemaps, Fiord and Dark, both from OpenFreeMap", () => {
    for (const basemap of BASEMAPS) {
      expect(basemap.appearance, basemap.id).toBe(
        ["fiord", "dark"].includes(basemap.id) ? "dark" : "light",
      );
    }
  });

  it("names each dark basemap's own land colour as its picker swatch, so Save data mode shows a dark tile", () => {
    // Copied from the `background` layer's `background-color` in
    // https://tiles.openfreemap.org/styles/fiord and .../dark (checked
    // 2026-11-11), as six-digit lowercase hex. Dark writes it as rgb(12,12,12).
    expect(getBasemap("fiord")?.swatch).toBe("#45516e");
    expect(getBasemap("dark")?.swatch).toBe("#0c0c0c");
  });

  it("gives every light built-in basemap no swatch, so it shows the default land colour", () => {
    for (const basemap of BASEMAPS) {
      if (basemap.appearance === "light") {
        expect(basemap.swatch, basemap.id).toBeUndefined();
      }
    }
  });

  it("has no basemap that swaps itself for another in a dark theme", () => {
    for (const basemap of BASEMAPS) {
      expect(Object.keys(basemap)).not.toContain("darkVariantId");
    }
  });
});

describe("usesMoreData", () => {
  it("is true for a basemap drawn from image tiles: raster or hybrid", () => {
    expect(usesMoreData(FAKE_RASTER_BASEMAP)).toBe(true);
    expect(usesMoreData(FAKE_HYBRID_BASEMAP)).toBe(true);
  });

  it("is false for a vector basemap", () => {
    expect(usesMoreData(FAKE_VECTOR_BASEMAP)).toBe(false);
  });
});

describe("getBasemap", () => {
  it("finds a basemap by id and returns undefined otherwise", () => {
    expect(getBasemap("liberty")?.name).toBe("Liberty");
    expect(getBasemap("nope")).toBeUndefined();
    expect(getBasemap("__proto__")).toBeUndefined();
  });
});

describe("the default basemap", () => {
  it("makes Bright the default basemap, and the first one the picker lists", () => {
    expect(DEFAULT_BASEMAP_ID).toBe("bright");
    expect(getBasemap(DEFAULT_BASEMAP_ID)?.name).toBe("Bright");
    expect(BASEMAPS[0]?.id).toBe(DEFAULT_BASEMAP_ID);
  });

  it("still resolves a saved or linked liberty to Liberty, not to the new default", () => {
    expect(BUILT_IN_BASEMAP_CATALOGUE.resolve("liberty").name).toBe("Liberty");
    expect(BUILT_IN_BASEMAP_CATALOGUE.resolve("liberty").id).not.toBe(
      DEFAULT_BASEMAP_ID,
    );
  });

  it("returns an explicit choice", () => {
    for (const basemap of BASEMAPS) {
      expect(BUILT_IN_BASEMAP_CATALOGUE.resolve(basemap.id)).toBe(basemap);
    }
  });

  it("falls back to the default for an unknown id, including the retired auto choice", () => {
    for (const id of ["auto", "maptoolkit-dark", "missing", "", "__proto__"]) {
      expect(BUILT_IN_BASEMAP_CATALOGUE.resolve(id).id).toBe("bright");
    }
  });
});

describe("DEFAULT_BASEMAP_BACKGROUND", () => {
  // Copied from the `background` layer's `background-color` in
  // https://tiles.openfreemap.org/styles/bright (checked 2026-11-10; Liberty's
  // is the same). The style writes it as six-digit lowercase hex, and so does
  // this constant.
  it("is the Bright style's background colour, in the style's own format", () => {
    expect(DEFAULT_BASEMAP_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/);
    expect(DEFAULT_BASEMAP_BACKGROUND).toBe("#f8f4f0");
  });
});

describe("creditsLine", () => {
  it("joins the basemap's credits, MapLibre's and the layers' on one line", () => {
    const osm = BUILT_IN_BASEMAP_CATALOGUE.resolve("osm");
    expect(creditsLine(osm, [{ text: "Sample provider" }])).toBe(
      "© OpenStreetMap contributors | MapLibre | Sample provider",
    );
    expect(creditsLine(osm)).toBe("© OpenStreetMap contributors | MapLibre");
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
  const liberty = BUILT_IN_BASEMAP_CATALOGUE.resolve("liberty");

  it("lists the layers a basemap leaves out in Save data mode, and only then", () => {
    expect(omittedLayers(liberty, true)).toEqual(["natural_earth"]);
    expect(omittedLayers(liberty, false)).toEqual([]);
  });

  // Checked against https://tiles.openfreemap.org/styles/bright on 2026-11-10:
  // it declares the Natural Earth raster source but draws no raster layer
  // from it, so its first view has no relief image to leave out.
  it("is empty for a basemap that names no such layers", () => {
    for (const basemap of BASEMAPS) {
      if (basemap.saveDataOmitLayers === undefined) {
        expect(omittedLayers(basemap, true)).toEqual([]);
      }
    }
    expect(
      omittedLayers(BUILT_IN_BASEMAP_CATALOGUE.resolve("bright"), true),
    ).toEqual([]);
    expect(
      omittedLayers(BUILT_IN_BASEMAP_CATALOGUE.resolve("positron"), true),
    ).toEqual([]);
    expect(
      omittedLayers(BUILT_IN_BASEMAP_CATALOGUE.resolve("osm"), true),
    ).toEqual([]);
  });

  // Checked against https://tiles.openfreemap.org/styles/fiord on 2026-11-10:
  // like Bright, it declares the Natural Earth raster source but draws no
  // raster layer from it (48 layers: background, fill, line and symbol).
  it("is empty for Fiord, whose style draws no raster layer", () => {
    expect(
      BUILT_IN_BASEMAP_CATALOGUE.resolve("fiord").saveDataOmitLayers,
    ).toBeUndefined();
    expect(
      omittedLayers(BUILT_IN_BASEMAP_CATALOGUE.resolve("fiord"), true),
    ).toEqual([]);
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

describe("createBasemapCatalogue", () => {
  const extra: BasemapDefinition = {
    ...FAKE_VECTOR_BASEMAP,
    id: "extra",
    name: "Extra",
  };

  it("lists the basemaps in the order given and finds them by id", () => {
    const catalogue = createBasemapCatalogue([
      FAKE_VECTOR_BASEMAP,
      FAKE_RASTER_BASEMAP,
      extra,
    ]);
    expect(catalogue.basemaps.map((basemap) => basemap.id)).toEqual([
      "fake-vector",
      "fake-raster",
      "extra",
    ]);
    expect(catalogue.get("extra")).toBe(extra);
    expect(catalogue.get("nope")).toBeUndefined();
    expect(catalogue.get("__proto__")).toBeUndefined();
  });

  it("makes the first basemap the default unless another is named", () => {
    const list = [FAKE_VECTOR_BASEMAP, FAKE_RASTER_BASEMAP];
    expect(createBasemapCatalogue(list).defaultId).toBe("fake-vector");
    expect(createBasemapCatalogue(list, "fake-raster").defaultId).toBe(
      "fake-raster",
    );
  });

  it("resolves an unknown id to the default basemap", () => {
    const catalogue = createBasemapCatalogue(
      [FAKE_VECTOR_BASEMAP, FAKE_RASTER_BASEMAP],
      "fake-raster",
    );
    expect(catalogue.resolve("fake-vector")).toBe(FAKE_VECTOR_BASEMAP);
    for (const id of ["auto", "maptoolkit-dark", "", "__proto__"]) {
      expect(catalogue.resolve(id)).toBe(FAKE_RASTER_BASEMAP);
    }
  });

  it("refuses an empty list, a repeated id and an unknown default", () => {
    expect(() => createBasemapCatalogue([])).toThrow(/at least one/);
    expect(() =>
      createBasemapCatalogue([FAKE_VECTOR_BASEMAP, FAKE_VECTOR_BASEMAP]),
    ).toThrow(/fake-vector/);
    expect(() =>
      createBasemapCatalogue([FAKE_VECTOR_BASEMAP], "missing"),
    ).toThrow(/missing/);
  });

  it("is what the built-in basemaps make: Bright the default, then Liberty, Colorful, Positron, Streets, Fiord and Dark", () => {
    expect(BUILT_IN_BASEMAP_CATALOGUE.basemaps).toBe(BASEMAPS);
    expect(
      BUILT_IN_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.name),
    ).toEqual([
      "Bright",
      "Liberty",
      "Colorful",
      "Positron",
      "Streets",
      "Fiord",
      "Dark",
    ]);
    expect(BUILT_IN_BASEMAP_CATALOGUE.defaultId).toBe(DEFAULT_BASEMAP_ID);
    expect(BUILT_IN_BASEMAP_CATALOGUE.resolve("liberty").id).toBe("liberty");
    expect(BUILT_IN_BASEMAP_CATALOGUE.resolve("fiord").name).toBe("Fiord");
  });

  it("opens a saved or linked dark on Dark, and on the default for a retired id: auto and Maptoolkit Dark", () => {
    expect(BUILT_IN_BASEMAP_CATALOGUE.resolve("dark").name).toBe("Dark");
    for (const id of [
      "auto",
      "maptoolkit",
      "maptoolkit-dark",
      "Maptoolkit-Dark",
    ]) {
      expect(BUILT_IN_BASEMAP_CATALOGUE.resolve(id).id, id).toBe(
        DEFAULT_BASEMAP_ID,
      );
    }
  });

  it("leaves out no layers for Colorful in Save data mode, whose style draws no raster layer", () => {
    // Checked against the style on 2026-11-11: 266 background, fill, line and
    // symbol layers over two vector sources, no raster or hillshade layer. The
    // nine landcover-* layers read the second source, about a third of the tile
    // bytes at zoom 4 to 6, but they are the style's land colouring, so they stay.
    expect(
      BUILT_IN_BASEMAP_CATALOGUE.resolve("colorful").saveDataOmitLayers,
    ).toBeUndefined();
  });
});
