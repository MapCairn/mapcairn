// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  isSettingsSection,
  type Message,
  message,
  type SheetSection,
} from "@mapcairn/core";

/** What {@link sheetTitle} reads from the app's state. */
export interface SheetTitleState {
  /** Directions is the open surface. */
  readonly directionsActive: boolean;
  /** The section the sheet shows (`"pin"` while the pin card is open). */
  readonly sheetSection: SheetSection;
}

/**
 * The sheet's title, as a message for the one place that shows it: Directions while that panel is open, "Settings and help"
 * for the Settings and Help sections, otherwise Map options (which includes
 * the pin card and the sections a tapped feature or a drawing open). The
 * Settings sheet is not simply titled "Settings", because its first section
 * is already headed "Settings" and two headings with one name read as a
 * mistake.
 */
export function sheetTitle({
  directionsActive,
  sheetSection,
}: SheetTitleState): Message {
  if (directionsActive) {
    return message("app.sheetTitle.directions", {});
  }
  return isSettingsSection(sheetSection)
    ? message("app.sheetTitle.settings", {})
    : message("app.sheetTitle.mapOptions", {});
}
