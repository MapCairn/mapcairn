// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { scriptSearch } from "./support/services";
import { viewportDetails, waitForStableLayout } from "./support/states";
import { measureChromeTargets } from "./support/targets";

/** Phone width through desktop, the range the issue names (320 to 1440). */
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

test.use({ reducedMotion: "reduce", fastCredits: true });

test.describe("the map page's controls", () => {
  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(
        `are 44 px targets with 8 px between them in ${colorScheme} at ${viewport.width}x${viewport.height}`,
        viewportDetails(viewport),
        async ({ page, mapPage }) => {
          await page.setViewportSize(viewport);
          await scriptSearch(page);
          await mapPage.goto();
          await page.emulateMedia({ colorScheme });
          await waitForStableLayout(page);
          const report = await measureChromeTargets(page);
          expect(report.checked).toBeGreaterThan(3);
          expect(report.small).toEqual([]);
          expect(report.crowded).toEqual([]);
        },
      );
    }
  }
});

test.describe("the Map options sheet", () => {
  for (const viewport of VIEWPORTS.slice(0, 2)) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`holds 44 px targets with 8 px between them in ${colorScheme} at ${viewport.width}x${viewport.height}`, async ({
        page,
        mapPage,
      }) => {
        await page.setViewportSize(viewport);
        await mapPage.goto();
        await page.emulateMedia({ colorScheme });
        await mapPage.openMapOptions();
        await waitForStableLayout(page);
        const report = await measureChromeTargets(
          page,
          "[data-chrome='sheet']",
        );
        expect(report.checked).toBeGreaterThan(3);
        expect(report.small).toEqual([]);
        expect(report.crowded).toEqual([]);
      });
    }
  }
});
