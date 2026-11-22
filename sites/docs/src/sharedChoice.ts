// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { ColorMode } from "@docusaurus/theme-common";

/**
 * The value written to the reference site's `mapcairn:theme` key for a choice
 * made in the framework's toggle, where `null` means "follow the system".
 * `sharedChoice.test.ts` keeps every value one that core's `parseThemeChoice`
 * reads back as the same choice.
 * @param mode - The framework's colour mode, or null.
 */
export function sharedChoiceFor(mode: ColorMode | null): string {
  return mode ?? "system";
}
