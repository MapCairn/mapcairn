// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ContrastFinding,
  checkThemeContrast,
  type InvalidColour,
  invalidReason,
  type ThemeColours,
} from "./checkThemeContrast";
import {
  contrastRatio,
  maxSrgbChroma,
  parseColour,
  toHex,
  toOklch,
} from "./contrast";
import { type ThemeName, themeValues } from "./tokenValues";

/** The roles one accent colour drives. */
export type AccentRole =
  | "accent"
  | "accentTint"
  | "accentContrast"
  | "focusRing";

/**
 * How a role got its value: `given` is the accent as the host wrote it,
 * `moved` is the accent after its lightness changed to reach WCAG 2.2 AA, and
 * `derived` is a role worked out from the accent.
 */
export type DerivedSource = "given" | "moved" | "derived";

/** One role the resolver chose in one theme, and the value it uses. */
export interface DerivedRole {
  /** The theme the value is for. */
  theme: ThemeName;
  /** The role. */
  role: AccentRole;
  /** The colour used, as `#rrggbb`. */
  value: string;
  /** How the value was reached. */
  source: DerivedSource;
}

/** A colour that cannot reach WCAG 2.2 AA, and the nearest one that can. */
export interface AccentFailure {
  /** The theme it fails in. */
  theme: ThemeName;
  /** The role that fails. */
  role: AccentRole;
  /** The colour as the host gave it. */
  value: string;
  /** The nearest colour in lightness that passes, or `undefined` when none does. */
  nearest: string | undefined;
  /** A sentence that says what failed and the nearest passing colour. */
  message: string;
}

/** The result of {@link resolveAccent}. */
export type AccentResolution =
  | {
      /** True: every theme has an accent that holds. */
      ok: true;
      /** The roles to write for each theme. A role the host set is not in it. */
      colour: Record<ThemeName, Partial<ThemeColours>>;
      /** Each role in `colour`, with how it was reached. */
      derived: DerivedRole[];
    }
  | {
      /** False: nothing is resolved. */
      ok: false;
      /** The accent when it cannot be read: not a string, unparseable, out of gamut or translucent. */
      invalid: InvalidColour[];
      /** The roles that cannot reach WCAG 2.2 AA, with the nearest colour that does. */
      failures: AccentFailure[];
    };

const themeNames: readonly ThemeName[] = ["light", "dark"];
const ROLES: readonly AccentRole[] = [
  "accent",
  "accentTint",
  "accentContrast",
  "focusRing",
];

/** Lightness is searched in steps this small, so the colour found is the nearest to a thousandth. */
const LIGHTNESS_STEP = 0.001;

/** Which way a search tries first when both directions are as near: away from the page background. */
const PREFERRED_DIRECTION: Record<ThemeName, 1 | -1> = { light: -1, dark: 1 };

/** The colour at this OKLCH position, with chroma cut to the sRGB gamut. */
function hexAt(lightness: number, chroma: number, hue: number): string {
  const l = Math.min(1, Math.max(0, lightness));
  const c = Math.min(chroma, maxSrgbChroma(l, hue));
  return toHex(parseColour(`oklch(${l} ${c} ${hue})`));
}

/** White or near black, whichever reads better on the accent. */
function onAccent(accent: string): string {
  return [
    themeValues.light.colour.accentContrast,
    themeValues.dark.colour.accentContrast,
  ]
    .map((colour) => toHex(parseColour(colour)))
    .reduce((best, colour) =>
      contrastRatio(colour, accent) > contrastRatio(best, accent)
        ? colour
        : best,
    );
}

/**
 * The roles an accent drives in one theme. The tint keeps the SDK's own
 * lightness and chroma, in the accent's hue, and the focus ring is the accent.
 */
function deriveRoles(
  theme: ThemeName,
  accent: string,
): Record<AccentRole, string> {
  const { chroma, hue } = toOklch(parseColour(accent));
  const tint = toOklch(parseColour(themeValues[theme].colour.accentTint));
  return {
    accent,
    accentTint: hexAt(tint.lightness, Math.min(tint.chroma, chroma), hue),
    accentContrast: onAccent(accent),
    focusRing: accent,
  };
}

/** The pairs that fail in one theme and involve one of `roles`. */
function failing(
  theme: ThemeName,
  set: Partial<ThemeColours>,
  roles: readonly string[],
): ContrastFinding[] {
  return checkThemeContrast({ colour: { [theme]: set } }).findings.filter(
    (finding) =>
      finding.theme === theme &&
      !finding.passes &&
      (roles.includes(finding.foreground) ||
        roles.includes(finding.background)),
  );
}

/**
 * The colour nearest in lightness to `start` that `holds`, trying `start`
 * itself first. Hue stays and chroma is cut to the sRGB gamut.
 */
function nearestHolding(
  start: string,
  theme: ThemeName,
  holds: (colour: string) => boolean,
): string | undefined {
  if (holds(start)) {
    return start;
  }
  const { lightness, chroma, hue } = toOklch(parseColour(start));
  const first = PREFERRED_DIRECTION[theme];
  const tried = new Set([start]);
  for (let step = 1; step * LIGHTNESS_STEP <= 1; step += 1) {
    for (const direction of [first, -first]) {
      const colour = hexAt(
        lightness + direction * step * LIGHTNESS_STEP,
        chroma,
        hue,
      );
      if (!tried.has(colour)) {
        tried.add(colour);
        if (holds(colour)) {
          return colour;
        }
      }
    }
  }
  return undefined;
}

function failure(
  theme: ThemeName,
  role: AccentRole,
  value: string,
  nearest: string | undefined,
): AccentFailure {
  const message =
    nearest === undefined
      ? `No lightness of ${value} reaches WCAG 2.2 AA for the ${role} in the ${theme} theme.`
      : `The ${role} ${value} in the ${theme} theme is below WCAG 2.2 AA. The nearest colour that passes is ${nearest}.`;
  return { theme, role, value, nearest, message };
}

/** What the resolver found for one theme. */
interface ThemeResolution {
  roles: Partial<Record<AccentRole, string>>;
  source: DerivedSource;
  failures: AccentFailure[];
}

/**
 * Settles one theme. `fixed` holds the roles the host set, which are never
 * moved: the accent is searched only when the host left it out.
 */
function resolveTheme(
  theme: ThemeName,
  given: string,
  fixed: Partial<ThemeColours>,
): ThemeResolution {
  const start = fixed.accent ?? given;
  const setFor = (accent: string): Partial<ThemeColours> => ({
    ...deriveRoles(theme, accent),
    ...fixed,
    accent,
  });
  const settled = nearestHolding(
    start,
    theme,
    (colour) => failing(theme, setFor(colour), ROLES).length === 0,
  );
  if (
    settled !== undefined &&
    (fixed.accent === undefined || settled === start)
  ) {
    return {
      roles: deriveRoles(theme, settled),
      source: settled === given ? "given" : "moved",
      failures: [],
    };
  }
  return {
    roles: {},
    source: "derived",
    failures: explainFailure(theme, start, fixed),
  };
}

/**
 * The order roles the host set are blamed in. A pair that fails between two of
 * them is put right on the role that depends on the accent, so the brand
 * colour is only blamed when the rest cannot fix it.
 */
const BLAME_ORDER: readonly AccentRole[] = [
  "accentContrast",
  "accentTint",
  "focusRing",
  "accent",
];

/**
 * Names what fails in a theme that cannot be settled: each role the host set
 * that fails, with the nearest colour that fixes it given the roles already
 * put right, else the accent as given.
 */
function explainFailure(
  theme: ThemeName,
  start: string,
  fixed: Partial<ThemeColours>,
): AccentFailure[] {
  const found: AccentFailure[] = [];
  const now = { ...fixed };
  for (const role of BLAME_ORDER) {
    const value = fixed[role];
    if (value === undefined) {
      continue;
    }
    const set = (colour: string): Partial<ThemeColours> => ({
      ...deriveRoles(theme, role === "accent" ? colour : (now.accent ?? start)),
      ...now,
      [role]: colour,
    });
    const holds = (colour: string): boolean =>
      failing(theme, set(colour), [role]).length === 0;
    if (holds(value)) {
      continue;
    }
    const nearest = nearestHolding(value, theme, holds);
    found.push(failure(theme, role, value, nearest));
    if (nearest !== undefined) {
      now[role] = nearest;
    }
  }
  return found.length > 0
    ? found
    : [failure(theme, "accent", start, undefined)];
}

/**
 * Resolves one accent colour into the roles it drives, in both themes, and
 * checks each against WCAG 2.2 AA with {@link checkThemeContrast}.
 *
 * The accent is used as given in a theme where it passes with its derived
 * roles: the tint (the SDK's own lightness and chroma, in the accent's hue),
 * the text on the accent (white or near black, whichever reads better) and the
 * focus ring (the accent). Where it does not pass, its lightness moves to the
 * nearest value that does, with the hue kept and the chroma cut to the sRGB
 * gamut, and `derived` says so. A role the host set in `explicit` is never
 * moved and is not in the result: it is checked, and a failure is refused with
 * the nearest passing colour named. When no lightness passes, the failure has
 * no `nearest`.
 *
 * Pure and total: the same input gives the same result, and it never throws.
 * Only the pairs that involve the four roles are judged here; the caller
 * checks the whole theme.
 *
 * @param accent - The brand colour: hex, `rgb()` or `oklch()`, opaque and inside sRGB.
 * @param explicit - The roles the host set for each theme, as valid opaque colours.
 * @returns The roles to use and how each was reached, or why it was refused.
 */
export function resolveAccent(
  accent: unknown,
  explicit: Record<ThemeName, Partial<ThemeColours>>,
): AccentResolution {
  const reason = invalidReason("accent", accent);
  if (reason !== null) {
    return {
      ok: false,
      invalid: [{ theme: null, role: "accent", value: accent, reason }],
      failures: [],
    };
  }
  const given = toHex(parseColour(accent as string));
  const colour: Record<ThemeName, Partial<ThemeColours>> = {
    light: {},
    dark: {},
  };
  const derived: DerivedRole[] = [];
  const failures: AccentFailure[] = [];
  for (const theme of themeNames) {
    const fixed = explicit[theme];
    const result = resolveTheme(theme, given, fixed);
    failures.push(...result.failures);
    for (const role of ROLES) {
      const value = result.roles[role];
      if (value !== undefined && fixed[role] === undefined) {
        colour[theme][role] = value;
        derived.push({
          theme,
          role,
          value,
          source: role === "accent" ? result.source : "derived",
        });
      }
    }
  }
  return failures.length > 0
    ? { ok: false, invalid: [], failures }
    : { ok: true, colour, derived };
}
