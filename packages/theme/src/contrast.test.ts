import { describe, expect, it } from "vitest";
import {
  compositeOver,
  contrastRatio,
  isInSrgbGamut,
  parseColour,
  type Rgba,
  relativeLuminance,
  toHex,
} from "./contrast";
import {
  type ColourRoles,
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
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;
const { white, black, lightMap, darkMap } = representativeBackdrops;
const worstCaseBackdrops = { white, black };
const themeNames: ThemeName[] = ["light", "dark"];
const colourSets = ["colour", "opaque", "contrastMore"] as const;

/** Flattens a surface role over a backdrop so it can be compared. */
function surfaceOver(
  roles: ColourRoles,
  role: "surface" | "surfaceRaised",
  backdrop: string,
): Rgba {
  return compositeOver(roles[role], backdrop);
}

/** Contrast of an opaque role over an already composited surface. */
function over(
  roles: ColourRoles,
  role: keyof ColourRoles,
  under: Rgba,
): number {
  return contrastRatio(compositeOver(roles[role], under), under);
}

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

    describe.each(Object.entries(worstCaseBackdrops))(
      "surface over %s",
      (_name, backdrop) => {
        for (const surfaceRole of ["surface", "surfaceRaised"] as const) {
          const under = surfaceOver(roles, surfaceRole, backdrop);

          it(`${surfaceRole}: text and muted text reach ${AA_TEXT}:1`, () => {
            expect(over(roles, "text", under)).toBeGreaterThanOrEqual(AA_TEXT);
            expect(over(roles, "textMuted", under)).toBeGreaterThanOrEqual(
              AA_TEXT,
            );
          });

          it(`${surfaceRole}: accent text and danger text reach ${AA_TEXT}:1`, () => {
            expect(over(roles, "accent", under)).toBeGreaterThanOrEqual(
              AA_TEXT,
            );
            expect(over(roles, "danger", under)).toBeGreaterThanOrEqual(
              AA_TEXT,
            );
          });

          it(`${surfaceRole}: icons, control edges, selection and focus reach ${AA_NON_TEXT}:1`, () => {
            expect(over(roles, "text", under)).toBeGreaterThanOrEqual(
              AA_NON_TEXT,
            );
            expect(
              over(roles, "controlBoundary", under),
            ).toBeGreaterThanOrEqual(AA_NON_TEXT);
            expect(over(roles, "accent", under)).toBeGreaterThanOrEqual(
              AA_NON_TEXT,
            );
            expect(over(roles, "focusRing", under)).toBeGreaterThanOrEqual(
              AA_NON_TEXT,
            );
          });
        }
      },
    );

    it(`accent fill carries ${AA_TEXT}:1 text`, () => {
      expect(
        contrastRatio(roles.accentContrast, roles.accent),
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it(`tinted panels keep ${AA_TEXT}:1 text`, () => {
      const accentTint = parseColour(roles.accentTint);
      const dangerTint = parseColour(roles.dangerTint);
      expect(contrastRatio(roles.text, accentTint)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(roles.accent, accentTint)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(roles.text, dangerTint)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
      expect(contrastRatio(roles.danger, dangerTint)).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });

    it("lets the focus ring show on the bare map and against its inner ring", () => {
      for (const backdrop of [white, black]) {
        expect(
          contrastRatio(roles.focusRing, backdrop),
          `ring on ${backdrop}`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
      expect(
        contrastRatio(roles.focusRingInner, roles.focusRing),
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    it("keeps map overlays visible on light and dark basemaps", () => {
      for (const role of [
        "mapPin",
        "mapMeasureLine",
        "mapAccuracy",
        "mapScaleLine",
      ] as const) {
        for (const [name, backdrop] of Object.entries({
          white,
          black,
          lightMap,
          darkMap,
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
