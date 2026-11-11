import {
  type BasemapDefinition,
  BUILT_IN_BASEMAP_CATALOGUE,
} from "@mapcairn/core";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "../basemaps/hostBasemaps";
import { buildContentSecurityPolicy } from "./securityHeaders";

/** The origins a basemap's style, its raster tiles or its imagery are requested from. */
function sourceOrigins(basemap: BasemapDefinition): readonly string[] {
  const { source } = basemap;
  const tile = (url: string) => new URL(url.replace(/\{[zxy]\}/g, "0")).origin;
  switch (source.kind) {
    case "vector":
      return [new URL(source.styleUrl).origin];
    case "raster":
      return [tile(source.tileUrl)];
    case "imagery":
      return [tile(source.tileUrl), new URL(source.labelStyleUrl).origin];
  }
}

// Fiord is the SDK's dark basemap that the site does not offer; Dark and
// Satellite are the site's. Each needs a swatch of its own for the picker's
// Save data tile.
describe.each([
  ["fiord", BUILT_IN_BASEMAP_CATALOGUE],
  ["dark", HOST_BASEMAP_CATALOGUE],
  ["satellite", HOST_BASEMAP_CATALOGUE],
] as const)("%s in the picker", (id, catalogue) => {
  const basemap = catalogue.resolve(id);

  it("is the basemap named", () => {
    expect(basemap.id).toBe(id);
  });
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
    it(`allows the origins ${basemap.name} loads its style or tiles from`, () => {
      for (const origin of sourceOrigins(basemap)) {
        expect(csp.get("connect-src"), origin).toContain(origin);
        expect(csp.get("img-src"), origin).toContain(origin);
      }
    });
  }

  it("allows exactly the origins the six basemaps need, and none for a basemap the site does not offer", () => {
    const origins = new Set(
      HOST_BASEMAP_CATALOGUE.basemaps.flatMap(sourceOrigins),
    );
    expect([...origins].sort()).toEqual([
      "https://tile.openstreetmap.org",
      "https://tile.opentopomap.org",
      "https://tiles.maps.eox.at",
      "https://tiles.openfreemap.org",
    ]);
    const offered = new Set(HOST_BASEMAP_CATALOGUE.basemaps.map((b) => b.id));
    for (const basemap of BUILT_IN_BASEMAP_CATALOGUE.basemaps) {
      for (const origin of sourceOrigins(basemap)) {
        if (!offered.has(basemap.id) && !origins.has(origin)) {
          expect(csp.get("connect-src"), basemap.id).not.toContain(origin);
          expect(csp.get("img-src"), basemap.id).not.toContain(origin);
        }
      }
    }
  });
});
