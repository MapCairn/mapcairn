// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(new URL("./custom.css", import.meta.url), "utf8");
/** The stylesheet without its comments, so a word in a comment is not a finding. */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("custom.css", () => {
  it("holds no colour of its own: every colour is a token alias or a keyword", () => {
    expect(RULES).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(RULES).not.toMatch(
      /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/i,
    );
  });

  it("sets no font size, line height or radius from a literal number", () => {
    for (const property of ["font-size", "line-height", "border-radius"]) {
      const literal = new RegExp(
        `${property}:\\s*[0-9.]+(?:px|rem|em)?\\s*;`,
        "g",
      );
      expect(RULES.match(literal) ?? [], property).toEqual([]);
    }
  });

  it("uses no !important", () => {
    expect(RULES).not.toContain("!important");
  });

  it("applies the blur token as the whole filter, because the token is a complete value", () => {
    expect(RULES).not.toMatch(/blur\(\s*var\(/);
    expect(RULES).toMatch(/backdrop-filter:\s*var\(--mc-effect-blur\)/);
  });

  it("shows the header links only where the framework's drawer toggle is hidden", () => {
    expect(RULES).toMatch(
      /@media \(max-width: 996px\)\s*{[^}]*\.header-nav\s*{\s*display:\s*none/,
    );
  });

  it("never clips the header links' focus ring by scrolling their row", () => {
    const rules = RULES.match(/\.header-nav\s*{[^}]*}/g) ?? [];
    expect(rules.join("")).not.toMatch(/overflow/);
  });

  it("names only token aliases that the generated stylesheet defines", async () => {
    const { tokens } = await import("@mapcairn/theme");
    const { buildThemeCss } = await import("../../scripts/themeCss");
    const defined = new Set(
      [...buildThemeCss(tokens).matchAll(/(--mc-[\w-]+):/g)].map((m) => m[1]),
    );
    const used = [...RULES.matchAll(/var\((--mc-[\w-]+)\)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(20);
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });
});
