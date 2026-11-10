import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASEMAPS } from "@karta/core";
import { compositeOver, contrastRatio, tokenValues } from "@karta/theme";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "../constants/securityHeaders";
import {
  BASEMAP_CATALOGUE,
  MAPTOOLKIT_DARK,
  MAPTOOLKIT_DARK_ID,
} from "./index";

describe("the host's basemap catalogue", () => {
  it("offers Liberty, Positron, Streets and Maptoolkit Dark, in that order", () => {
    expect(BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.name)).toEqual([
      "Liberty",
      "Positron",
      "Streets",
      "Maptoolkit Dark",
    ]);
  });

  it("keeps Liberty the default, and every built-in basemap as it was", () => {
    expect(BASEMAP_CATALOGUE.defaultId).toBe("liberty");
    expect(BASEMAP_CATALOGUE.basemaps.slice(0, BASEMAPS.length)).toEqual(
      BASEMAPS,
    );
  });

  it("finds Maptoolkit Dark by its own id", () => {
    expect(MAPTOOLKIT_DARK_ID).toBe("maptoolkit-dark");
    expect(BASEMAP_CATALOGUE.resolve("maptoolkit-dark")).toBe(MAPTOOLKIT_DARK);
  });

  it("still opens on Liberty for the removed dark id and the retired auto choice", () => {
    for (const id of ["dark", "auto", "maptoolkit", "Maptoolkit-Dark"]) {
      expect(BASEMAP_CATALOGUE.resolve(id).id, id).toBe("liberty");
    }
  });
});

describe("Maptoolkit Dark", () => {
  it("is the one dark style, loaded from the provider's style address", () => {
    expect(MAPTOOLKIT_DARK.name).toBe("Maptoolkit Dark");
    expect(MAPTOOLKIT_DARK.source).toEqual({
      kind: "vector",
      styleUrl: "https://styles.maptoolkit.org/dark.json",
    });
    expect(MAPTOOLKIT_DARK.appearance).toBe("dark");
  });

  it("has no preview image, because the provider's terms allow no saved images of its map", () => {
    expect(MAPTOOLKIT_DARK.thumbnail).toBeUndefined();
    expect(MAPTOOLKIT_DARK.allowsImageExport).toBe(false);
  });

  it("has a neutral dark swatch of its own, so its picker tile is not the default's pale land colour", () => {
    expect(MAPTOOLKIT_DARK.swatch).toMatch(/^#[0-9a-f]{6}$/);
    expect(MAPTOOLKIT_DARK.swatch).not.toBe(
      tokenValues.representativeBackdrops.liberty,
    );
    // Dark enough to read as a dark map beside the pale ones, and neutral.
    expect(
      contrastRatio(MAPTOOLKIT_DARK.swatch as string, "#ffffff"),
    ).toBeGreaterThan(10);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`keeps the selected tile's check badge legible on that swatch in the ${theme} theme`, () => {
      const swatch = MAPTOOLKIT_DARK.swatch as string;
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

  it("asks for a permanent credit: the logo, linked to the provider, at least 24 px high", () => {
    const credit = MAPTOOLKIT_DARK.credit;
    expect(credit?.kind).toBe("permanent");
    expect(credit?.logo.href).toBe("https://www.maptoolkit.org/");
    expect(credit?.logo.label).toBe("Maptoolkit");
    expect(credit?.logo.minHeight).toBeGreaterThanOrEqual(24);
    expect(credit?.logo.src).toBe("/basemaps/maptoolkit-logo.svg");
  });

  it("words the credit line, and links both names, as the provider requires", () => {
    expect(MAPTOOLKIT_DARK.credit?.lines).toEqual([
      {
        text: "© Maptoolkit",
        href: "https://www.maptoolkit.com/copyright/",
      },
      {
        text: "© Openstreetmap",
        href: "https://www.openstreetmap.org/copyright",
      },
    ]);
  });

  it("gives the same credits to the collapsing credit list and the saved-image line", () => {
    expect(MAPTOOLKIT_DARK.attribution).toEqual(MAPTOOLKIT_DARK.credit?.lines);
  });

  it("ships the logo file it names", () => {
    const file = resolve(
      __dirname,
      "../../public",
      `.${MAPTOOLKIT_DARK.credit?.logo.src ?? ""}`,
    );
    const svg = readFileSync(file, "utf8");
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox='0 0 463.73 147.82'");
  });

  it("keeps the basemap at the same zoom limits as the other vector styles", () => {
    expect(MAPTOOLKIT_DARK.minZoom).toBe(0);
    expect(MAPTOOLKIT_DARK.maxZoom).toBe(22);
  });
});

describe("the production CSP and Maptoolkit Dark", () => {
  // The JSON holds only the request URLs recorded from the real style, and
  // cannot carry a comment. Re-record it whenever Maptoolkit changes
  // `dark.json`: the e2e suite answers that address with a minimal style
  // (`e2e/support/network.ts`), so only this list guards the CSP.
  const recorded = JSON.parse(
    readFileSync(
      resolve(__dirname, "fixtures/maptoolkit-dark-requests.json"),
      "utf8",
    ),
  ) as { urls: string[] };
  const csp = new Map(
    buildContentSecurityPolicy()
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .map(([name, ...sources]) => [name as string, sources]),
  );
  const origins = [
    ...new Set(recorded.urls.map((url) => new URL(url).origin)),
  ].sort();

  it("records the style's own address among the requests it names", () => {
    expect(recorded.urls).toContain("https://styles.maptoolkit.org/dark.json");
  });

  it("allows every origin the style, its tile sets, sprite and glyphs use", () => {
    expect(origins).toEqual(
      [
        "https://fonts.maptoolkit.org",
        "https://icons.maptoolkit.org",
        "https://styles.maptoolkit.org",
        "https://tiles.mapterhorn.com",
        "https://tiles.maptoolkit.org",
      ].sort(),
    );
    for (const origin of origins) {
      expect(csp.get("connect-src"), origin).toContain(origin);
      expect(csp.get("img-src"), origin).toContain(origin);
    }
  });

  it("allows no remote origin for the logo, which is served by the app itself", () => {
    expect(MAPTOOLKIT_DARK.credit?.logo.src.startsWith("/")).toBe(true);
  });
});
