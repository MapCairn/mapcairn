import type { BasemapDefinition } from "@mapcairn/core";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../constants/securityHeaders";
import { BASEMAP_CATALOGUE } from "./index";

/** The origin a basemap's style, or its raster tiles, are requested from. */
function sourceOrigin(basemap: BasemapDefinition): string {
  return new URL(
    basemap.source.kind === "vector"
      ? basemap.source.styleUrl
      : basemap.source.tileUrl.replace(/\{[zxy]\}/g, "0"),
  ).origin;
}

describe("the host's basemap catalogue", () => {
  it("offers Bright, Liberty, Colorful, Positron, Streets and Fiord, in that order, as three columns of two rows", () => {
    expect(BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.name)).toEqual([
      "Bright",
      "Liberty",
      "Colorful",
      "Positron",
      "Streets",
      "Fiord",
    ]);
  });

  it("makes Bright the default, and finds Colorful and Fiord by their own ids", () => {
    expect(BASEMAP_CATALOGUE.defaultId).toBe("bright");
    expect(BASEMAP_CATALOGUE.resolve("liberty").name).toBe("Liberty");
    expect(BASEMAP_CATALOGUE.resolve("colorful").name).toBe("Colorful");
    expect(BASEMAP_CATALOGUE.resolve("fiord").name).toBe("Fiord");
  });

  it("still opens on Bright for a removed id: dark, auto and the retired Maptoolkit Dark", () => {
    for (const id of [
      "dark",
      "auto",
      "maptoolkit",
      "maptoolkit-dark",
      "Maptoolkit-Dark",
    ]) {
      expect(BASEMAP_CATALOGUE.resolve(id).id, id).toBe("bright");
    }
  });
});

describe("Fiord in the picker", () => {
  const fiord = BASEMAP_CATALOGUE.resolve("fiord");
  const swatch = fiord.swatch as string;

  it("has a dark swatch of its own, so its Save data tile is not the default's pale land colour", () => {
    expect(swatch).toMatch(/^#[0-9a-f]{6}$/);
    expect(swatch).not.toBe(tokenValues.representativeBackdrops.defaultBasemap);
    expect(contrastRatio(swatch, "#ffffff")).toBeGreaterThan(7);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`keeps the selected tile's check badge legible on that swatch in the ${theme} theme`, () => {
      const colours = tokenValues.themeValues[theme].colour;
      const disc = compositeOver(colours.accent, swatch);
      const ring = compositeOver(colours.surfaceRaised, swatch);
      // The tick is drawn on the accent disc whatever lies behind it.
      expect(
        contrastRatio(compositeOver(colours.accentContrast, disc), disc),
      ).toBeGreaterThanOrEqual(4.5);
      // Over a dark tile the disc or the ring around it must stand out from
      // the swatch (non-text contrast, 3:1): the ring on a light sheet, the
      // disc on a dark one. The name sits under the tile, on the sheet.
      expect(
        Math.max(contrastRatio(disc, swatch), contrastRatio(ring, swatch)),
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("the production CSP and the host's basemaps", () => {
  const csp = new Map(
    buildContentSecurityPolicy()
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name, ...sources]) => [name as string, sources]),
  );

  for (const basemap of BASEMAP_CATALOGUE.basemaps) {
    it(`allows the origin ${basemap.name} loads its style or tiles from`, () => {
      const origin = sourceOrigin(basemap);
      expect(csp.get("connect-src"), origin).toContain(origin);
      expect(csp.get("img-src"), origin).toContain(origin);
    });
  }
});
