// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { waitForStableLayout } from "./support/states";

/** The sizes the Layers section's new controls must fit: phone, tablet and desktop. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.describe("turning layers off at once @a11y", () => {
  test.use({ reducedMotion: "reduce" });

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`the buttons and the Undo status pass axe in ${colorScheme} at ${viewport.width}px @a11y`, async ({
        page,
        mapPage,
      }) => {
        await mockLayerProviders(page);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await mapPage.goto("#layers=earthquakes,imagery");
        await mapPage.openMapOptions();
        await mapPage.layersSection.scrollIntoViewIfNeeded();
        await waitForStableLayout(page);

        expect(await axeViolations(page)).toEqual([]);
        const controls = await inspectControls(page);
        expect(controls.unnamed).toEqual([]);
        expect(controls.tooSmall).toEqual([]);
        expect(controls.under44).not.toContainEqual(
          expect.stringContaining("Turn off"),
        );

        await mapPage.turnOffAllButton.click();
        await expect(mapPage.undoTurnOffButton).toBeVisible();
        expect(await axeViolations(page)).toEqual([]);
        expect((await inspectControls(page)).unnamed).toEqual([]);
      });
    }
  }
});
