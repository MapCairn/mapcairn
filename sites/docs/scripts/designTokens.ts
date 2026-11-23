// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  compositeOver,
  contrastRatio,
  focusRing,
  type Rgba,
  tokens,
  type tokenValues,
} from "@mapcairn/theme";

/** A theme the site shows. */
export type Theme = keyof typeof tokenValues.themeValues;

/** The names of the colour roles. */
export type ColourRole =
  keyof (typeof tokenValues.themeValues)["light"]["colour"];

/** WCAG 2.2 AA contrast for text. */
export const TEXT_RATIO = 4.5;

/** WCAG 2.2 AA contrast for icons, control edges and the focus ring. */
export const NON_TEXT_RATIO = 3;

/** What a pair's foreground is: text, or a mark such as an edge or a ring. */
export type PairUse = "Text" | "Non-text";

/** One foreground-and-background pair the interface relies on. */
export interface PairSpec {
  readonly label: string;
  readonly foreground: ColourRole;
  readonly background: ColourRole;
  readonly use: PairUse;
}

/**
 * The pairs shown, a subset of what the SDK's own contrast tests hold: the
 * text, the accent and the marks that the interface draws on its surfaces and
 * on the page. The role names match the keys of the colour tokens.
 */
export const PAIRS: readonly PairSpec[] = [
  {
    label: "Text on surface",
    foreground: "text",
    background: "surface",
    use: "Text",
  },
  {
    label: "Muted text on surface",
    foreground: "textMuted",
    background: "surface",
    use: "Text",
  },
  {
    label: "Accent on surface",
    foreground: "accent",
    background: "surface",
    use: "Text",
  },
  {
    label: "Error text on surface",
    foreground: "danger",
    background: "surface",
    use: "Text",
  },
  {
    label: "Text on selected tint",
    foreground: "text",
    background: "accentTint",
    use: "Text",
  },
  {
    label: "Error text on error tint",
    foreground: "danger",
    background: "dangerTint",
    use: "Text",
  },
  {
    label: "Text on accent",
    foreground: "accentContrast",
    background: "accent",
    use: "Text",
  },
  {
    label: "Text on page",
    foreground: "text",
    background: "pageBackground",
    use: "Text",
  },
  {
    label: "Muted text on page",
    foreground: "textMuted",
    background: "pageBackground",
    use: "Text",
  },
  {
    label: "Control edge on surface",
    foreground: "controlBoundary",
    background: "surface",
    use: "Non-text",
  },
  {
    label: "Focus ring on surface",
    foreground: "focusRing",
    background: "surface",
    use: "Non-text",
  },
];

/** A pair with the contrast it measures in one theme. */
export interface PairRow extends PairSpec {
  /** The contrast ratio, such as 12.34. */
  readonly ratio: number;
}

/** The token values, as `tokenValues` holds them, so a test can pass a changed copy. */
export type ThemeSource = typeof tokenValues;

/**
 * The colour a role shows as when it sits on the theme's page background: a
 * translucent surface is flattened over the page behind it, as it is on the
 * page the reader sees.
 */
function flattened(source: ThemeSource, theme: Theme, role: ColourRole): Rgba {
  const colours = source.themeValues[theme].colour;
  return compositeOver(colours[role], colours.pageBackground);
}

/**
 * The contrast of each pair in {@link PAIRS} in one theme, measured with the
 * SDK's own contrast maths on the default colour set.
 * @param source - The token values. The SDK's own at the call site.
 * @param theme - The theme to measure.
 */
export function contrastRows(source: ThemeSource, theme: Theme): PairRow[] {
  return PAIRS.map((pair) => {
    const background = flattened(source, theme, pair.background);
    const foreground = compositeOver(
      source.themeValues[theme].colour[pair.foreground],
      background,
    );
    return { ...pair, ratio: contrastRatio(foreground, background) };
  });
}

/** One syntax role with the contrast it measures on the code background. */
export interface SyntaxRow {
  readonly role: string;
  readonly value: string;
  readonly ratio: number;
}

/**
 * The contrast of each syntax role on the code block's background, which is
 * the raised surface over the page background.
 * @param source - The token values. The SDK's own at the call site.
 * @param theme - The theme to measure.
 */
export function syntaxRows(source: ThemeSource, theme: Theme): SyntaxRow[] {
  const background = flattened(source, theme, "surfaceRaised");
  return Object.entries(source.syntaxPalette[theme]).map(([role, value]) => ({
    role,
    value,
    ratio: contrastRatio(compositeOver(value, background), background),
  }));
}

/**
 * The ratio as text, cut to two decimals so a figure never rounds up past a
 * limit it does not reach. The hundredths are read from a value rounded to
 * eight decimals first, so a product such as `1.15 * 100`, which is
 * 114.99999999999999, does not lose a hundredth.
 */
export function ratioText(ratio: number): string {
  const HUNDRED = 100;
  const NOISE_DIGITS = 6;
  const hundredths = Math.floor(
    Number((ratio * HUNDRED).toFixed(NOISE_DIGITS)),
  );
  return `${(hundredths / HUNDRED).toFixed(2)}:1`;
}

/** `Pass` or `Fail` for a ratio against a limit, a word so the result never rests on colour. */
export function verdict(ratio: number, limit: number): "Pass" | "Fail" {
  return ratio >= limit ? "Pass" : "Fail";
}

/** One declaration of a specimen: the CSS property, the token it reads and the reference the CSS carries. */
export interface SpecimenUse {
  readonly property: string;
  /** The token as a script writes it, such as `color.accent`. */
  readonly token: string;
  /** The custom property reference the stylesheet writes, such as `var(--color-accent__1x)`. */
  readonly value: string;
}

/** A component drawn as plain markup with the token declarations that style it. */
export interface Specimen {
  readonly name: string;
  /** The class of its one element. */
  readonly className: string;
  /** The words shown inside it. */
  readonly text: string;
  readonly uses: readonly SpecimenUse[];
}

/** The reference a token path such as `color.accent` stands for in the stylesheet. */
function reference(path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown>)[key],
      tokens,
    );
  if (typeof value !== "string") {
    throw new Error(`"${path}" is not a token.`);
  }
  return value;
}

function use(property: string, token: string): SpecimenUse {
  return { property, token, value: reference(token) };
}

/**
 * The specimens: each is one element whose declarations are all token
 * references, listed on the page as the text alternative, so the list and the
 * stylesheet are written from the same data and cannot differ.
 */
export const SPECIMENS: readonly Specimen[] = [
  // A base class comes before the class that refines it: the stylesheet is
  // written in this order, and the later rule wins.
  {
    name: "Secondary button",
    className: "dt-button",
    text: "Share",
    uses: [
      use("background", "color.surfaceRaised"),
      use("color", "color.text"),
      use("border-color", "color.controlBoundary"),
      use("border-radius", "radius.control"),
      use("min-height", "size.control"),
      use("padding-inline", "space.md"),
      use("font-weight", "type.weight.semibold"),
    ],
  },
  {
    name: "Primary button",
    className: "dt-button dt-button--primary",
    text: "Directions",
    uses: [
      use("background", "color.accent"),
      use("color", "color.accentContrast"),
      use("border-color", "color.accent"),
      use("border-radius", "radius.control"),
      use("min-height", "size.control"),
      use("padding-inline", "space.md"),
      use("font-weight", "type.weight.semibold"),
    ],
  },
  {
    name: "Text field",
    className: "dt-field",
    text: "Search for a place",
    uses: [
      use("background", "color.surfaceRaised"),
      use("color", "color.textMuted"),
      use("border-color", "color.controlBoundary"),
      use("border-radius", "radius.control"),
      use("min-height", "size.control"),
      use("padding-inline", "space.md"),
    ],
  },
  {
    name: "Chip",
    className: "dt-chip",
    text: "Selected",
    uses: [
      use("background", "color.accentTint"),
      use("color", "color.text"),
      use("border-color", "color.accent"),
      use("border-radius", "radius.pill"),
      use("padding-inline", "space.sm"),
      use("padding-block", "space.xxs"),
    ],
  },
  {
    name: "Surface",
    className: "dt-surface",
    text: "Surface",
    uses: [
      use("background", "color.surface"),
      use("color", "color.text"),
      use("box-shadow", "shadow.floating"),
      use("border-radius", "radius.sheet"),
      use("padding", "space.md"),
    ],
  },
  {
    name: "Raised surface",
    className: "dt-surface dt-surface--raised",
    text: "Raised surface",
    uses: [
      use("background", "color.surfaceRaised"),
      use("color", "color.text"),
      use("box-shadow", "shadow.floating"),
      use("border-radius", "radius.sheet"),
      use("padding", "space.md"),
    ],
  },
];

/**
 * The focus ring is a token group of its own (`focusRing`), a two-tone ring of
 * an inner and an outer line, so its specimen takes the group's three declarations.
 */
export const FOCUS_SPECIMEN: Specimen = {
  name: "Focus ring",
  className: "dt-focus",
  text: "Focused",
  uses: [
    {
      property: "outline",
      token: "focusRing.outline",
      value: focusRing.outline,
    },
    {
      property: "outline-offset",
      token: "focusRing.outlineOffset",
      value: focusRing.outlineOffset,
    },
    {
      property: "box-shadow",
      token: "focusRing.boxShadow",
      value: focusRing.boxShadow,
    },
  ],
};

/** `surfaceRaised` becomes `surface-raised`, the form the class names use. */
export function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
