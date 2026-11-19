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
  | "unreadable";

/** A proposed colour that was not checked, so its pairs are missing from the findings. */
export interface InvalidColour {
  theme: ThemeName;
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

/**
 * Reads the own entries of a proposed object. A getter or a proxy trap that
 * throws makes the whole object unreadable, which is reported, not thrown.
 */
function readEntries(proposed: unknown): [string, unknown][] {
  return isRecord(proposed) ? Object.entries(proposed) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function resolveTheme(theme: ThemeName, proposed: unknown): ResolvedTheme {
  const roles: ColourRoles = { ...themeValues[theme].colour };
  const invalidRoles = new Set<string>();
  const invalid: InvalidColour[] = [];
  for (const [role, value] of readEntries(proposed)) {
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
  for (const theme of themeNames) {
    try {
      const colour = isRecord(override) ? override.colour : undefined;
      const resolved = resolveTheme(
        theme,
        isRecord(colour) ? colour[theme] : undefined,
      );
      invalid.push(...resolved.invalid);
      findings.push(...findingsFor(theme, resolved));
    } catch {
      invalid.push({
        theme,
        role: "colour",
        value: undefined,
        reason: "unreadable",
      });
    }
  }
  return {
    passes: invalid.length === 0 && findings.every((finding) => finding.passes),
    findings,
    invalid,
  };
}
