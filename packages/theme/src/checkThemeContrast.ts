// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { accentRolesFor } from "./accent";
import {
  type InvalidColour,
  type InvalidColourReason,
  invalidReason,
  isRole,
  type ThemeColours,
} from "./colourReason";
import {
  type BackdropName,
  type ContrastBackground,
  type ContrastPair,
  contrastPairs,
  measurePair,
  type PairKind,
  type ThemeColourRole,
} from "./contrastPairs";
import { type ColourRoles, type ThemeName, themeValues } from "./tokenValues";

/** A proposed theme: some colour roles, per theme. A role left out keeps its default. */
export interface ThemeOverride {
  /**
   * One brand colour for both themes: hex, `rgb()` or `oklch()`, opaque and
   * inside sRGB. The accent's tint, the text on it and the focus ring are
   * derived from it, and where it falls below WCAG 2.2 AA in a theme its
   * lightness moves to the nearest value that passes (see
   * {@link resolveAccent}). A role set in `colour` is used as written and
   * never moved, and wins over this. {@link checkThemeContrast} resolves it
   * the same way and measures the roles that result, and
   * {@link createThemeStylesheet} writes them.
   */
  accent?: string;
  /** Colour roles to change, per theme. */
  colour?: {
    light?: Partial<ThemeColours>;
    dark?: Partial<ThemeColours>;
  };
  /**
   * A font-family list such as `"Brand Sans", system-ui, sans-serif`: plain
   * family names, quoted or not, and generic families. It does not change a
   * contrast, so {@link checkThemeContrast} leaves it alone; it is read and
   * written by {@link createThemeStylesheet}, which refuses a list with
   * anything else in it. The host loads the font face (weights 400 and 600).
   * Left out, the SDK's own font stack applies, and it follows this list as
   * the fallback.
   */
  fontFamily?: string;
  /**
   * The corner style of the pill, the sheet, the controls and the inner
   * shapes: `square`, `default` (the SDK's own) or `round`. Circular shapes
   * stay circular, and the round preset keeps the search pill a pill. Like
   * `fontFamily`, it does not change a contrast, so
   * {@link checkThemeContrast} leaves it alone and
   * {@link createThemeStylesheet} reads it, refusing any other value.
   */
  shape?: "square" | "default" | "round";
}

/** Keys of an override that are not colours: they are not checked here, and not unknown. */
const NON_COLOUR_KEYS: ReadonlySet<string> = new Set(["fontFamily", "shape"]);

/** The measured contrast of one pair, in one theme, over one backdrop. */
export interface ContrastFinding {
  /** The theme the finding is for. */
  theme: ThemeName;
  /** The role drawn: text, an icon, an edge or a ring. */
  foreground: ThemeColourRole;
  /** The role it sits on, or `map` for the bare map. */
  background: ContrastBackground;
  /** The map backdrop checked over, or `null` for an opaque background. */
  backdrop: BackdropName | null;
  /** Whether the foreground is text or a non-text mark. */
  kind: PairKind;
  /** The contrast ratio, unrounded. */
  ratio: number;
  /** The WCAG 2.2 AA minimum for this kind of pair. */
  required: number;
  /** Whether `ratio` reaches `required`. */
  passes: boolean;
}

/** The result of {@link checkThemeContrast}. */
export interface ThemeContrastCheck {
  /** True when nothing is invalid and every finding passes. */
  passes: boolean;
  /** One finding for each pair, theme and backdrop that could be checked. */
  findings: ContrastFinding[];
  /** What could not be checked, and why. */
  invalid: InvalidColour[];
}

const themeNames: readonly ThemeName[] = ["light", "dark"];

/** A plain object: not null, an array, a map, a class instance or one that inherits. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface ResolvedTheme {
  roles: ColourRoles;
  invalidRoles: ReadonlySet<string>;
  invalid: InvalidColour[];
}

/** What could be read of an override's shape before any colour is looked at. */
interface ProposedThemes {
  proposed: Partial<Record<ThemeName, Record<string, unknown>>>;
  /** The `accent` shorthand as written, or `undefined` when it is not set. */
  accent: unknown;
  /** Themes whose section is not an object: nothing is checked for them. */
  skipped: Set<ThemeName>;
  invalid: InvalidColour[];
}

function isThemeName(key: string): key is ThemeName {
  return themeNames.some((name) => name === key);
}

/**
 * Reads the shape of an override from its own entries, reporting anything
 * that is not an object, or a key that is not part of the shape. May throw
 * when a getter or proxy trap throws.
 */
function readProposedThemes(override: unknown): ProposedThemes {
  const result: ProposedThemes = {
    proposed: {},
    accent: undefined,
    skipped: new Set(),
    invalid: [],
  };
  const report = (
    theme: ThemeName | null,
    role: string,
    value: unknown,
    reason: InvalidColourReason,
  ): void => {
    result.invalid.push({ theme, role, value, reason });
  };
  if (!isPlainRecord(override)) {
    report(null, "override", override, "malformed");
    return result;
  }
  for (const [key, colour] of Object.entries(override)) {
    if (NON_COLOUR_KEYS.has(key)) {
      continue;
    }
    if (key === "accent") {
      result.accent = colour;
    } else if (key !== "colour") {
      report(null, key, colour, "unknown-key");
    } else if (colour !== undefined && !isPlainRecord(colour)) {
      report(null, "colour", colour, "malformed");
    } else {
      readThemeSections(colour ?? {}, result, report);
    }
  }
  return result;
}

function readThemeSections(
  colour: Record<string, unknown>,
  result: ProposedThemes,
  report: (
    theme: ThemeName | null,
    role: string,
    value: unknown,
    reason: InvalidColourReason,
  ) => void,
): void {
  for (const [key, section] of Object.entries(colour)) {
    if (!isThemeName(key)) {
      report(null, key, section, "unknown-key");
    } else if (section !== undefined && !isPlainRecord(section)) {
      report(key, "colour", section, "malformed");
      result.skipped.add(key);
    } else if (section !== undefined) {
      result.proposed[key] = section;
    }
  }
}

function resolveThemeColours(
  theme: ThemeName,
  proposed: Record<string, unknown> | undefined,
  fromAccent: Partial<ThemeColours>,
): ResolvedTheme {
  const roles: ColourRoles = { ...themeValues[theme].colour, ...fromAccent };
  const invalidRoles = new Set<string>();
  const invalid: InvalidColour[] = [];
  for (const [role, value] of Object.entries(proposed ?? {})) {
    if (value === undefined) {
      continue;
    }
    const reason = isRole(role) ? invalidReason(role, value) : "unknown-role";
    if (reason !== null) {
      invalidRoles.add(role);
      invalid.push({ theme, role, value, reason });
    } else {
      Object.assign(roles, { [role]: value });
    }
  }
  return { roles, invalidRoles, invalid };
}

function findingsFor(
  theme: ThemeName,
  { roles, invalidRoles }: ResolvedTheme,
): ContrastFinding[] {
  const usable = (pair: ContrastPair): boolean =>
    !invalidRoles.has(pair.foreground) && !invalidRoles.has(pair.background);
  return contrastPairs.filter(usable).flatMap((pair) =>
    (pair.backdrops.length === 0 ? [undefined] : pair.backdrops).map(
      (backdrop): ContrastFinding => {
        const ratio = measurePair(roles, pair, backdrop);
        return {
          theme,
          foreground: pair.foreground,
          background: pair.background,
          backdrop: backdrop ?? null,
          kind: pair.kind,
          ratio,
          required: pair.required,
          passes: ratio >= pair.required,
        };
      },
    ),
  );
}

/**
 * Checks a proposed theme against WCAG 2.2 AA: 4.5:1 for text, 3:1 for icons,
 * control edges, selection and the focus ring. A role left out is checked at
 * its default, so a changed `accent` is also checked against the default
 * `accentTint`. Translucent surfaces are flattened over each representative
 * map backdrop (white, black, a light map and the default basemap), so the
 * worst case is reported.
 *
 * An `accent` is resolved as {@link resolveAccent} does, in each theme, and the
 * roles that come out (the accent as given or moved, its tint, the text on it
 * and the focus ring) are the ones measured, so what this reports is what
 * {@link createThemeStylesheet} would write. An accent that cannot be resolved
 * is measured unmoved, so its failing pairs show. A role set in `colour` wins
 * over what the accent derives. An `accent` that cannot be read is listed in
 * `invalid` with the role `accent`.
 *
 * Pure and total: it never throws and never decides whether a theme is
 * accepted. A colour it cannot check is reported in `invalid`, and the pairs
 * that depend on it are left out of `findings`; the host decides what a
 * failure means. Only the default colour set is checked: the opaque and
 * `prefers-contrast: more` sets are not overridable.
 *
 * @param override - The proposed colours for light and dark.
 * @returns A finding for every checked pair and backdrop, in both themes.
 */
export function checkThemeContrast(
  override: ThemeOverride,
): ThemeContrastCheck {
  const findings: ContrastFinding[] = [];
  const invalid: InvalidColour[] = [];
  try {
    const {
      proposed,
      accent,
      skipped,
      invalid: shape,
    } = readProposedThemes(override);
    invalid.push(...shape);
    const accentReason =
      accent === undefined ? null : invalidReason("accent", accent);
    if (accentReason !== null) {
      invalid.push({
        theme: null,
        role: "accent",
        value: accent,
        reason: accentReason,
      });
    }
    const usableAccent =
      accent !== undefined && accentReason === null ? accent : undefined;
    for (const theme of themeNames.filter((name) => !skipped.has(name))) {
      try {
        const fromAccent =
          usableAccent === undefined
            ? {}
            : accentRolesFor(
                theme,
                usableAccent as string,
                proposed[theme] as Partial<ThemeColours>,
              );
        const resolved = resolveThemeColours(
          theme,
          proposed[theme],
          fromAccent,
        );
        invalid.push(...resolved.invalid);
        findings.push(...findingsFor(theme, resolved));
      } catch {
        invalid.push(unreadable(theme));
      }
    }
  } catch {
    invalid.push(unreadable(null));
  }
  return {
    passes: invalid.length === 0 && findings.every((finding) => finding.passes),
    findings,
    invalid,
  };
}

function unreadable(theme: ThemeName | null): InvalidColour {
  return { theme, role: "colour", value: undefined, reason: "unreadable" };
}
