// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import { buildThemeCss, buildThemeRule } from "./themeCss";

describe("buildThemeRule", () => {
  it("writes the same variables under any selector, so a block with its own theme reads its own values", () => {
    const rule = buildThemeRule(tokens, ".block");
    expect(rule.startsWith(".block {")).toBe(true);
    expect(rule).toContain(`--mc-color-text: ${tokens.color.text};`);
    expect(buildThemeCss(tokens)).toContain(
      rule.split("\n").slice(1).join("\n"),
    );
  });
});

describe("buildThemeCss", () => {
  const css = buildThemeCss(tokens);

  it("is written so it wins over the framework's dark values, which sit on html[data-theme]", () => {
    expect(css).toContain("html, html[data-theme] {");
  });

  it("maps the framework's primary colour to the accent token", () => {
    expect(css).toContain(`--ifm-color-primary: ${tokens.color.accent};`);
  });

  it("gives every token a stable alias for the site's own rules", () => {
    expect(css).toContain(
      `--mc-color-surface-raised: ${tokens.color.surfaceRaised};`,
    );
    expect(css).toContain(
      `--mc-type-body-line-height: ${tokens.type.body.lineHeight};`,
    );
    expect(css).toContain(`--mc-space-xs: ${tokens.space.xs};`);
  });

  it("takes the font families and the page colours from tokens", () => {
    expect(css).toContain(`--ifm-font-family-base: ${tokens.type.family};`);
    expect(css).toContain(
      `--ifm-background-color: ${tokens.color.pageBackground};`,
    );
    expect(css).toContain(`--ifm-font-color-base: ${tokens.color.text};`);
  });

  it("writes only token references, never a colour or length of its own", () => {
    const values = [...css.matchAll(/--[\w-]+:\s*([^;]+);/g)].map(
      (match) => match[1] ?? "",
    );
    expect(values.length).toBeGreaterThan(10);
    for (const value of values) {
      expect(value).toMatch(/^var\(--[\w-]+\)$/);
    }
  });

  it("changes when a token changes, so a token edit reaches the site", () => {
    const changed = buildThemeCss({
      ...tokens,
      color: { ...tokens.color, accent: "var(--other-accent)" },
    });
    expect(changed).toContain("--ifm-color-primary: var(--other-accent);");
  });
});
