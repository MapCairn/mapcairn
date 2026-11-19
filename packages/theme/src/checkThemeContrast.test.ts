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
});
