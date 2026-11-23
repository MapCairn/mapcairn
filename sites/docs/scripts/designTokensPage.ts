// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokenValues } from "@mapcairn/theme";
import {
  contrastRows,
  FOCUS_SPECIMEN,
  kebab,
  NON_TEXT_RATIO,
  ratioText,
  SPECIMENS,
  type Specimen,
  syntaxRows,
  TEXT_RATIO,
  type Theme,
  type ThemeSource,
  verdict,
} from "./designTokens";
import { THEME_CLASS } from "./designTokensCss";

/** Where the page is served, under the site's base path. */
export const DESIGN_TOKENS_SLUG = "/design/visual-tokens";

/** The page's one-line description, which search, the Markdown copy and `llms.txt` carry. */
export const DESIGN_TOKENS_DESCRIPTION =
  "The colour roles, type scale, spacing, radii and component specimens of the design system, drawn in the light and the dark theme from the SDK's own token values, with the contrast of each pair.";

const THEMES: readonly Theme[] = ["light", "dark"];

/** `light` becomes `Light`. */
function capitalised(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/** A decorative element: aria-hidden, so the table beside it is what a screen reader reads, and one element on one line, which the Markdown copy leaves out. */
function drawn(tag: "div" | "span", classes: string, text = ""): string {
  return `<${tag} className="${classes}" aria-hidden="true">${text}</${tag}>`;
}

/** A themed block: the theme is chosen by its own `data-theme`, so both show whatever the reader chose. */
function themeBlock(theme: Theme, body: readonly string[]): string {
  return [
    `<section className="${THEME_CLASS}" data-theme="${theme}">`,
    "",
    ...body.flatMap((part) => [part, ""]),
    "</section>",
  ].join("\n");
}

function table(header: readonly string[], rows: readonly string[][]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

/** The pairs drawn as they are used, then measured. */
function pairSection(source: ThemeSource, theme: Theme): string {
  const rows = contrastRows(source, theme);
  const samples = rows.map((row) =>
    drawn(
      "div",
      `dt-sample dt-fg-${kebab(row.foreground)} dt-bg-${kebab(row.background)}`,
      row.label,
    ),
  );
  const name = capitalised(theme);
  return themeBlock(theme, [
    `### ${name} theme colours`,
    `Each sample below is the pair as the interface draws it. The table gives its measured contrast ratio and whether it meets the ${TEXT_RATIO}:1 limit for text and the ${NON_TEXT_RATIO}:1 limit for icons, control edges and the focus ring. Surfaces are flattened over the theme's page background, as they are on this page.`,
    [
      '<div className="dt-samples">',
      "",
      ...samples.flatMap((s) => [s, ""]),
      "</div>",
    ].join("\n"),
    `#### Contrast of the pairs, ${theme} theme`,
    table(
      ["Pair", "Used as", "Ratio", `${TEXT_RATIO}:1`, `${NON_TEXT_RATIO}:1`],
      rows.map((row) => [
        row.label,
        row.use,
        ratioText(row.ratio),
        verdict(row.ratio, TEXT_RATIO),
        verdict(row.ratio, NON_TEXT_RATIO),
      ]),
    ),
    `#### Every colour role, ${theme} theme`,
    table(
      ["Role", "Value"],
      Object.entries(source.themeValues[theme].colour).map(([role, value]) => [
        `${drawn("span", `dt-swatch dt-bg-${kebab(role)}`)} \`${role}\``,
        `\`${value}\``,
      ]),
    ),
  ]);
}

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";

function typeSection(source: ThemeSource): string {
  const steps = Object.entries(source.typeScale);
  const samples = steps.map(([step]) =>
    drawn(
      "div",
      `dt-type dt-type-${step}`,
      `${capitalised(step)}: ${SAMPLE_TEXT}`,
    ),
  );
  return [
    "## Type scale",
    "Every step is set in IBM Plex Sans, the interface's one typeface. Sizes are in `rem`, so they follow the reader's own font size, and only the weights 400 and 600 exist.",
    samples.join("\n\n"),
    table(
      ["Step", "Size", "Line height", "Tracking"],
      steps.map(([step, { size, lineHeight, tracking }]) => [
        `\`type.${step}\``,
        size,
        lineHeight,
        tracking,
      ]),
    ),
    table(
      ["Weight", "Value"],
      Object.entries(source.fontWeight).map(([name, value]) => [
        `\`type.weight.${name}\``,
        value,
      ]),
    ),
  ].join("\n\n");
}

function spaceSection(source: ThemeSource): string {
  const spaceRows = Object.entries(source.space).map(([name, value]) => [
    `${drawn("span", `dt-bar dt-space-${name}`)} \`space.${name}\``,
    value,
  ]);
  const radiusRows = Object.entries(source.radius).map(([name, value]) => [
    `${drawn("span", `dt-radius-box dt-radius-${name}`)} \`radius.${name}\``,
    value,
  ]);
  return [
    "## Spacing and radius",
    "Spacing bars are drawn at four times their size so the smallest step can be seen. Each radius is shown on the same square.",
    table(["Token", "Value"], spaceRows),
    table(["Token", "Value"], radiusRows),
  ].join("\n\n");
}

function specimenElement(specimen: Specimen): string {
  return drawn("div", specimen.className, specimen.text);
}

function specimenDeclarations(specimen: Specimen): string {
  return specimen.uses
    .map((use) => `\`${use.property}: ${use.token}\``)
    .join(", ");
}

function specimenSection(theme: Theme): string {
  const all = [...SPECIMENS, FOCUS_SPECIMEN];
  return themeBlock(theme, [
    `### Specimens, ${theme} theme`,
    "These are plain markup styled by the tokens alone, with no script, so they show the colours and shapes but do not respond.",
    [
      '<div className="dt-specimens">',
      "",
      ...all.flatMap((specimen) => [specimenElement(specimen), ""]),
      "</div>",
    ].join("\n"),
    table(
      ["Specimen", "Declarations"],
      all.map((specimen) => [specimen.name, specimenDeclarations(specimen)]),
    ),
  ]);
}

/** What each role looks like in code, in a few characters. */
const SYNTAX_SAMPLES = new Map([
  ["keyword", "const"],
  ["string", '"map"'],
  ["number", "42"],
  ["comment", "// note"],
  ["function", "render"],
  ["className", "MapView"],
  ["property", "center"],
  ["punctuation", "( ) ;"],
  ["operator", "+ ="],
]);

function syntaxSection(source: ThemeSource, theme: Theme): string {
  return themeBlock(theme, [
    `### Code colours, ${theme} theme`,
    "Code is the one place hues beyond the accent appear. The ratio is measured on the code block's background, the raised surface over the page.",
    table(
      ["Role", "Value", "Ratio", `${TEXT_RATIO}:1`],
      syntaxRows(source, theme).map(({ role, value, ratio }) => [
        `${drawn("span", `dt-syn dt-syn-${kebab(role)}`, SYNTAX_SAMPLES.get(role) ?? "Aa")} \`${role}\``,
        `\`${value}\``,
        ratioText(ratio),
        verdict(ratio, TEXT_RATIO),
      ]),
    ),
  ]);
}

/**
 * The text of the visual design page: a docs page whose source is Markdown
 * with plain elements for the drawn parts, written from the SDK's token values
 * at build time. Each drawn element is decorative and sits beside a table that
 * holds the same values as text, so a screen reader, the search index and the
 * Markdown copy get the tables. The generated stylesheet
 * (`buildDesignTokensCss`) styles the elements with classes alone.
 * @param source - The token values. The SDK's own at the call site.
 */
export function buildDesignTokensPage(
  source: ThemeSource = tokenValues,
): string {
  return `${[
    "---",
    "title: Design tokens, visually",
    "sidebar_label: Tokens, visually",
    `description: ${DESIGN_TOKENS_DESCRIPTION}`,
    `slug: ${DESIGN_TOKENS_SLUG}`,
    "---",
    "",
    "# Design tokens, visually",
    "",
    "This page is the visual companion to the [Design system](generated/design.md) pages. It draws the tokens in both themes at once, whichever theme you chose for the site, and gives every value as text in a table beside the drawing.",
    "",
    "It is generated when the site is built, from the values `@mapcairn/theme` exports, so it cannot drift from the code. The contrast ratios use the same maths the SDK's tests use.",
    "",
    "## Colour",
    "",
    ...THEMES.flatMap((theme) => [pairSection(source, theme), ""]),
    typeSection(source),
    "",
    spaceSection(source),
    "",
    "## Component specimens",
    "",
    ...THEMES.flatMap((theme) => [specimenSection(theme), ""]),
    "## Code colours",
    "",
    ...THEMES.flatMap((theme) => [syntaxSection(source, theme), ""]),
  ].join("\n")}`;
}
