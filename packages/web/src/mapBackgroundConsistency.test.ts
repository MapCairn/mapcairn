// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  BUILT_IN_BASEMAP_CATALOGUE,
  DEFAULT_BASEMAP_BACKGROUND,
  DEFAULT_DARK_BASEMAP_BACKGROUND,
  defaultBasemapFor,
} from "@mapcairn/core";
import { parseColour, toHex, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { HOST_BASEMAP_CATALOGUE } from "./basemaps/hostBasemaps";

const { representativeBackdrops, themeValues } = tokenValues;

/**
 * `@mapcairn/theme` may not import `@mapcairn/core`, so the land colour of
 * each theme's default basemap is written in both: as
 * `DEFAULT_BASEMAP_BACKGROUND` and `DEFAULT_DARK_BASEMAP_BACKGROUND` beside
 * the basemap definitions, and as the `defaultBasemap` and `defaultDarkBasemap`
 * backdrops that the `mapBackground` token and the contrast tests use. This
 * package sees both, so it checks that they agree.
 */
describe("the map background before the map draws", () => {
  it("is each default basemap's land colour in the theme's backdrops", () => {
    expect(representativeBackdrops.defaultBasemap).toBe(
      DEFAULT_BASEMAP_BACKGROUND,
    );
    expect(representativeBackdrops.defaultDarkBasemap).toBe(
      DEFAULT_DARK_BASEMAP_BACKGROUND,
    );
  });

  it("uses the land colour of the theme's default basemap for the map, in every colour set", () => {
    const expected = {
      light: DEFAULT_BASEMAP_BACKGROUND,
      dark: DEFAULT_DARK_BASEMAP_BACKGROUND,
    } as const;
    for (const theme of ["light", "dark"] as const) {
      for (const set of ["colour", "opaque", "contrastMore"] as const) {
        expect(
          toHex(parseColour(themeValues[theme][set].mapBackground)),
          `${theme}.${set}`,
        ).toBe(expected[theme]);
      }
    }
  });

  it("matches the swatch of the dark default, so the placeholder and Fiord's picker tile are one colour", () => {
    for (const catalogue of [
      BUILT_IN_BASEMAP_CATALOGUE,
      HOST_BASEMAP_CATALOGUE,
    ]) {
      expect(defaultBasemapFor(catalogue, "dark").swatch).toBe(
        DEFAULT_DARK_BASEMAP_BACKGROUND,
      );
    }
  });
});
