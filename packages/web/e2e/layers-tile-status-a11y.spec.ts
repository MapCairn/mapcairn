// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { viewportDetails, waitForStableLayout } from "./support/states";
import { TILE_LAYER_SLOW_MS, TIMER_SLACK_MS } from "./support/timers";

/** The sizes the waiting status must fit: phone, tablet and desktop. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.describe("a tile layer that is still waiting for imagery @a11y", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });
  // The map keeps repainting while its tiles are held, which slows axe on a phone.
  test.setTimeout(90_000);

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(
        `its status line passes axe in ${colorScheme} at ${viewport.width}px @a11y`,
        viewportDetails(viewport),
        async ({ page, mapPage }) => {
          const requests = await mockLayerProviders(page, { holdTiles: true });
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          await mapPage.goto("#layers=rainfall");
          await mapPage.openMapOptions();
          await expect.poll(() => requests.urls.length).toBeGreaterThan(0);
          await page.clock.runFor(TILE_LAYER_SLOW_MS + TIMER_SLACK_MS);
          const status = page.getByTestId("layer-status-rainfall");
          await expect(status).toBeVisible();
          await status.scrollIntoViewIfNeeded();
          await waitForStableLayout(page);

          expect(await axeViolations(page)).toEqual([]);
          expect((await inspectControls(page)).unnamed).toEqual([]);
        },
      );
    }
  }
});
