// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { compositeOver, contrastRatio, parseColour } from "./contrast";
import { type ColourRoles, representativeBackdrops } from "./tokenValues";

/** WCAG 2.2 AA contrast for text. */
export const AA_TEXT = 4.5;
/** WCAG 2.2 AA contrast for icons, control edges, selection and the focus ring. */
export const AA_NON_TEXT = 3;

/**
 * Name of one of the representative map backdrops: white, black, a light map
 * and the default basemap's land colour. Indexing `representativeBackdrops`
 * with it keeps the two in step at compile time.
 */
export type BackdropName = "white" | "black" | "lightMap" | "defaultBasemap";

/** What a pair's foreground is: text, or a non-text mark such as an edge or ring. */
export type PairKind = "text" | "non-text";

/**
 * The interface colour roles a host may override, and so the roles a
 * finding's foreground can name.
 */
export type ThemeColourRole =
  | "surface"
  | "surfaceRaised"
  | "text"
  | "textMuted"
  | "accent"
  | "accentTint"
  | "accentContrast"
  | "hairline"
  | "controlBoundary"
  | "danger"
  | "dangerTint"
  | "scrim"
  | "focusRing"
  | "focusRingInner";

/**
 * The colour a pair's foreground sits on. `surface` and `surfaceRaised` are
 * translucent, so they are flattened over each backdrop first; `map` is the
 * bare map itself; the page background and the map halo are fixed defaults
 * a host cannot override; the rest are opaque roles.
 */
export type ContrastBackground =
  | ThemeColourRole
  | "pageBackground"
  | "mapHalo"
  | "map";

/** One foreground-and-background pair that must reach a contrast ratio. */
export interface ContrastPair {
  foreground: ThemeColourRole;
  background: ContrastBackground;
  kind: PairKind;
  /** Minimum contrast ratio. */
  required: number;
  /**
   * The map backdrops to check over, in order. Empty when the background is
   * opaque and the backdrop does not show through.
   */
  backdrops: readonly BackdropName[];
}

/**
 * White and black bracket every map. The light map and the default basemap
 * are named as well rather than assumed to fall between them: a surface's
 * tint can make a mid-light backdrop the worst case for a colour that clears
 * both extremes.
 */
const everyBackdrop: readonly BackdropName[] = [
  "white",
  "black",
  "lightMap",
  "defaultBasemap",
];
const bareMapBackdrops: readonly BackdropName[] = ["white", "black"];

const surfaceRoles = ["surface", "surfaceRaised"] as const;

const surfacePairs: readonly ContrastPair[] = surfaceRoles.flatMap(
  (background) => [
    ...(["text", "textMuted", "accent", "danger"] as const).map(
      (foreground): ContrastPair => ({
        foreground,
        background,
        kind: "text",
        required: AA_TEXT,
        backdrops: everyBackdrop,
      }),
    ),
    ...(["controlBoundary", "focusRing"] as const).map(
      (foreground): ContrastPair => ({
        foreground,
        background,
        kind: "non-text",
        required: AA_NON_TEXT,
        backdrops: everyBackdrop,
      }),
    ),
  ],
);

const opaquePair = (
  foreground: ThemeColourRole,
  background: ContrastBackground,
  kind: PairKind,
): ContrastPair => ({
  foreground,
  background,
  kind,
  required: kind === "text" ? AA_TEXT : AA_NON_TEXT,
  backdrops: [],
});

/**
 * Every pair a theme must keep. Internal: the SDK's own token tests and
 * `checkThemeContrast` read this one list, so they cannot drift apart. Hairlines,
 * the scrim, disabled controls and the translucent map fills are exempt under
 * WCAG 1.4.3 and 1.4.11 (see the note in `contrast.test.ts`).
 */
export const contrastPairs: readonly ContrastPair[] = [
  ...surfacePairs,
  // Also the checked switch: its thumb is `accentContrast` on the `accent`
  // track and its tick is `accent` on the thumb (`Switch.css.ts`). Contrast is
  // symmetric, so this 4.5:1 pair covers both, well above the 3:1 the parts
  // of a control need (WCAG 1.4.11).
  opaquePair("accentContrast", "accent", "text"),
  opaquePair("text", "accentTint", "text"),
  opaquePair("accent", "accentTint", "text"),
  // A selected list row draws its secondary and trailing text on the tint
  // (`ListRow.css.ts`), and a switch's hover track draws the control edge on it
  // (`Switch.css.ts`).
  opaquePair("textMuted", "accentTint", "text"),
  opaquePair("controlBoundary", "accentTint", "non-text"),
  opaquePair("text", "dangerTint", "text"),
  opaquePair("danger", "dangerTint", "text"),
  {
    foreground: "focusRing",
    background: "map",
    kind: "non-text",
    required: AA_NON_TEXT,
    backdrops: bareMapBackdrops,
  },
  opaquePair("focusRingInner", "focusRing", "non-text"),
  // Full pages and text drawn straight on the map. Their backgrounds are not
  // overridable, so a host's text and accent are held to the defaults.
  opaquePair("text", "pageBackground", "text"),
  opaquePair("textMuted", "pageBackground", "text"),
  opaquePair("accent", "pageBackground", "text"),
  opaquePair("text", "mapHalo", "text"),
];

/**
 * Roles that act as a background in {@link contrastPairs} and so must be
 * opaque for the ratio to mean anything.
 */
export const opaqueRoles: ReadonlySet<keyof ColourRoles> = new Set([
  "accent",
  "accentTint",
  "dangerTint",
  "focusRing",
  "focusRingInner",
]);

/**
 * The contrast ratio of one pair over one backdrop, with a translucent
 * foreground or surface flattened first. Pass `undefined` when the pair has no
 * backdrops.
 */
export function measurePair(
  roles: ColourRoles,
  pair: ContrastPair,
  backdrop: BackdropName | undefined,
): number {
  const under = backgroundUnder(roles, pair, backdrop);
  return contrastRatio(compositeOver(roles[pair.foreground], under), under);
}

function backgroundUnder(
  roles: ColourRoles,
  pair: ContrastPair,
  backdrop: BackdropName | undefined,
) {
  if (backdrop === undefined) {
    return parseColour(roles[pair.background as keyof ColourRoles]);
  }
  if (pair.background === "map") {
    return parseColour(representativeBackdrops[backdrop]);
  }
  return compositeOver(
    roles[pair.background],
    representativeBackdrops[backdrop],
  );
}
