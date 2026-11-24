// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { createExampleThemeStylesheet, EXAMPLE_THEMES } from "./exampleThemes";

describe("the example's themes", () => {
  it("has two themes with their own scope, accent and font", () => {
    expect(EXAMPLE_THEMES).toHaveLength(2);
    const [first, second] = EXAMPLE_THEMES;
    expect(first.scope).not.toBe(second.scope);
    expect(first.colour.light.accent).not.toBe(second.colour.light.accent);
    expect(first.fontFamily).not.toBe(second.fontFamily);
  });

  it("scopes each theme to a class the page puts on that map's wrapper", () => {
    for (const theme of EXAMPLE_THEMES) {
      expect(theme.scope).toBe(`.${theme.className}`);
    }
  });
});

describe("the one generated stylesheet", () => {
  const css = createExampleThemeStylesheet();

  it("holds the rules of every theme's scope", () => {
    for (const theme of EXAMPLE_THEMES) {
      expect(css).toContain(` ${theme.scope} {`);
    }
  });

  it("writes each theme's own accent, in light and dark, and keeps them apart", () => {
    for (const theme of EXAMPLE_THEMES) {
      expect(css).toContain(theme.colour.light.accent);
      expect(css).toContain(theme.colour.dark.accent);
    }
    const [first, second] = EXAMPLE_THEMES;
    const alone = createExampleThemeStylesheet([first]);
    expect(alone).toContain(first.colour.light.accent);
    expect(alone).not.toContain(second.colour.light.accent);
    expect(alone).not.toContain(second.scope);
  });

  it("holds an inline style for no theme: it is plain stylesheet text", () => {
    expect(css).not.toMatch(/<style|<\/style/);
  });

  it("is refused loudly when a theme falls below WCAG 2.2 AA", () => {
    expect(() =>
      createExampleThemeStylesheet([
        {
          ...EXAMPLE_THEMES[0],
          colour: { light: { accent: "#cccccc" }, dark: {} },
        },
      ]),
    ).toThrow(/WCAG 2\.2 AA/);
  });
});
