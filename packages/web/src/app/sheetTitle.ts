import { isSettingsSection, type SheetSection } from "@karta/core";

/** What {@link sheetTitle} reads from the app's state. */
export interface SheetTitleState {
  /** Directions is the open surface. */
  readonly directionsActive: boolean;
  /** The section the sheet shows (`"pin"` while the pin card is open). */
  readonly sheetSection: SheetSection;
}

/**
 * The sheet's title: Directions while that panel is open, Settings for the
 * Settings and Help sections, otherwise Map options (which includes the pin
 * card and the sections a tapped feature or a drawing open).
 */
export function sheetTitle({
  directionsActive,
  sheetSection,
}: SheetTitleState): string {
  if (directionsActive) {
    return "Directions";
  }
  return isSettingsSection(sheetSection) ? "Settings" : "Map options";
}
