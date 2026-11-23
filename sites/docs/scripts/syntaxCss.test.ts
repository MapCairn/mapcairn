// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { buildSyntaxCss } from "./syntaxCss";

describe("buildSyntaxCss", () => {
  const css = buildSyntaxCss(tokenValues.syntaxPalette);

  it("writes the light values on the page and the dark values on the dark theme", () => {
    expect(css).toMatch(/^html \{/m);
    expect(css).toContain('html[data-theme="dark"] {');
  });

  it("gives every role of both themes a custom property with the token's value", () => {
    for (const [theme, roles] of Object.entries(tokenValues.syntaxPalette)) {
      const block = css.split('html[data-theme="dark"] {')[
        theme === "dark" ? 1 : 0
      ];
      for (const [role, value] of Object.entries(roles)) {
        const name = role.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
        expect(block, `${theme} ${role}`).toContain(
          `--mc-syntax-${name}: ${value};`,
        );
      }
    }
  });

  it("changes when a value changes, so a token edit reaches the site", () => {
    const changed = buildSyntaxCss({
      ...tokenValues.syntaxPalette,
      light: { ...tokenValues.syntaxPalette.light, keyword: "#123456" },
    });
    expect(changed).toContain("--mc-syntax-keyword: #123456;");
  });
});
