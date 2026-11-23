// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import {
  FOCUS_SPECIMEN,
  kebab,
  SPECIMENS,
  type Specimen,
  type ThemeSource,
} from "./designTokens";
import { buildThemeRule } from "./themeCss";

/** The class every themed block of the page carries. Its `data-theme` picks the theme drawn in it. */
export const THEME_CLASS = "dt-theme";

/** How many times larger than its value a spacing bar is drawn, so the smallest step can be seen. */
const SPACE_DRAW_SCALE = 4;

/** The narrowest a sample may be before the grid drops to fewer columns, in rem. */
const SAMPLE_MIN_WIDTH = "9rem";

/** The framework variables that read the page's theme, set again in a block so its own theme's values reach them. */
const BLOCK_PROPERTIES: ReadonlyArray<readonly [string, string]> = [
  ["background", tokens.color.pageBackground],
  ["color", tokens.color.text],
  ["border", `1px solid ${tokens.color.hairline}`],
  ["border-radius", tokens.radius.control],
  ["padding", tokens.space.md],
  ["margin-block", tokens.space.md],
];

type Declaration = readonly [property: string, value: string];

/** One rule, its declarations one to a line. */
function rule(selector: string, declarations: readonly Declaration[]): string {
  const lines = declarations.map(
    ([property, value]) => `  ${property}: ${value};`,
  );
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/** A role's fill and text colour classes. */
function roleRules(): string[] {
  return Object.entries(tokens.color).flatMap(([role, value]) => [
    rule(`.dt-bg-${kebab(role)}`, [["background", value]]),
    rule(`.dt-fg-${kebab(role)}`, [["color", value]]),
  ]);
}

/** One class for each type step, set as the interface sets it. */
function typeRules(source: ThemeSource): string[] {
  return Object.keys(source.typeScale).map((step) => {
    const token = tokens.type[step as keyof typeof source.typeScale];
    return rule(`.dt-type-${step}`, [
      ["font-size", token.size],
      ["line-height", token.lineHeight],
      ["letter-spacing", token.tracking],
    ]);
  });
}

function spaceRules(source: ThemeSource): string[] {
  return Object.keys(source.space).map((name) =>
    rule(`.dt-space-${name}`, [
      [
        "width",
        `calc(${tokens.space[name as keyof typeof tokens.space]} * ${SPACE_DRAW_SCALE})`,
      ],
    ]),
  );
}

function radiusRules(source: ThemeSource): string[] {
  return Object.keys(source.radius).map((name) =>
    rule(`.dt-radius-${name}`, [
      ["border-radius", tokens.radius[name as keyof typeof tokens.radius]],
    ]),
  );
}

/** The rule of a specimen: the declarations its data lists, after the layout its kind needs. */
function specimenRule(specimen: Specimen): string {
  const selector = `.${specimen.className.split(" ").pop()}`;
  return rule(
    selector,
    specimen.uses.map((use) => [use.property, use.value] as const),
  );
}

/** The syntax colours of one theme, each role under the theme's own block. */
function syntaxRules(source: ThemeSource): string[] {
  return (["light", "dark"] as const).flatMap((theme) =>
    Object.entries(source.syntaxPalette[theme]).map(
      ([role, value]) =>
        `.${THEME_CLASS}[data-theme="${theme}"] .dt-syn-${kebab(role)} { color: ${value}; }\n`,
    ),
  );
}

/** The layout of the drawn parts: what no token names, such as that a swatch is a box. */
function layoutRules(): string[] {
  const { color, size, space, type } = tokens;
  return [
    rule(`.${THEME_CLASS} h3, .${THEME_CLASS} h4`, [
      ["color", color.text],
      ["margin-block-start", "0"],
    ]),
    rule(`.${THEME_CLASS} table th, .${THEME_CLASS} table td`, [
      ["border-color", color.hairline],
      ["padding", `${space.xxs} ${space.xs}`],
      ["font-size", type.small.size],
    ]),
    rule(`.${THEME_CLASS} table th`, [["background", color.surfaceRaised]]),
    rule(".dt-swatch", [
      ["display", "inline-block"],
      ["width", size.icon],
      ["height", size.icon],
      ["margin-inline-end", space.xs],
      ["border", `1px solid ${color.controlBoundary}`],
      ["border-radius", tokens.radius.inner],
      ["vertical-align", "middle"],
    ]),
    rule(".dt-samples", [
      ["display", "grid"],
      [
        "grid-template-columns",
        `repeat(auto-fill, minmax(min(100%, ${SAMPLE_MIN_WIDTH}), 1fr))`,
      ],
      ["gap", space.sm],
      ["margin-block", space.md],
    ]),
    rule(".dt-sample", [
      ["padding", space.sm],
      ["border", `1px solid ${color.hairline}`],
      ["border-radius", tokens.radius.inner],
      ["font-size", type.small.size],
      ["font-weight", type.weight.semibold],
    ]),
    rule(".dt-type", [
      ["margin-block", space.xs],
      ["overflow-wrap", "anywhere"],
    ]),
    rule(".dt-bar", [
      ["display", "block"],
      ["height", space.xs],
      ["margin-block-end", space.xxs],
      ["background", color.accent],
      ["border-radius", tokens.radius.inner],
    ]),
    rule(".dt-radius-box", [
      ["display", "block"],
      ["width", size.control],
      ["height", size.control],
      ["margin-block-end", space.xxs],
      ["background", color.accentTint],
      ["border", `2px solid ${color.accent}`],
    ]),
    rule(".dt-specimens", [
      ["display", "flex"],
      ["flex-wrap", "wrap"],
      ["align-items", "center"],
      ["gap", space.md],
      ["margin-block", space.md],
      ["padding", space.sm],
    ]),
    rule(".dt-button, .dt-field, .dt-chip, .dt-focus, .dt-surface", [
      ["display", "inline-flex"],
      ["align-items", "center"],
      ["border", "1px solid transparent"],
      ["font-family", type.family],
      ["font-size", type.body.size],
    ]),
    rule(".dt-focus", [
      ["padding", space.sm],
      ["background", color.surface],
      ["color", color.text],
      ["border-radius", tokens.radius.control],
    ]),
    rule(".dt-syn", [["font-family", type.familyMono]]),
  ];
}

/**
 * The stylesheet of the visual design page, generated from the SDK's tokens so
 * it cannot go stale. Each block carries its own `data-theme`, so the light and
 * the dark theme show side by side whatever the reader chose; the variables the
 * site's own rules read are written again under the block (`buildThemeRule`),
 * because a variable that reads another is worked out where it is declared.
 * Every colour, length and shadow is a token reference, except the syntax
 * palette, which has no custom properties and so is written per theme. The
 * page draws only `class`es, so the site's policy, which allows no style
 * attribute, holds.
 * @param source - The token values. The SDK's own at the call site.
 */
export function buildDesignTokensCss(source: ThemeSource): string {
  return [
    "/* Generated by scripts/generateTheme.ts from @mapcairn/theme. Do not edit. */\n",
    buildThemeRule(tokens, `.${THEME_CLASS}`),
    rule(`.${THEME_CLASS}`, BLOCK_PROPERTIES),
    ...roleRules(),
    ...typeRules(source),
    ...spaceRules(source),
    ...radiusRules(source),
    ...layoutRules(),
    ...[...SPECIMENS, FOCUS_SPECIMEN].map(specimenRule),
    ...syntaxRules(source),
  ].join("\n");
}
