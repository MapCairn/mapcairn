// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  compositeOver,
  contrastRatio,
  isInSrgbGamut,
  parseColour,
  relativeLuminance,
  toHex,
} from "./contrast";
import { AA_NON_TEXT, contrastPairs, measurePair } from "./contrastPairs";
import {
  colourRoleNames,
  representativeBackdrops,
  type ThemeName,
  themeValues,
} from "./tokenValues";

describe("parseColour", () => {
  it("parses 3, 4, 6 and 8 digit hex", () => {
    expect(parseColour("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour("#0008")).toEqual({ r: 0, g: 0, b: 0, a: 136 / 255 });
    expect(parseColour("#f2efe9")).toEqual({ r: 242, g: 239, b: 233, a: 1 });
    expect(parseColour("#1d202480").a).toBeCloseTo(128 / 255, 6);
  });

  it("parses comma and space separated rgb() and rgba()", () => {
    expect(parseColour("rgb(10, 20, 30)")).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 1,
    });
    expect(parseColour("rgba(10,20,30,0.5)")).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.5,
    });
    expect(parseColour("rgb(10 20 30 / 25%)")).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0.25,
    });
  });

  it("parses oklch() black, white and a known red", () => {
    expect(toHex(parseColour("oklch(1 0 0)"))).toBe("#ffffff");
    expect(toHex(parseColour("oklch(0 0 0)"))).toBe("#000000");
    expect(toHex(parseColour("oklch(62.8% 0.2577 29.23)"))).toBe("#ff0000");
  });

  it("parses oklch() alpha as a number or a percentage", () => {
    expect(parseColour("oklch(1 0 0 / 0.82)").a).toBe(0.82);
    expect(parseColour("oklch(1 0 0 / 40%)").a).toBe(0.4);
  });

  it("parses the transparent keyword", () => {
    expect(parseColour("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("reads rgb() percentages as fractions of 255, not as channel values", () => {
    expect(parseColour("rgb(100% 100% 100%)")).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 1,
    });
    expect(parseColour("rgb(50%, 0%, 0%)").r).toBeCloseTo(127.5, 6);
  });

  it("clamps out-of-range channels and alpha as CSS does", () => {
    expect(parseColour("rgb(300, 300, 300)")).toMatchObject({ r: 255 });
    expect(parseColour("rgb(-5, 0, 0)")).toMatchObject({ r: 0 });
    expect(parseColour("rgba(0, 0, 0, 2)").a).toBe(1);
    expect(parseColour("rgba(0, 0, 0, 150%)").a).toBe(1);
    expect(parseColour("rgba(0, 0, 0, -1)").a).toBe(0);
  });

  it("reads an oklch() hue in degrees and a chroma percentage", () => {
    expect(parseColour("oklch(0.5 0.1 90deg)")).toEqual(
      parseColour("oklch(0.5 0.1 90)"),
    );
    expect(parseColour("oklch(0.5 25% 90)")).toEqual(
      parseColour("oklch(0.5 0.1 90)"),
    );
  });

  it.each([
    "rgb(a b c)",
    "rgba(0, 0, 0, x)",
    "rgb(1 2)",
    "rgb(1, 2, 3, 0.5, 0.5)",
    `rgb(1,1,1${",1".repeat(50_000)})`,
    "rgb(none 0 0)",
    "rgb(1e999, 0, 0)",
    "rgb(1px, 2, 3)",
    "oklch(0.3 none 0)",
    "oklch(0.3 0.1 0.5turn)",
    "oklch(0.3 0.1 90rad)",
    "oklch(0.3 0.1 100grad)",
    "oklch(0.3 0.1)",
    "oklch(0.3 0.1 90 / x)",
    "oklch(NaN 0 0)",
  ])("rejects %s", (colour) => {
    expect(() => parseColour(colour)).toThrow(/Cannot parse colour/);
  });

  it("rejects colours it cannot parse", () => {
    expect(() => parseColour("tomato")).toThrow(/Cannot parse colour/);
    expect(() => parseColour("#12")).toThrow(/Cannot parse colour/);
  });
});

describe("isInSrgbGamut", () => {
  it("accepts in-gamut colours and rejects an out-of-gamut one", () => {
    expect(isInSrgbGamut("oklch(0.55 0.15 255)")).toBe(true);
    expect(isInSrgbGamut("#336699")).toBe(true);
    expect(isInSrgbGamut("oklch(0.9 0.3 255)")).toBe(false);
  });
});

describe("relativeLuminance and contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance(parseColour("#ffffff"))).toBeCloseTo(1, 6);
    expect(relativeLuminance(parseColour("#000000"))).toBe(0);
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("switches from the linear segment to the power curve at 0.04045", () => {
    const luminance = (channel: number): number =>
      relativeLuminance({ r: channel, g: channel, b: channel, a: 1 });
    // 10/255 is below the threshold and 11/255 above it.
    expect(luminance(10)).toBeCloseTo(10 / 255 / 12.92, 10);
    expect(luminance(11)).toBeCloseTo(((11 / 255 + 0.055) / 1.055) ** 2.4, 10);
  });

  it("uses the linear segment for very dark channels", () => {
    expect(relativeLuminance({ r: 5, g: 5, b: 5, a: 1 })).toBeCloseTo(
      5 / 255 / 12.92,
      6,
    );
  });

  it("refuses to compare a translucent colour without a backdrop", () => {
    expect(() => contrastRatio("rgba(0,0,0,0.5)", "#fff")).toThrow(
      /translucent/,
    );
  });
});

describe("compositeOver", () => {
  it("blends in gamma-encoded sRGB, as browsers do", () => {
    const out = compositeOver("rgba(0, 0, 0, 0.5)", "#ffffff");
    expect(out.r).toBeCloseTo(127.5, 6);
    expect(out.a).toBe(1);
  });

  it("returns the foreground unchanged when it is opaque", () => {
    expect(toHex(compositeOver("#336699", "#ffffff"))).toBe("#336699");
  });

  it("keeps partial alpha over a translucent backdrop", () => {
    const out = compositeOver("rgba(0,0,0,0.5)", "rgba(255,255,255,0.5)");
    expect(out.a).toBeCloseTo(0.75, 6);
  });

  it("returns transparent when both colours are fully transparent", () => {
    expect(compositeOver("transparent", "transparent")).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it("accepts parsed colours as well as strings", () => {
    const out = compositeOver(parseColour("#000000"), parseColour("#ffffff"));
    expect(toHex(out)).toBe("#000000");
  });
});

describe("toHex", () => {
  it("rounds channels and appends alpha only when translucent", () => {
    expect(toHex({ r: 254.6, g: 0, b: 0.4, a: 1 })).toBe("#ff0000");
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
  });
});

/*
 * Token enforcement. Surfaces are translucent, so every check composites the
 * surface over pure white and pure black first: whatever map a user has, the
 * result lies between those two extremes.
 *
 * Exempt, by WCAG 1.4.3 and 1.4.11: disabled controls (no token for them is
 * checked), decorative hairlines in the default set (checked only in
 * `contrastMore`), the scrim, and the translucent map fills. A translucent
 * fill compared with the map it sits on is meaningless; the outline beside it
 * carries the 3:1.
 */
const { white, black, lightMap, defaultBasemap } = representativeBackdrops;
const themeNames: ThemeName[] = ["light", "dark"];
const colourSets = ["colour", "opaque", "contrastMore"] as const;

describe.each(themeNames)("%s theme tokens", (theme) => {
  const values = themeValues[theme];

  it("keeps every colour inside the sRGB gamut", () => {
    for (const set of colourSets) {
      for (const [role, colour] of Object.entries(values[set])) {
        expect(isInSrgbGamut(colour), `${set}.${role}: ${colour}`).toBe(true);
      }
    }
  });

  it("defines every role in every set", () => {
    for (const set of colourSets) {
      expect(Object.keys(values[set]).sort()).toEqual(
        [...colourRoleNames].sort(),
      );
    }
  });

  it("makes the opaque and contrast sets truly opaque", () => {
    for (const set of ["opaque", "contrastMore"] as const) {
      for (const role of ["surface", "surfaceRaised"] as const) {
        expect(parseColour(values[set][role]).a, `${set}.${role}`).toBe(1);
      }
    }
  });

  describe.each(colourSets)("%s set", (set) => {
    const roles = values[set];

    describe.each(contrastPairs)(
      "$foreground on $background ($required:1)",
      (pair) => {
        const backdrops =
          pair.backdrops.length === 0 ? [undefined] : pair.backdrops;
        it.each(backdrops)("over %s", (backdrop) => {
          expect(measurePair(roles, pair, backdrop)).toBeGreaterThanOrEqual(
            pair.required,
          );
        });
      },
    );

    it("keeps map overlays visible on light and dark basemaps", () => {
      for (const role of ["mapPin", "mapMeasureLine", "mapAccuracy"] as const) {
        for (const [name, backdrop] of Object.entries({
          white,
          black,
          lightMap,
          defaultBasemap,
        })) {
          expect(
            contrastRatio(roles[role], backdrop),
            `${role} on ${name}`,
          ).toBeGreaterThanOrEqual(AA_NON_TEXT);
        }
      }
    });

    it("separates pins and lines from their halo", () => {
      expect(contrastRatio(roles.mapPin, roles.mapHalo)).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      );
      expect(
        contrastRatio(roles.mapMeasureLine, roles.mapHalo),
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  });

  it("paints the map before it loads in the default basemap's land colour, whatever the theme", () => {
    for (const set of colourSets) {
      expect(values[set].mapBackground, set).toBe(defaultBasemap);
    }
  });

  it("keeps the page background in the theme's own lightness", () => {
    const luminance = relativeLuminance(
      parseColour(values.colour.pageBackground),
    );
    if (theme === "dark") {
      expect(luminance).toBeLessThan(0.05);
    } else {
      expect(luminance).toBeGreaterThan(0.8);
    }
  });

  it("raises hairlines and chrome borders to 3:1 under prefers-contrast: more", () => {
    const roles = values.contrastMore;
    const surface = parseColour(roles.surface);
    expect(contrastRatio(roles.hairline, surface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
    expect(contrastRatio(roles.chromeBorder, surface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });
});

describe("parseColour on hostile input", () => {
  const spaces = " ".repeat(40_000);

  it.each([
    ["oklch(", `oklch(${spaces}x`],
    ["rgb(", `rgb(${spaces}x`],
    ["rgba(", `rgba(${spaces}x`],
  ])("rejects a long run of spaces after %s in linear time", (_name, input) => {
    const start = performance.now();
    expect(() => parseColour(input)).toThrow(/Cannot parse colour/);
    expect(performance.now() - start).toBeLessThan(250);
  });

  it("still accepts padding inside the brackets", () => {
    expect(parseColour("rgb(  10 ,  20 , 30  )")).toMatchObject({
      r: 10,
      g: 20,
      b: 30,
    });
    expect(parseColour("oklch(  0.5   0.1   200  )").r).toBeGreaterThanOrEqual(
      0,
    );
  });
});
