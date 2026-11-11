import { BUILT_IN_BASEMAP_CATALOGUE } from "@mapcairn/core";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "./hostBasemaps";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/**
 * The colour chrome that has no surface of its own would sit on, per basemap:
 * the land colour of its style, which is the largest area behind the bottom
 * corners. It lists every built-in basemap, not only the five the site offers,
 * so a host that offers Liberty, Colorful or Fiord is covered too. A new
 * built-in basemap needs one more entry here, and the first test below fails
 * until it has one.
 */
const basemapBackdrops: Record<string, string> = {
  bright: "#f8f4f0",
  liberty: "#f8f4f0",
  colorful: "#f8f4f0",
  positron: "#f2f3f0",
  osm: "#f2efe9",
  fiord: "#45516e",
  dark: "#0c0c0c",
  topographic: "#f2efe9",
};

/** Colours that bracket any map a host might add. */
const extremeBackdrops: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  midGrey: "#808080",
};

const allBackdrops = { ...basemapBackdrops, ...extremeBackdrops };
const themes = ["light", "dark"] as const;
const colourSets = ["colour", "opaque", "contrastMore"] as const;

describe("chrome legibility over every basemap", () => {
  it("has a backdrop for every built-in basemap, which a host may offer", () => {
    expect(Object.keys(basemapBackdrops).sort()).toEqual(
      BUILT_IN_BASEMAP_CATALOGUE.basemaps.map((basemap) => basemap.id).sort(),
    );
  });

  it("covers every basemap the site offers", () => {
    for (const basemap of HOST_BASEMAP_CATALOGUE.basemaps) {
      expect(basemapBackdrops, basemap.id).toHaveProperty(basemap.id);
    }
  });

  describe.each(themes)("%s chrome", (theme) => {
    describe.each(colourSets)("%s colours", (set) => {
      const roles = tokenValues.themeValues[theme][set];

      describe.each(Object.entries(allBackdrops))("over %s", (_name, map) => {
        const surface = compositeOver(roles.surface, map);
        const text = (role: "text" | "textMuted") =>
          contrastRatio(compositeOver(roles[role], surface), surface);

        it(`keeps the scale text, the coordinates and the search pill text at ${AA_TEXT}:1`, () => {
          expect(text("text")).toBeGreaterThanOrEqual(AA_TEXT);
          expect(text("textMuted")).toBeGreaterThanOrEqual(AA_TEXT);
        });

        it(`keeps the scale line and the credits button graphic at ${AA_NON_TEXT}:1`, () => {
          expect(text("text")).toBeGreaterThanOrEqual(AA_NON_TEXT);
        });
      });
    });
  });
});
