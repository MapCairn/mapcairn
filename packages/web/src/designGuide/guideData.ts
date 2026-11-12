// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  compositeOver,
  contrastRatio,
  parseColour,
  type Rgba,
  toHex,
  tokenValues,
} from "@mapcairn/theme";

type ColourRoles = tokenValues.ColourRoles;
type ColourRole = keyof ColourRoles;

const { themeValues, representativeBackdrops, colourRoleNames } = tokenValues;

/** WCAG 2.2 AA minimums: 1.4.3 for text, 1.4.11 for icons, edges and focus. */
const AA_MINIMUM = { text: 4.5, "non-text": 3 } as const;

/** What a contrast pair carries, which sets its AA minimum. */
export type PairKind = keyof typeof AA_MINIMUM;

/** One foreground and background pairing the app relies on. */
export interface ContrastPair {
  /** Stable id, used for test ids and to link a colour role to its pair. */
  readonly id: string;
  /** How the pair reads on the page, for example "Muted text on surface". */
  readonly label: string;
  readonly foreground: ColourRole;
  /**
   * The role underneath, or `basemaps` for a map overlay drawn straight on
   * the map, which is measured over every representative basemap.
   */
  readonly background: ColourRole | "basemaps";
  readonly kind: PairKind;
  /** The AA minimum ratio for {@link kind}. */
  readonly minimum: number;
}

/** Builds a pair with the minimum that matches its kind. */
function pair(
  id: string,
  label: string,
  foreground: ColourRole,
  background: ColourRole | "basemaps",
  kind: PairKind,
): ContrastPair {
  return { id, label, foreground, background, kind, minimum: AA_MINIMUM[kind] };
}

/**
 * The pairs `packages/theme/src/contrast.test.ts` enforces for the default
 * colour set, so the guide shows exactly what the tokens promise. Hairlines,
 * the scrim, the chrome border and the translucent map fills are exempt
 * there and are left out here.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  pair("text-surface", "Text on surface", "text", "surface", "text"),
  pair("text-page", "Text on a full page", "text", "pageBackground", "text"),
  pair(
    "muted-surface",
    "Muted text on surface",
    "textMuted",
    "surface",
    "text",
  ),
  pair("accent-surface", "Accent text on surface", "accent", "surface", "text"),
  pair("danger-surface", "Danger text on surface", "danger", "surface", "text"),
  pair(
    "text-raised",
    "Text on raised surface",
    "text",
    "surfaceRaised",
    "text",
  ),
  pair(
    "muted-raised",
    "Muted text on raised surface",
    "textMuted",
    "surfaceRaised",
    "text",
  ),
  pair(
    "on-accent",
    "Text on an accent fill",
    "accentContrast",
    "accent",
    "text",
  ),
  pair("text-accent-tint", "Text on accent tint", "text", "accentTint", "text"),
  pair(
    "accent-accent-tint",
    "Accent text on accent tint",
    "accent",
    "accentTint",
    "text",
  ),
  pair("text-danger-tint", "Text on danger tint", "text", "dangerTint", "text"),
  pair(
    "danger-danger-tint",
    "Danger text on danger tint",
    "danger",
    "dangerTint",
    "text",
  ),
  pair(
    "boundary-surface",
    "Control edge on surface",
    "controlBoundary",
    "surface",
    "non-text",
  ),
  pair(
    "ring-surface",
    "Focus ring on surface",
    "focusRing",
    "surface",
    "non-text",
  ),
  pair(
    "ring-inner",
    "Focus ring against its inner tone",
    "focusRingInner",
    "focusRing",
    "non-text",
  ),
  pair("pin-basemap", "Pin on any basemap", "mapPin", "basemaps", "non-text"),
  pair(
    "accuracy-basemap",
    "Accuracy outline on any basemap",
    "mapAccuracy",
    "basemaps",
    "non-text",
  ),
  pair("pin-halo", "Pin against its halo", "mapPin", "mapHalo", "non-text"),
  pair(
    "line-halo",
    "Measure line against its halo",
    "mapMeasureLine",
    "mapHalo",
    "non-text",
  ),
];

/** Why a colour role has no contrast pair of its own. */
export interface ExemptRole {
  readonly exempt: string;
}

/**
 * The pair each colour role is judged by, or the reason it has none. A
 * `Record` over every role, so a new role fails typecheck until it is placed.
 */
export const ROLE_PAIRS: Readonly<Record<ColourRole, string | ExemptRole>> = {
  surface: "text-surface",
  surfaceRaised: "text-raised",
  text: "text-surface",
  textMuted: "muted-surface",
  accent: "accent-surface",
  accentTint: "text-accent-tint",
  accentContrast: "on-accent",
  hairline: { exempt: "Decorative divider (WCAG 1.4.11 exempt)" },
  controlBoundary: "boundary-surface",
  chromeBorder: { exempt: "Transparent until forced colours paint it" },
  danger: "danger-surface",
  dangerTint: "danger-danger-tint",
  scrim: { exempt: "Veil behind a modal, carries no content" },
  focusRing: "ring-surface",
  focusRingInner: "ring-inner",
  pageBackground: "text-page",
  mapBackground: { exempt: "Backdrop before tiles load, carries no content" },
  mapGlobeSpace: { exempt: "Space around the globe, carries no content" },
  mapPin: "pin-basemap",
  mapMeasureLine: "line-halo",
  mapMeasureFill: { exempt: "Translucent fill, its outline carries 3:1" },
  mapAccuracy: "accuracy-basemap",
  mapAccuracyFill: { exempt: "Translucent fill, its outline carries 3:1" },
  mapHalo: "pin-halo",
};

/**
 * The opaque colours a pair's background becomes. A translucent surface takes
 * on whatever map is under it, so it is flattened over pure white and pure
 * black, the two extremes; a map overlay is placed on every representative
 * basemap.
 */
function backgroundsFor(pairing: ContrastPair, roles: ColourRoles): Rgba[] {
  if (pairing.background === "basemaps") {
    return Object.values(representativeBackdrops).map((backdrop) =>
      parseColour(backdrop),
    );
  }
  const role = roles[pairing.background];
  return [representativeBackdrops.white, representativeBackdrops.black].map(
    (backdrop) => compositeOver(role, backdrop),
  );
}

/** The worst-case contrast ratio of a pair in one set of colour roles. */
export function measurePair(pairing: ContrastPair, roles: ColourRoles): number {
  return Math.min(
    ...backgroundsFor(pairing, roles).map((under) =>
      contrastRatio(compositeOver(roles[pairing.foreground], under), under),
    ),
  );
}

/**
 * A ratio as `4.56:1`, rounded down so a ratio just under the minimum never
 * displays as if it met it.
 */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2)}:1`;
}

/** One theme's result for a pair. */
export interface PairResult {
  readonly ratio: number;
  readonly passes: boolean;
}

/** A pair with its result in both themes. */
export interface ContrastRow extends ContrastPair {
  readonly light: PairResult;
  readonly dark: PairResult;
}

/** Measures a pair in one theme's default colours. */
function resultIn(
  pairing: ContrastPair,
  theme: tokenValues.ThemeName,
): PairResult {
  const ratio = measurePair(pairing, themeValues[theme].colour);
  return { ratio, passes: ratio >= pairing.minimum };
}

/** Every pair in {@link CONTRAST_PAIRS}, measured in light and dark. */
export function contrastRows(): ContrastRow[] {
  return CONTRAST_PAIRS.map((pairing) => ({
    ...pairing,
    light: resultIn(pairing, "light"),
    dark: resultIn(pairing, "dark"),
  }));
}

/** A colour role as the swatch grid shows it. */
export interface ColourRoleRow {
  readonly role: ColourRole;
  readonly lightHex: string;
  readonly darkHex: string;
  /** The pair the role is judged by, measured, or undefined when it is exempt. */
  readonly pair?: ContrastRow;
  /** Why the role has no pair, when it has none. */
  readonly exempt?: string;
}

/** Every colour role, in token order, with hex values and its contrast pair. */
export function colourRoleRows(): ColourRoleRow[] {
  const rows = contrastRows();
  return colourRoleNames.map((role) => {
    const entry = ROLE_PAIRS[role];
    const base = {
      role,
      lightHex: toHex(parseColour(themeValues.light.colour[role])),
      darkHex: toHex(parseColour(themeValues.dark.colour[role])),
    };
    if (typeof entry === "string") {
      return { ...base, pair: rows.find((row) => row.id === entry) };
    }
    return { ...base, exempt: entry.exempt };
  });
}
