// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { checkThemeContrast, type ThemeOverride } from "./checkThemeContrast";
import { representativeBackdrops } from "./tokenValues";

describe("checkThemeContrast", () => {
  it("checks the defaults in both themes when nothing is overridden", () => {
    const check = checkThemeContrast({});

    expect(check.passes).toBe(true);
    expect(check.invalid).toEqual([]);
    expect(new Set(check.findings.map((finding) => finding.theme))).toEqual(
      new Set(["light", "dark"]),
    );
    expect(check.findings.every((finding) => finding.passes)).toBe(true);
    expect(check.findings).toContainEqual(
      expect.objectContaining({
        theme: "dark",
        foreground: "text",
        background: "surface",
        backdrop: "black",
        kind: "text",
        required: 4.5,
      }),
    );
  });

  it("passes a brand override that keeps every pair above its threshold", () => {
    const override: ThemeOverride = {
      colour: {
        light: { text: "#111111", accent: "#1a4fa0" },
        dark: { accent: "#8db4f0" },
      },
    };

    const check = checkThemeContrast(override);

    expect(check.passes).toBe(true);
    expect(check.findings.filter((finding) => !finding.passes)).toEqual([]);
  });

  it("reports a text pair that fails in the dark theme only", () => {
    const check = checkThemeContrast({
      colour: { dark: { textMuted: "#555555" } },
    });

    expect(check.passes).toBe(false);
    const failing = check.findings.filter((finding) => !finding.passes);
    expect(failing.length).toBeGreaterThan(0);
    expect(failing.every((finding) => finding.theme === "dark")).toBe(true);
    expect(failing).toContainEqual(
      expect.objectContaining({
        foreground: "textMuted",
        background: "surface",
        kind: "text",
        required: 4.5,
      }),
    );
    for (const finding of failing) {
      expect(finding.ratio).toBeLessThan(finding.required);
    }
  });

  it("reports a focus ring that cannot be seen on the bare map", () => {
    const check = checkThemeContrast({
      colour: { light: { focusRing: "#f0f0f0" } },
    });

    expect(check.passes).toBe(false);
    expect(check.findings).toContainEqual(
      expect.objectContaining({
        theme: "light",
        foreground: "focusRing",
        background: "map",
        backdrop: "white",
        kind: "non-text",
        required: 3,
        passes: false,
      }),
    );
  });

  it("checks a translucent surface over a black map", () => {
    const check = checkThemeContrast({
      colour: { light: { surface: "oklch(1 0 0 / 0.1)" } },
    });

    const failing = check.findings.filter((finding) => !finding.passes);
    expect(failing).toContainEqual(
      expect.objectContaining({
        theme: "light",
        foreground: "text",
        background: "surface",
        backdrop: "black",
      }),
    );
    expect(
      check.findings.filter(
        (finding) =>
          finding.theme === "light" &&
          finding.foreground === "text" &&
          finding.background === "surface" &&
          finding.backdrop === "white",
      ),
    ).toEqual([
      expect.objectContaining({ passes: true, ratio: expect.any(Number) }),
    ]);
  });

  it("names every representative backdrop a surface pair was checked over", () => {
    const backdrops = checkThemeContrast({})
      .findings.filter(
        (finding) =>
          finding.theme === "light" &&
          finding.foreground === "text" &&
          finding.background === "surface",
      )
      .map((finding) => finding.backdrop);

    expect(backdrops).toEqual(Object.keys(representativeBackdrops));
  });

  it("keeps the default for a role that is left out", () => {
    const withText = checkThemeContrast({
      colour: { light: { text: "#222222" } },
    });
    const bare = checkThemeContrast({});

    expect(withText.findings.filter((f) => f.theme === "dark")).toEqual(
      bare.findings.filter((f) => f.theme === "dark"),
    );
    expect(
      withText.findings.filter(
        (f) => f.theme === "light" && f.foreground === "textMuted",
      ),
    ).toEqual(
      bare.findings.filter(
        (f) => f.theme === "light" && f.foreground === "textMuted",
      ),
    );
    expect(withText.findings).not.toEqual(bare.findings);
  });

  it("reports an unparseable colour as data and skips its pairs", () => {
    const check = checkThemeContrast({
      colour: { light: { accent: "not-a-colour" } },
    });

    expect(check.passes).toBe(false);
    expect(check.invalid).toEqual([
      {
        theme: "light",
        role: "accent",
        value: "not-a-colour",
        reason: "unparseable",
      },
    ]);
    expect(
      check.findings.some(
        (f) =>
          f.theme === "light" &&
          (f.foreground === "accent" || f.background === "accent"),
      ),
    ).toBe(false);
    expect(check.findings.some((f) => f.theme === "dark")).toBe(true);
  });

  it("reports a translucent colour where the role must be opaque", () => {
    const check = checkThemeContrast({
      colour: { dark: { accentTint: "rgba(0, 0, 0, 0.5)" } },
    });

    expect(check.invalid).toEqual([
      expect.objectContaining({
        theme: "dark",
        role: "accentTint",
        reason: "translucent",
      }),
    ]);
  });

  it("reports a role that cannot be overridden and a value that is not a string", () => {
    const check = checkThemeContrast({
      colour: {
        light: { pageBackground: "#fff", text: 12 },
      },
    } as unknown as ThemeOverride);

    expect(check.passes).toBe(false);
    expect(check.invalid).toEqual([
      expect.objectContaining({
        theme: "light",
        role: "pageBackground",
        reason: "unknown-role",
      }),
      expect.objectContaining({
        theme: "light",
        role: "text",
        value: 12,
        reason: "unparseable",
      }),
    ]);
  });

  it("treats a colour set or a theme set to undefined as left out", () => {
    const bare = checkThemeContrast({});

    expect(checkThemeContrast({ colour: undefined })).toEqual(bare);
    expect(checkThemeContrast({ colour: { light: undefined } })).toEqual(bare);
  });

  it("treats a role set to undefined as left out", () => {
    expect(
      checkThemeContrast({ colour: { light: { text: undefined } } }),
    ).toEqual(checkThemeContrast({}));
  });

  it.each([
    ["null", null],
    ["a string", "dark"],
    ["an array", []],
    ["colour set to null", { colour: null }],
    ["a theme set to a number", { colour: { light: 3 } }],
  ])("does not throw when the override is %s", (_name, override) => {
    expect(() =>
      checkThemeContrast(override as unknown as ThemeOverride),
    ).not.toThrow();
  });

  it("reads an rgb() percentage correctly, so white text on a light surface fails", () => {
    const check = checkThemeContrast({
      colour: { light: { text: "rgb(100% 100% 100%)" } },
    });

    const textOnSurface = check.findings.filter(
      (f) =>
        f.theme === "light" &&
        f.foreground === "text" &&
        f.background === "surface" &&
        f.backdrop === "white",
    );
    expect(textOnSurface).toHaveLength(1);
    expect(textOnSurface[0]?.ratio).toBeCloseTo(1, 1);
    expect(textOnSurface[0]?.passes).toBe(false);
  });

  it.each([
    "rgb(a b c)",
    "rgba(0,0,0,x)",
    "oklch(0.3 none 0)",
    "oklch(0.3 0.1 0.5turn)",
    `rgb(1,1,1${",1".repeat(50_000)})`,
  ])("reports %.30s as unparseable and never as a NaN finding", (value) => {
    const check = checkThemeContrast({ colour: { light: { text: value } } });

    expect(check.invalid).toEqual([
      { theme: "light", role: "text", value, reason: "unparseable" },
    ]);
    expect(check.findings.every((f) => Number.isFinite(f.ratio))).toBe(true);
  });

  it("reports an oklch() colour outside the sRGB gamut instead of measuring it clipped", () => {
    const check = checkThemeContrast({
      colour: { light: { accent: "oklch(0.9 0.3 255)" } },
    });

    expect(check.invalid).toEqual([
      expect.objectContaining({
        theme: "light",
        role: "accent",
        reason: "out-of-gamut",
      }),
    ]);
  });

  it("holds a host's text and accent to the page background and the map halo", () => {
    const pairs = checkThemeContrast({}).findings.filter(
      (f) => f.background === "pageBackground" || f.background === "mapHalo",
    );

    expect(
      pairs.map((f) => `${f.theme} ${f.foreground} on ${f.background}`),
    ).toEqual(
      ["light", "dark"].flatMap((theme) => [
        `${theme} text on pageBackground`,
        `${theme} textMuted on pageBackground`,
        `${theme} accent on pageBackground`,
        `${theme} text on mapHalo`,
      ]),
    );
  });

  it("fails a text colour that clears every surface but not the tint or the page", () => {
    const check = checkThemeContrast({
      colour: {
        light: {
          surface: "#ffffff",
          surfaceRaised: "#ffffff",
          textMuted: "#707070",
        },
      },
    });

    const failing = check.findings.filter((f) => !f.passes);
    expect(failing).toEqual([
      expect.objectContaining({
        theme: "light",
        foreground: "textMuted",
        background: "accentTint",
      }),
      expect.objectContaining({
        theme: "light",
        foreground: "textMuted",
        background: "pageBackground",
      }),
    ]);
  });

  it("refuses a tint that leaves selected rows' secondary text and the switch edge below AA", () => {
    const check = checkThemeContrast({
      colour: { light: { accentTint: "#709080", accent: "#000000" } },
    });

    expect(check.passes).toBe(false);
    expect(
      check.findings
        .filter((f) => !f.passes && f.background === "accentTint")
        .map((f) => f.foreground),
    ).toEqual(expect.arrayContaining(["textMuted", "controlBoundary"]));
  });

  describe("at the thresholds", () => {
    const ratioOf = (
      override: ThemeOverride,
      foreground: string,
      background: string,
    ) =>
      checkThemeContrast(override).findings.find(
        (f) =>
          f.theme === "light" &&
          f.foreground === foreground &&
          f.background === background,
      );

    it("passes text at #767676 on white (4.54:1) and fails #777777 (4.48:1)", () => {
      const pass = ratioOf(
        { colour: { light: { accent: "#ffffff", accentContrast: "#767676" } } },
        "accentContrast",
        "accent",
      );
      const fail = ratioOf(
        { colour: { light: { accent: "#ffffff", accentContrast: "#777777" } } },
        "accentContrast",
        "accent",
      );

      expect(pass?.ratio).toBeCloseTo(4.54, 2);
      expect(pass?.required).toBe(4.5);
      expect(pass?.passes).toBe(true);
      expect(fail?.ratio).toBeCloseTo(4.48, 2);
      expect(fail?.passes).toBe(false);
    });

    it("passes a non-text pair at #949494 on white (3.03:1) and fails #959595 (2.99:1)", () => {
      const pass = ratioOf(
        {
          colour: {
            light: { focusRing: "#ffffff", focusRingInner: "#949494" },
          },
        },
        "focusRingInner",
        "focusRing",
      );
      const fail = ratioOf(
        {
          colour: {
            light: { focusRing: "#ffffff", focusRingInner: "#959595" },
          },
        },
        "focusRingInner",
        "focusRing",
      );

      expect(pass?.ratio).toBeCloseTo(3.03, 2);
      expect(pass?.required).toBe(3);
      expect(pass?.passes).toBe(true);
      expect(fail?.ratio).toBeGreaterThan(2.99);
      expect(fail?.ratio).toBeLessThan(3);
      expect(fail?.passes).toBe(false);
    });
  });

  describe("never throws on input that throws when read", () => {
    const throwing = (): never => {
      throw new Error("trap");
    };

    it.each([
      [
        "a getter for the colour set",
        {
          get colour() {
            return throwing();
          },
        },
      ],
      [
        "a getter for a theme",
        {
          colour: {
            get light() {
              return throwing();
            },
          },
        },
      ],
      [
        "a getter for a role",
        {
          colour: {
            light: {
              get text() {
                return throwing();
              },
            },
          },
        },
      ],
      [
        "a proxy that throws on ownKeys",
        { colour: { light: new Proxy({}, { ownKeys: throwing }) } },
      ],
      [
        "a revoked proxy",
        (() => {
          const revoked = Proxy.revocable({}, {});
          revoked.revoke();
          return { colour: { light: revoked.proxy } };
        })(),
      ],
    ])("%s", (_name, override) => {
      const check = checkThemeContrast(override as unknown as ThemeOverride);

      expect(check.passes).toBe(false);
      expect(check.invalid.map((i) => i.reason)).toContain("unreadable");
    });
  });

  describe("a wrong-shaped override is reported, never passed", () => {
    class Override {
      colour = {};
    }

    it.each([
      ["null", null, "override", "malformed"],
      ["undefined", undefined, "override", "malformed"],
      ["a string", "x", "override", "malformed"],
      ["an array", [], "override", "malformed"],
      ["a Map", new Map(), "override", "malformed"],
      ["a class instance", new Override(), "override", "malformed"],
      [
        "inherited properties",
        Object.create({ colour: { light: { text: "#000" } } }),
        "override",
        "malformed",
      ],
      ["a colour set that is a string", { colour: "x" }, "colour", "malformed"],
      ["a colour set that is null", { colour: null }, "colour", "malformed"],
      ["a colour set that is an array", { colour: [] }, "colour", "malformed"],
      ["a misspelt colour key", { colours: {} }, "colours", "unknown-key"],
      [
        "a miscased theme key",
        { colour: { Light: {} } },
        "Light",
        "unknown-key",
      ],
    ])("%s", (_name, override, role, reason) => {
      const check = checkThemeContrast(override as unknown as ThemeOverride);

      expect(check.passes).toBe(false);
      expect(check.invalid).toEqual([
        expect.objectContaining({ theme: null, role, reason }),
      ]);
    });

    it.each([
      ["a string", "#fff"],
      ["a number", 3],
      ["null", null],
      ["an array", []],
    ])("reports a theme that is %s and skips its findings", (_name, light) => {
      const check = checkThemeContrast({
        colour: { light },
      } as unknown as ThemeOverride);

      expect(check.passes).toBe(false);
      expect(check.invalid).toEqual([
        { theme: "light", role: "colour", value: light, reason: "malformed" },
      ]);
      expect(check.findings.some((f) => f.theme === "light")).toBe(false);
      expect(check.findings.some((f) => f.theme === "dark")).toBe(true);
    });

    it("accepts an object with no prototype", () => {
      const light = Object.assign(Object.create(null), { text: "#111111" });

      expect(checkThemeContrast({ colour: { light } }).invalid).toEqual([]);
    });
  });

  it("measures a translucent foreground over what is under it", () => {
    const check = checkThemeContrast({
      colour: { light: { text: "rgba(0, 0, 0, 0.5)" } },
    });
    const ratio = (backdrop: string): number | undefined =>
      check.findings.find(
        (f) =>
          f.theme === "light" &&
          f.foreground === "text" &&
          f.background === "surface" &&
          f.backdrop === backdrop,
      )?.ratio;

    expect(ratio("white")).toBeCloseTo(3.98, 2);
    expect(ratio("black")).toBeCloseTo(3.62, 2);
  });
});
