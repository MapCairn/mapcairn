// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isInSrgbGamut, parseColour } from "./contrast";
import {
  type BackdropName,
  type ContrastPair,
  contrastPairs,
  measurePair,
  opaqueRoles,
  type PairBackground,
  type PairKind,
} from "./contrastPairs";
import { type ColourRoles, type ThemeName, themeValues } from "./tokenValues";

/**
 * The interface colour roles a host may override. Page and map roles, the
 * overlay roles and the data palette are not here: they carry their own
 * guarantees or belong to the host.
 */
export type ThemeColours = Pick<
  ColourRoles,
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
  | "focusRingInner"
>;

/** A proposed theme: some colour roles, per theme. A role left out keeps its default. */
export interface ThemeOverride {
  colour?: {
    light?: Partial<ThemeColours>;
    dark?: Partial<ThemeColours>;
  };
}

/** The measured contrast of one pair, in one theme, over one backdrop. */
export interface ContrastFinding {
  theme: ThemeName;
  /** The role drawn: text, an icon, an edge or a ring. */
  foreground: keyof ThemeColours;
  /** The role it sits on, or `map` for the bare map. */
  background: PairBackground;
  /** The map backdrop checked over, or `null` for an opaque background. */
  backdrop: BackdropName | null;
  kind: PairKind;
  /** The contrast ratio, unrounded. */
  ratio: number;
  /** The WCAG 2.2 AA minimum for this kind of pair. */
  required: number;
  /** Whether `ratio` reaches `required`. */
  passes: boolean;
}

/** Why a proposed colour could not be checked. */
export type InvalidColourReason =
  | "unknown-role"
  | "unparseable"
  | "out-of-gamut"
  | "translucent"
  | "unknown-key"
  | "malformed"
  | "unreadable";

/** A proposed colour that was not checked, so its pairs are missing from the findings. */
export interface InvalidColour {
  /** The theme it was proposed for, or `null` when it concerns the whole override. */
  theme: ThemeName | null;
  /**
   * The role, or the key or section that could not be used: `override` for
   * an override that is not a plain object, `colour` for a section that is not
   * (with `theme` set when it is one theme's section).
   */
  role: string;
  /** The value as the host supplied it. */
  value: unknown;
  reason: InvalidColourReason;
}

/** The result of {@link checkThemeContrast}. */
export interface ThemeContrastCheck {
  /** True when nothing is invalid and every finding passes. */
  passes: boolean;
  findings: ContrastFinding[];
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

const overridable: Record<keyof ThemeColours, true> = {
  surface: true,
  surfaceRaised: true,
  text: true,
  textMuted: true,
  accent: true,
  accentTint: true,
  accentContrast: true,
  hairline: true,
  controlBoundary: true,
  danger: true,
  dangerTint: true,
  scrim: true,
  focusRing: true,
  focusRingInner: true,
};

function isRole(role: string): role is keyof ThemeColours {
  return Object.hasOwn(overridable, role);
}

function invalidReason(
  role: keyof ThemeColours,
  value: unknown,
): InvalidColourReason | null {
  if (typeof value !== "string") {
    return "unparseable";
  }
  try {
    const colour = parseColour(value);
    if (!isInSrgbGamut(value)) {
      return "out-of-gamut";
    }
    return opaqueRoles.has(role) && colour.a < 1 ? "translucent" : null;
  } catch {
    return "unparseable";
  }
}

interface ResolvedTheme {
  roles: ColourRoles;
  invalidRoles: ReadonlySet<string>;
  invalid: InvalidColour[];
}

/** What could be read of an override's shape before any colour is looked at. */
interface ProposedThemes {
  proposed: Partial<Record<ThemeName, Record<string, unknown>>>;
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
    if (key !== "colour") {
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

function resolveTheme(
  theme: ThemeName,
  proposed: Record<string, unknown> | undefined,
): ResolvedTheme {
  const roles: ColourRoles = { ...themeValues[theme].colour };
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
          foreground: pair.foreground as keyof ThemeColours,
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
 * Pure and total: it never throws and never decides whether a theme is
 * accepted. A colour it cannot check is reported in `invalid`, and the pairs
 * that depend on it are left out of `findings`; the host decides what a
 * failure means. Only the default colour set is checked: the opaque and
 * `prefers-contrast: more` sets are not overridable.
 *
 * @param override The proposed colours for light and dark.
 * @returns A finding for every checked pair and backdrop, in both themes.
 */
export function checkThemeContrast(
  override: ThemeOverride,
): ThemeContrastCheck {
  const findings: ContrastFinding[] = [];
  const invalid: InvalidColour[] = [];
  try {
    const { proposed, skipped, invalid: shape } = readProposedThemes(override);
    invalid.push(...shape);
    for (const theme of themeNames.filter((name) => !skipped.has(name))) {
      try {
        const resolved = resolveTheme(theme, proposed[theme]);
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
