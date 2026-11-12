// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ResolvedTheme, ThemeChoice } from "../ports/settings";

/**
 * Turns the user's choice into the theme to show. "system" follows the
 * operating system; an explicit choice wins.
 * @remarks Must stay free of outside references: the inline bootstrap script
 *   is built from this function's source text.
 */
export function resolveTheme(
  choice: ThemeChoice,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return choice === "system" ? systemTheme : choice;
}

/**
 * Reads a stored value as a theme choice. Anything that is not exactly
 * "system", "light" or "dark" becomes "system".
 * @remarks Must stay free of outside references: the inline bootstrap script
 *   is built from this function's source text.
 */
export function parseThemeChoice(raw: unknown): ThemeChoice {
  return raw === "light" || raw === "dark" ? raw : "system";
}
