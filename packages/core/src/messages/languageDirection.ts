// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LanguageOption } from "./languageCatalogue";

/**
 * Resolves a language's reading direction, preferring the host's override.
 * Invalid tags and environments without locale text information fall back to
 * left-to-right.
 */
export function languageDirection(
  tag: string,
  offered: readonly LanguageOption[] = [],
): "ltr" | "rtl" {
  const override = offered.find((option) => option.tag === tag)?.direction;
  if (override !== undefined) {
    return override;
  }
  try {
    const locale = new Intl.Locale(tag) as Intl.Locale & {
      getTextInfo?: () => { direction: string };
      textInfo?: { direction: string };
    };
    const info = locale.getTextInfo?.() ?? locale.textInfo;
    return info?.direction === "rtl" ? "rtl" : "ltr";
  } catch {
    return "ltr";
  }
}
