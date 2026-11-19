// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import type { MapPage } from "../pages/MapPage";

/** The view and layers "Show on map" is checked from: the whole world, with countries and a layer that has a map key. */
export const FIT_START =
  "#layers=world-countries,earthquakes&map=2.00/0.00000/0.00000";

/** A phone, in the sheet layout, and a desktop, in the panel layout (#349). */
export const FIT_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

/** The map controls a fitted feature must stay clear of (#349). */
const FIT_CLEAR_OF = ["end-stack", "map-key"] as const;

/**
 * Opens Map options, picks a country from the country layer's list and
 * chooses "Show on map" on its card.
 */
export async function showCountryOnMap(
  page: Page,
  mapPage: MapPage,
  country: string,
): Promise<void> {
  await mapPage.openMapOptions();
  const list = page.getByTestId("layer-list-world-countries");
  await list.locator("summary").click();
  await list.getByTestId("layer-list-row").filter({ hasText: country }).click();
  await page.getByTestId("feature-card-show").click();
}

/**
 * The shown controls whose boxes the selected feature's outline box
 * overlaps, by slot name, or `["not measured"]` while the outline has no box.
 */
export async function controlsOverFeature(page: Page): Promise<string[]> {
  const feature = await page.getByTestId("selection-marker").boundingBox();
  if (!feature) {
    return ["not measured"];
  }
  const covering: string[] = [];
  for (const slot of FIT_CLEAR_OF) {
    const control = page.locator(`[data-chrome="${slot}"]`);
    const box = (await control.isVisible())
      ? await control.boundingBox()
      : null;
    if (
      box &&
      box.width > 0 &&
      box.height > 0 &&
      feature.x < box.x + box.width &&
      box.x < feature.x + feature.width &&
      feature.y < box.y + box.height &&
      box.y < feature.y + feature.height
    ) {
      covering.push(slot);
    }
  }
  return covering;
}
