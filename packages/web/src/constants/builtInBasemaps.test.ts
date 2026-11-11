import {
  type BasemapDefinition,
  BUILT_IN_BASEMAP_CATALOGUE,
} from "@mapcairn/core";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "../basemaps/hostBasemaps";
import { buildContentSecurityPolicy } from "./securityHeaders";

/** The origin a basemap's style, or its raster tiles, are requested from. */
function sourceOrigin(basemap: BasemapDefinition): string {
  return new URL(
    basemap.source.kind === "vector"
      ? basemap.source.styleUrl
      : basemap.source.tileUrl.replace(/\{[zxy]\}/g, "0"),
  ).origin;
}

// Fiord is the SDK's dark basemap that the site does not offer; Dark is the
// site's. Both need a swatch of their own for the picker's Save data tile.
describe.each(["fiord", "dark"])("%s in the picker", (id) => {
  const basemap = BUILT_IN_BASEMAP_CATALOGUE.resolve(id);
  const swatch = basemap.swatch as string;

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

describe("the production CSP and the site's basemaps", () => {
  const csp = new Map(
    buildContentSecurityPolicy()
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name, ...sources]) => [name as string, sources]),
  );

  for (const basemap of HOST_BASEMAP_CATALOGUE.basemaps) {
    it(`allows the origin ${basemap.name} loads its style or tiles from`, () => {
      const origin = sourceOrigin(basemap);
      expect(csp.get("connect-src"), origin).toContain(origin);
      expect(csp.get("img-src"), origin).toContain(origin);
    });
  }

  it("allows exactly the origins the five basemaps need, and none for a basemap the site does not offer", () => {
    const origins = new Set(HOST_BASEMAP_CATALOGUE.basemaps.map(sourceOrigin));
    expect([...origins].sort()).toEqual([
      "https://tile.openstreetmap.org",
      "https://tile.opentopomap.org",
      "https://tiles.openfreemap.org",
    ]);
    const offered = new Set(HOST_BASEMAP_CATALOGUE.basemaps.map((b) => b.id));
    for (const basemap of BUILT_IN_BASEMAP_CATALOGUE.basemaps) {
      if (!offered.has(basemap.id) && !origins.has(sourceOrigin(basemap))) {
        expect(csp.get("connect-src"), basemap.id).not.toContain(
          sourceOrigin(basemap),
        );
        expect(csp.get("img-src"), basemap.id).not.toContain(
          sourceOrigin(basemap),
        );
      }
    }
  });
});
