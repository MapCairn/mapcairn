// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isInSrgbGamut, parseColour } from "./contrast";
import { opaqueRoles, type ThemeColourRole } from "./contrastPairs";
import type { ThemeName } from "./tokenValues";

/**
 * The interface colour roles a host may override. Page and map roles, the
 * overlay roles and the data palette are not here: they carry their own
 * guarantees or belong to the host.
 */
export type ThemeColours = Record<ThemeColourRole, string>;

/**
 * Why a proposed colour could not be checked. `unparseable` means it is not a
 * string, or not hex, `rgb()`/`rgba()` or `oklch()`: the only syntaxes read.
 */
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
   * (with `theme` set when it is one theme's section), `accent` for the
   * shorthand.
   */
  role: string;
  /** The value as the host supplied it. */
  value: unknown;
  /** Why it could not be checked. */
  reason: InvalidColourReason;
}

const overridable: Record<ThemeColourRole, true> = {
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

/** Whether a host may override this role. */
export function isRole(role: string): role is ThemeColourRole {
  return Object.hasOwn(overridable, role);
}

/** Why a colour proposed for a role cannot be checked, or `null` when it can. */
export function invalidReason(
  role: ThemeColourRole,
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
