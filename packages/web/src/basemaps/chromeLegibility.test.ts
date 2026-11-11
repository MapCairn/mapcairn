import { BUILT_IN_BASEMAP_CATALOGUE } from "@mapcairn/core";
import { compositeOver, contrastRatio, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "./hostBasemaps";

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/**
 * The colour chrome that has no surface of its own would sit on, per basemap:
 * the land colour of its style, which is the largest area behind the bottom
 * corners. It lists every built-in basemap, not only the ones the site offers,
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
};

/** The same for a basemap only the reference host defines, which the second test below checks. */
const hostBasemapBackdrops: Record<string, string> = {
  topographic: "#f2efe9",
  // Satellite has no single land colour: this is its dark ocean, the largest
  // area of a world view. Its other surfaces are in `imageryBackdrops`.
  satellite: "#111d35",
};

/**
 * Typical colours of Satellite's Sentinel-2 cloudless imagery, from dark sea
 * to snow, because chrome and markers sit on whichever is under them.
 */
const imageryBackdrops: Record<string, string> = {
  imageryOcean: "#111d35",
  imageryForest: "#2c3b23",
  imageryFarmland: "#7a6f4c",
  imageryUrban: "#8c8a85",
  imageryDesert: "#d8c29a",
  imagerySnow: "#f2f4f6",
};

/** Colours that bracket any map a host might add. */
const extremeBackdrops: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  midGrey: "#808080",
};

const allBackdrops = {
  ...basemapBackdrops,
  ...hostBasemapBackdrops,
  ...imageryBackdrops,
  ...extremeBackdrops,
};
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
      expect(
        { ...basemapBackdrops, ...hostBasemapBackdrops },
        basemap.id,
      ).toHaveProperty(basemap.id);
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

describe("data markers over Satellite's imagery", () => {
  const { edge, halo } = tokenValues.dataMarker;

  it.each(Object.entries(imageryBackdrops))(
    "set a marker off from %s by its dark edge or its white halo, at 3:1 or better",
    (_name, ground) => {
      expect(
        Math.max(contrastRatio(edge, ground), contrastRatio(halo, ground)),
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    },
  );
});

/**
 * Lowest contrast between the space around a globe and a basemap's land, so
 * the edge of the sphere stays visible. The edge is decoration rather than a
 * control, so WCAG asks for no ratio; this keeps it from fading away.
 */
const GLOBE_EDGE = 1.2;

describe("the space around a globe", () => {
  const siteLands = { ...basemapBackdrops, ...hostBasemapBackdrops };

  describe.each(themes)("%s theme", (theme) => {
    describe.each(colourSets)("%s colours", (set) => {
      const roles = tokenValues.themeValues[theme][set];
      const space = roles.mapGlobeSpace;

      it(`keeps the scale readout, the coordinates and the credits button at ${AA_TEXT}:1 over it`, () => {
        const surface = compositeOver(roles.surface, space);
        for (const role of ["text", "textMuted"] as const) {
          expect(
            contrastRatio(compositeOver(roles[role], surface), surface),
            role,
          ).toBeGreaterThanOrEqual(AA_TEXT);
        }
      });

      it.each(Object.entries(siteLands))(
        `keeps the edge of the globe at ${GLOBE_EDGE}:1 against %s land`,
        (_name, land) => {
          expect(
            contrastRatio(
              compositeOver(space, land),
              compositeOver(land, land),
            ),
          ).toBeGreaterThanOrEqual(GLOBE_EDGE);
        },
      );
    });
  });

  it("is darker than the pale placeholder, and darkest in the dark theme", () => {
    const { light, dark } = tokenValues.themeValues;
    const lightness = (colour: string) =>
      contrastRatio(
        compositeOver(colour, "#ffffff"),
        compositeOver("#ffffff", "#ffffff"),
      );
    expect(lightness(light.colour.mapGlobeSpace)).toBeGreaterThan(
      lightness(light.colour.mapBackground),
    );
    expect(lightness(dark.colour.mapGlobeSpace)).toBeGreaterThan(
      lightness(light.colour.mapGlobeSpace),
    );
  });
});
