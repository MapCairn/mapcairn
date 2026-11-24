// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The sheet's title, which also names its dialog or region. A map's label,
 * when it has one, follows in brackets so two maps' sheets have two names; a
 * map with no label keeps the bare title.
 */
export function sheetTitle(
  group: "map-options" | "settings" | null,
  label: string | undefined,
): string {
  const title = group === "settings" ? "Settings and help" : "Map options";
  return label ? `${title} (${label})` : title;
}
