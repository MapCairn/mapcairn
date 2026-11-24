// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { createThemeStylesheet, type ThemeColours } from "@mapcairn/theme";

/** One themed map on the page: the class on its wrapper and what that class changes. */
export interface ExampleTheme {
  /** The colour roles to change, in each theme. */
  readonly colour: {
    readonly light: Partial<ThemeColours>;
    readonly dark: Partial<ThemeColours>;
  };
  /** A list of plain family names, as `createThemeStylesheet` reads it. */
  readonly fontFamily: string;
  /** The class the page puts on the element around this map. */
  readonly className: string;
  /** The scope `createThemeStylesheet` writes the rules for: the class as a selector. */
  readonly scope: string;
  /** What the page calls the map. */
  readonly title: string;
}

/**
 * The two themes the page shows side by side. Each changes the accent and the
 * typeface and nothing else. The faces are families a device already has, so no
 * font file is loaded and none is allowed by the page's policy. Light and dark
 * stay one choice for the whole page: the SDK's stylesheet reads `data-theme`
 * on the document element, so both maps follow it together.
 */
export const EXAMPLE_THEMES: readonly [ExampleTheme, ExampleTheme] = [
  {
    className: "map-pine",
    scope: ".map-pine",
    title: "Pine",
    colour: {
      light: { accent: "#0b5c3a", accentTint: "#d9efe4" },
      dark: { accent: "#7fd9aa", accentTint: "#17382a" },
    },
    fontFamily: '"Trebuchet MS", Verdana, sans-serif',
  },
  {
    className: "map-heather",
    scope: ".map-heather",
    title: "Heather",
    colour: {
      light: { accent: "#6b2f8a", accentTint: "#efe0f6" },
      dark: { accent: "#d9aaf0", accentTint: "#3a1f4a" },
    },
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
];

/**
 * The one stylesheet that themes every map: each theme's rules, in its own
 * scope, joined as text. A host runs this in its build and serves the result as
 * a file, because a strict policy blocks an inline `<style>`.
 *
 * @param themes - The themes to write, the page's two by default.
 * @returns The stylesheet text.
 * @throws When a theme falls below WCAG 2.2 AA or cannot be used.
 */
export function createExampleThemeStylesheet(
  themes: readonly ExampleTheme[] = EXAMPLE_THEMES,
): string {
  return themes
    .map(({ scope, colour, fontFamily }) => {
      const result = createThemeStylesheet({ colour, fontFamily }, { scope });
      if (!result.ok) {
        throw new Error(
          `The ${scope} theme is below WCAG 2.2 AA or cannot be used.`,
        );
      }
      return result.css;
    })
    .join("");
}
