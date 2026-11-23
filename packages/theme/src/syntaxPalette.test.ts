// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { compositeOver, contrastRatio } from "./contrast";
import {
  type SyntaxRoles,
  syntaxPalette,
  type ThemeName,
  themeValues,
} from "./tokenValues";

/** WCAG 2.2 AA for text. */
const AA_TEXT = 4.5;
/** The most chroma a "muted" syntax hue may have. */
const MAX_MUTED_CHROMA = 0.13;
/** The fewest distinct hues across the syntax roles, so it is not one colour. */
const MIN_HUES = 5;

const THEMES: readonly ThemeName[] = ["light", "dark"];
const SETS = ["colour", "opaque", "contrastMore"] as const;
const ROLES = Object.keys(syntaxPalette.light) as (keyof SyntaxRoles)[];

/** The code block's background: the raised surface over the page background. */
function codeBackground(theme: ThemeName, set: (typeof SETS)[number]) {
  const colours = themeValues[theme][set];
  return compositeOver(
    colours.surfaceRaised,
    compositeOver(colours.pageBackground, "#ffffff"),
  );
}

/** The highlighted line: the accent tint over the code block. */
function highlightBackground(theme: ThemeName, set: (typeof SETS)[number]) {
  return compositeOver(
    themeValues[theme][set].accentTint,
    codeBackground(theme, set),
  );
}

describe("syntax palette", () => {
  for (const theme of THEMES) {
    for (const set of SETS) {
      for (const role of ROLES) {
        it(`${role} reaches 4.5:1 on the ${theme} code block (${set})`, () => {
          const ratio = contrastRatio(
            compositeOver(syntaxPalette[theme][role], "#ffffff"),
            codeBackground(theme, set),
          );
          expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
        });

        it(`${role} reaches 4.5:1 on the ${theme} highlighted line (${set})`, () => {
          const ratio = contrastRatio(
            compositeOver(syntaxPalette[theme][role], "#ffffff"),
            highlightBackground(theme, set),
          );
          expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
        });
      }
    }

    it(`keeps the ${theme} hues muted and varied`, () => {
      const lch = ROLES.map((role) => {
        const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(
          syntaxPalette[theme][role],
        );
        return {
          role,
          chroma: Number(match?.[2]),
          hue: Number(match?.[3]),
        };
      });
      // Functions take the accent itself, so only the added hues are bounded.
      for (const { role, chroma } of lch) {
        if (role !== "function") {
          expect(chroma, role).toBeLessThanOrEqual(MAX_MUTED_CHROMA);
        }
      }
      const hues = new Set(
        lch.filter((c) => c.chroma > 0.02).map((c) => c.hue),
      );
      expect(hues.size).toBeGreaterThanOrEqual(MIN_HUES);
    });
  }
});
