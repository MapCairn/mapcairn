import { DEFAULT_BASEMAP_BACKGROUND } from "@mapcairn/core";
import { parseColour, toHex, tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";

const { representativeBackdrops, themeValues } = tokenValues;

/**
 * `@mapcairn/theme` may not import `@mapcairn/core`, so the default basemap's land
 * colour is written in both: as `DEFAULT_BASEMAP_BACKGROUND` beside the
 * basemap definitions, and as the default-basemap backdrop that the `mapBackground`
 * token and the contrast tests use. This package sees both, so it checks that
 * they agree.
 */
describe("the map background before the map draws", () => {
  it("is the default basemap's land colour in the theme's backdrops", () => {
    expect(representativeBackdrops.defaultBasemap).toBe(
      DEFAULT_BASEMAP_BACKGROUND,
    );
  });

  it("uses that colour for the map in both themes and every colour set", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const set of ["colour", "opaque", "contrastMore"] as const) {
        expect(
          toHex(parseColour(themeValues[theme][set].mapBackground)),
          `${theme}.${set}`,
        ).toBe(DEFAULT_BASEMAP_BACKGROUND);
      }
    }
  });
});
