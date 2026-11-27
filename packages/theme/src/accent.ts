// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type InvalidColour,
  invalidReason,
  isRole,
  type ThemeColours,
} from "./colourReason";
import {
  contrastRatio,
  maxSrgbChroma,
  parseColour,
  toHex,
  toOklch,
} from "./contrast";
import {
  type ContrastBackground,
  type ContrastPair,
  contrastPairs,
  measurePair,
  type ThemeColourRole,
} from "./contrastPairs";
import { type ColourRoles, type ThemeName, themeValues } from "./tokenValues";

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

/** The first pair that fails in a theme: what is measured and what it reaches. */
export interface AccentPair {
  /** The role drawn. */
  foreground: ThemeColourRole;
  /** What it sits on. */
  background: ContrastBackground;
  /** The ratio reached, unrounded. */
  ratio: number;
  /** The WCAG 2.2 AA minimum for this pair. */
  required: number;
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
  /** The first pair that fails, or `undefined` when none could be found. */
  pair: AccentPair | undefined;
  /** A sentence that says what failed and the nearest passing colour. */
  message: string;
}

/** The result of {@link resolveAccent}. */
export type AccentResolution =
  | {
      /** True: every theme asked for has an accent that holds. */
      ok: true;
      /** The roles to write for each theme asked for. A role the host set is not in it. */
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

/** The pairs that involve one of the four roles: the only ones the accent can change. */
const GROUP_PAIRS: readonly ContrastPair[] = contrastPairs.filter((pair) =>
  touches(pair, ROLES),
);

/** The SDK's own roles in each theme, parsed once, so a search does not parse `oklch()` again. */
const DEFAULT_ROLES: Record<ThemeName, ColourRoles> = {
  light: exactRoles(themeValues.light.colour),
  dark: exactRoles(themeValues.dark.colour),
};

/** Each role as `rgb()` with its channels unrounded, so a search measures what the check does. */
function exactRoles(roles: ColourRoles): ColourRoles {
  return Object.fromEntries(
    Object.entries(roles).map(([role, colour]) => {
      const { r, g, b, a } = parseColour(colour);
      return [role, `rgb(${r} ${g} ${b} / ${a})`];
    }),
  ) as unknown as ColourRoles;
}

function touches(pair: ContrastPair, roles: readonly string[]): boolean {
  return roles.includes(pair.foreground) || roles.includes(pair.background);
}

/**
 * The colour at this OKLCH position, with chroma cut to the sRGB gamut.
 * Exported for tests only: it is not part of the package's public surface.
 */
export function hexAt(lightness: number, chroma: number, hue: number): string {
  const l = Math.min(1, Math.max(0, lightness));
  const c = Math.min(chroma, maxSrgbChroma(l, hue));
  return toHex(parseColour(`oklch(${l} ${c} ${hue})`));
}

/** White or near black, whichever reads better on the accent. */
function onAccent(accent: string): string {
  const best = [
    DEFAULT_ROLES.light.accentContrast,
    DEFAULT_ROLES.dark.accentContrast,
  ].reduce((chosen, colour) =>
    contrastRatio(colour, accent) > contrastRatio(chosen, accent)
      ? colour
      : chosen,
  );
  return toHex(parseColour(best));
}

/**
 * The roles an accent drives in one theme, unmoved. The tint keeps the SDK's
 * own lightness and chroma, in the accent's hue, and the focus ring is the
 * accent.
 */
function deriveRoles(
  theme: ThemeName,
  accent: string,
): Record<AccentRole, string> {
  const { chroma, hue } = toOklch(parseColour(accent));
  const tint = toOklch(parseColour(DEFAULT_ROLES[theme].accentTint));
  return {
    accent,
    accentTint: hexAt(tint.lightness, Math.min(tint.chroma, chroma), hue),
    accentContrast: onAccent(accent),
    focusRing: accent,
  };
}

/**
 * The pairs that fail in one theme, one at a time, among those that involve
 * one of `only` (the four roles when it is left out). It measures this theme
 * alone, with `set` over the SDK's own roles.
 */
function* failedPairs(
  theme: ThemeName,
  set: Partial<ThemeColours>,
  only: readonly string[] = ROLES,
): Generator<AccentPair> {
  const roles = { ...DEFAULT_ROLES[theme], ...set } as ColourRoles;
  for (const pair of GROUP_PAIRS) {
    if (!touches(pair, only)) {
      continue;
    }
    for (const backdrop of pair.backdrops.length === 0
      ? [undefined]
      : pair.backdrops) {
      const ratio = measurePair(roles, pair, backdrop);
      if (ratio < pair.required) {
        yield {
          foreground: pair.foreground,
          background: pair.background,
          ratio,
          required: pair.required,
        };
      }
    }
  }
}

function holds(
  theme: ThemeName,
  set: Partial<ThemeColours>,
  only?: readonly string[],
): boolean {
  return failedPairs(theme, set, only).next().done === true;
}

/**
 * The colour nearest in lightness to `start` that `holds`, trying `start`
 * itself first. Hue stays and chroma is cut to the sRGB gamut. A linear scan,
 * on purpose: what passes is not a single band, because the text on the accent
 * switches between white and near black.
 * Exported for tests only: it is not part of the package's public surface.
 */
export function nearestHolding(
  start: string,
  theme: ThemeName,
  accepts: (colour: string) => boolean,
): string | undefined {
  if (accepts(start)) {
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
        if (accepts(colour)) {
          return colour;
        }
      }
    }
  }
  return undefined;
}

function describePair(pair: AccentPair): string {
  return `${pair.foreground} on ${pair.background} reaches ${pair.ratio.toFixed(2)}:1 where ${pair.required}:1 is needed`;
}

function failure(
  theme: ThemeName,
  role: AccentRole,
  value: string,
  nearest: string | undefined,
  pair: AccentPair | undefined,
): AccentFailure {
  const message =
    nearest === undefined
      ? `No lightness of ${value} reaches WCAG 2.2 AA for the ${role} in the ${theme} theme${pair === undefined ? "" : `: ${describePair(pair)}`}.`
      : `The ${role} ${value} in the ${theme} theme is below WCAG 2.2 AA. The nearest colour that passes is ${nearest}.`;
  return { theme, role, value, nearest, pair, message };
}

/** What the resolver found for one theme. */
interface ThemeResolution {
  roles: Partial<Record<AccentRole, string>>;
  source: DerivedSource;
  failures: AccentFailure[];
}

/**
 * Settles one theme. `fixed` holds the roles the host set, which are never
 * moved: the accent is searched only when the host left it out. When it is
 * set, it drives the theme's derivation and is only checked.
 */
function resolveAccentTheme(
  theme: ThemeName,
  given: string,
  fixed: Partial<ThemeColours>,
): ThemeResolution {
  const start = fixed.accent ?? given;
  const settled = nearestHolding(start, theme, (colour) =>
    holds(theme, { ...deriveRoles(theme, colour), ...fixed, accent: colour }),
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
 * put right. When none of those fails, the pair that does: a derived role
 * against a colour the host set outside the four, which no lightness of the
 * accent fixes.
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
    const accepts = (colour: string): boolean =>
      holds(theme, set(colour), [role]);
    if (accepts(value)) {
      continue;
    }
    const nearest = nearestHolding(value, theme, accepts);
    const pair = failedPairs(theme, set(value), [role]).next().value;
    found.push(failure(theme, role, value, nearest, pair));
    if (nearest !== undefined) {
      now[role] = nearest;
    }
  }
  if (found.length > 0) {
    return found;
  }
  const baseline = { ...deriveRoles(theme, start), ...fixed, accent: start };
  const pair = failedPairs(theme, baseline).next().value;
  return [failure(theme, "accent", start, undefined, pair)];
}

/** The explicit roles that can be measured: known roles with valid, opaque-where-needed colours. */
function usable(
  explicit: Partial<ThemeColours> | undefined,
): Partial<ThemeColours> {
  return Object.fromEntries(
    Object.entries(explicit ?? {}).filter(
      ([role, colour]) => isRole(role) && invalidReason(role, colour) === null,
    ),
  ) as Partial<ThemeColours>;
}

/** The accent as `#rrggbb`, or why it cannot be read. */
function readAccent(
  accent: unknown,
): { given: string } | { invalid: InvalidColour[] } {
  const reason = invalidReason("accent", accent);
  return reason === null
    ? { given: toHex(parseColour(accent as string)) }
    : { invalid: [{ theme: null, role: "accent", value: accent, reason }] };
}

/**
 * Resolves one accent colour into the roles it drives, and checks each
 * against WCAG 2.2 AA with the same pairs and backdrops as
 * {@link checkThemeContrast}.
 *
 * The accent is used as given in a theme where it passes with its derived
 * roles: the tint (the SDK's own lightness and chroma, in the accent's hue),
 * the text on the accent (white or near black, whichever reads better) and the
 * focus ring (the accent). Where it does not pass, its lightness moves to the
 * nearest value that does, with the hue kept and the chroma cut to the sRGB
 * gamut, and `derived` says so. A role the host set in `explicit` is never
 * moved and is not in the result: it is checked, and a failure is refused with
 * the nearest passing colour named. A host-set accent drives its own theme's
 * derivation. When no lightness passes, the failure has no `nearest` and names
 * the pair that fails.
 *
 * Pure, and total for input of the declared types: the same input gives the
 * same result. An `explicit` colour that cannot be read, or a role that is not
 * one a host may set, is left out: {@link checkThemeContrast} reports it. Only
 * the pairs that involve the four roles are judged here; the caller checks the
 * whole theme.
 *
 * @param accent - The brand colour: hex, `rgb()` or `oklch()`, opaque and inside sRGB.
 * @param explicit - The roles the host set for each theme. Left out, none.
 * @param themes - The themes to resolve; a name that is not `light` or
 *   `dark` is ignored. Left out, both; the runtime route
 *   passes the one that changed, so a theme change does not search the other.
 * @returns The roles to use and how each was reached, or why it was refused.
 */
export function resolveAccent(
  accent: unknown,
  explicit: Partial<Record<ThemeName, Partial<ThemeColours>>> = {},
  themes: readonly ThemeName[] = themeNames,
): AccentResolution {
  const read = readAccent(accent);
  if ("invalid" in read) {
    return { ok: false, invalid: read.invalid, failures: [] };
  }
  const colour: Record<ThemeName, Partial<ThemeColours>> = {
    light: {},
    dark: {},
  };
  const derived: DerivedRole[] = [];
  const failures: AccentFailure[] = [];
  // Walk the known names, never the caller's list, so only `light` and `dark`
  // can be used as a key below.
  for (const theme of themeNames.filter((name) => themes.includes(name))) {
    const fixed = usable(explicit[theme]);
    const result = resolveAccentTheme(theme, read.given, fixed);
    failures.push(...result.failures);
    const written: Partial<ThemeColours> = {};
    for (const role of ROLES) {
      const value = result.roles[role];
      if (value !== undefined && fixed[role] === undefined) {
        written[role] = value;
        derived.push({
          theme,
          role,
          value,
          source: role === "accent" ? result.source : "derived",
        });
      }
    }
    colour[theme] = written;
  }
  return failures.length > 0
    ? { ok: false, invalid: [], failures }
    : { ok: true, colour, derived };
}

/**
 * The roles a valid accent drives in one theme: the resolved ones, or, when it
 * cannot be resolved, the unmoved derivation, so a check can measure what
 * fails. A role the host set is left out. Internal to the package.
 */
export function accentRolesFor(
  theme: ThemeName,
  accent: string,
  explicit: Partial<ThemeColours> | undefined,
): Partial<ThemeColours> {
  const resolution = resolveAccent(accent, { [theme]: explicit }, [theme]);
  if (resolution.ok) {
    return resolution.colour[theme];
  }
  const fixed = usable(explicit);
  const unmoved = deriveRoles(theme, toHex(parseColour(accent)));
  return Object.fromEntries(
    Object.entries(unmoved).filter(([role]) => !(role in fixed)),
  ) as Partial<ThemeColours>;
}
