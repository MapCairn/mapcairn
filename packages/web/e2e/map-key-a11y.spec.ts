// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits, waitForStableLayout } from "./support/states";

/** The sizes the key must fit: two small phones, a phone and a phone on its side, a tablet and a desktop. */
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.describe("the map key @a11y", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes axe open and minimised in ${colorScheme} at ${viewport.width}px @a11y`, async ({
        page,
        mapPage,
      }) => {
        await mockLayerProviders(page);
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await mapPage.goto("#layers=earthquakes,fire-alerts,cyclones");
        await collapseCredits(mapPage);

        for (const state of ["open", "minimised"] as const) {
          const expanded = state === "open";
          if (
            (await mapPage.mapKeyToggle.getAttribute("aria-expanded")) !==
            `${expanded}`
          ) {
            await mapPage.mapKeyToggle.click();
          }
          await expect(mapPage.mapKeyToggle).toHaveAttribute(
            "aria-expanded",
            `${expanded}`,
          );
          await waitForStableLayout(page);

          expect(await axeViolations(page), state).toEqual([]);
          const controls = await inspectControls(page);
          expect(controls.unnamed, state).toEqual([]);
          expect(controls.tooSmall, state).toEqual([]);
          expect(controls.under44, state).not.toContainEqual(
            expect.stringMatching(/Map key, \d+ layers?/),
          );
          const toggle = await mapPage.mapKeyToggle.boundingBox();
          expect(toggle?.width ?? 0, state).toBeGreaterThanOrEqual(44);
          expect(toggle?.height ?? 0, state).toBeGreaterThanOrEqual(44);
        }
      });
    }
  }
});
