// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  compositeOver,
  contrastRatio,
  focusRing,
  tokens,
  tokenValues,
} from "@mapcairn/theme";
import { describe, expect, it } from "vitest";
import {
  contrastRows,
  NON_TEXT_RATIO,
  ratioText,
  syntaxRows,
  TEXT_RATIO,
  verdict,
} from "./designTokens";
import { buildDesignTokensCss } from "./designTokensCss";
import { buildDesignTokensPage } from "./designTokensPage";
import { parseDocSource } from "./markdownCopies";

const source = tokenValues;
const page = buildDesignTokensPage(source);
const css = buildDesignTokensCss(source);

describe("contrastRows", () => {
  it("measures text on the surface with the SDK's contrast maths", () => {
    const colours = source.themeValues.light.colour;
    const background = compositeOver(colours.surface, colours.pageBackground);
    const expected = contrastRatio(
      compositeOver(colours.text, background),
      background,
    );
    const row = contrastRows(source, "light").find(
      ({ label }) => label === "Text on surface",
    );
    expect(row?.ratio).toBeCloseTo(expected, 6);
  });

  it("holds every pair to the limit of its kind in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const row of contrastRows(source, theme)) {
        const limit = row.use === "Text" ? TEXT_RATIO : NON_TEXT_RATIO;
        expect(row.ratio, `${theme}: ${row.label}`).toBeGreaterThanOrEqual(
          limit,
        );
      }
    }
  });

  it("reports a pair that falls short when a colour is changed", () => {
    const weak = {
      ...source,
      themeValues: {
        ...source.themeValues,
        light: {
          ...source.themeValues.light,
          colour: { ...source.themeValues.light.colour, text: "#cccccc" },
        },
      },
    };
    const row = contrastRows(weak, "light").find(
      ({ label }) => label === "Text on surface",
    );
    expect(verdict(row?.ratio ?? 0, TEXT_RATIO)).toBe("Fail");
  });
});

describe("syntaxRows", () => {
  it("measures every role of the palette on the code background", () => {
    const rows = syntaxRows(source, "dark");
    expect(rows.map(({ role }) => role)).toEqual(
      Object.keys(source.syntaxPalette.dark),
    );
    for (const row of rows) {
      expect(row.ratio).toBeGreaterThanOrEqual(TEXT_RATIO);
    }
  });
});

describe("ratioText and verdict", () => {
  it("cuts to two decimals and never rounds up past a limit", () => {
    expect(ratioText(4.499)).toBe("4.49:1");
    expect(verdict(4.499, TEXT_RATIO)).toBe("Fail");
    expect(verdict(4.5, TEXT_RATIO)).toBe("Pass");
  });
});

describe("buildDesignTokensPage", () => {
  it("is deterministic", () => {
    expect(buildDesignTokensPage(source)).toBe(page);
  });

  it("has the front matter the search, copies and llms files need", () => {
    const parsed = parseDocSource("design-visual", page);
    expect(parsed.title).toBe("Design tokens, visually");
    expect(parsed.description.length).toBeGreaterThan(40);
    expect(parsed.permalink).toBe("/design/visual-tokens/");
  });

  it("shows both themes at once, each in its own scope", () => {
    expect(page).toContain('data-theme="light"');
    expect(page).toContain('data-theme="dark"');
  });

  it("lists every colour role of both themes with its value", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [role, value] of Object.entries(
        source.themeValues[theme].colour,
      )) {
        expect(page, `${theme} ${role}`).toContain(`\`${role}\``);
        expect(page, `${theme} ${role}`).toContain(`\`${value}\``);
      }
    }
  });

  it("states each pair's ratio with a pass or fail for both limits, as words", () => {
    for (const row of contrastRows(source, "dark")) {
      expect(page).toContain(
        `| ${row.label} | ${row.use} | ${ratioText(row.ratio)} | ${verdict(row.ratio, TEXT_RATIO)} | ${verdict(row.ratio, NON_TEXT_RATIO)} |`,
      );
    }
  });

  it("gives each type step its size, line height and tracking", () => {
    for (const [step, { size, lineHeight, tracking }] of Object.entries(
      source.typeScale,
    )) {
      expect(page).toContain(
        `| \`type.${step}\` | ${size} | ${lineHeight} | ${tracking} |`,
      );
    }
  });

  it("gives each spacing and radius step its value", () => {
    for (const [name, value] of Object.entries(source.space)) {
      expect(page).toContain(`\`space.${name}\` | ${value} |`);
    }
    for (const [name, value] of Object.entries(source.radius)) {
      expect(page).toContain(`\`radius.${name}\` | ${value} |`);
    }
  });

  it("lists the declarations of each specimen as its text alternative", () => {
    expect(page).toContain("Focus ring");
    expect(page).toContain("outline: focusRing.outline");
    expect(page).toContain("background: color.accent");
  });

  it("lists every syntax role with its colour in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const value of Object.values(source.syntaxPalette[theme])) {
        expect(page).toContain(`\`${value}\``);
      }
    }
  });

  it("has no style attribute, script or other origin, which the site's policy blocks", () => {
    expect(page).not.toMatch(/style\s*=/);
    expect(page).not.toMatch(/<script/i);
    expect(page).not.toMatch(/https?:\/\//);
  });

  it("marks every drawn element decorative, so the tables are what a reader of the page gets", () => {
    const drawn = page
      .split("\n")
      .filter((line) =>
        /className="dt-(sample|bar|radius-box|swatch|type|button|field|chip|surface|focus|syn) /.test(
          line,
        ),
      );
    expect(drawn.length).toBeGreaterThan(20);
    for (const line of drawn) {
      expect(line).toContain('aria-hidden="true"');
    }
  });

  it("uses only classes the stylesheet defines", () => {
    const used = new Set(
      [...page.matchAll(/className="([^"]+)"/g)].flatMap(
        (match) => match[1]?.split(" ") ?? [],
      ),
    );
    expect(used.size).toBeGreaterThan(10);
    for (const name of used) {
      expect(css, name).toContain(`.${name}`);
    }
  });
});

describe("buildDesignTokensCss", () => {
  it("is deterministic and carries no inline-style machinery", () => {
    expect(buildDesignTokensCss(source)).toBe(css);
    expect(css).not.toContain("<");
  });

  it("scopes the theme variables to the wrapper, so both themes show whatever the reader chose", () => {
    expect(css).toMatch(/\.dt-theme\s*\{[^}]*--mc-color-text: var\(--/);
    expect(css).toContain(`--mc-color-text: ${tokens.color.text};`);
  });

  it("colours the swatches from the token references, not from values of its own", () => {
    expect(css).toMatch(/\.dt-bg-surface-raised\s*\{\s*background: var\(--/);
    expect(css).toMatch(/\.dt-fg-accent-contrast\s*\{\s*color: var\(--/);
  });

  it("draws spacing and radius from the tokens", () => {
    expect(css).toContain(`width: calc(${tokens.space.md} * 4);`);
    expect(css).toContain(`border-radius: ${tokens.radius.control};`);
  });

  it("writes the syntax palette values per theme", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [role, value] of Object.entries(source.syntaxPalette[theme])) {
        expect(css).toContain(
          `.dt-theme[data-theme="${theme}"] .dt-syn-${role.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)} { color: ${value}; }`,
        );
      }
    }
  });

  it("writes each specimen's declarations from the same data the page lists", () => {
    expect(css).toMatch(
      new RegExp(
        `\\.dt-button--primary \\{[^}]*background: ${tokens.color.accent.replace(/[()]/g, "\\$&")};`,
      ),
    );
    expect(css).toContain(`outline: ${focusRing.outline};`);
  });
});
