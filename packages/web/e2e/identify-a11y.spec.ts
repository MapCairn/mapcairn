// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import {
  IDENTIFY_FLOOD,
  IDENTIFY_RAIN,
  mockIdentifyData,
} from "./support/kindLayers";
import { scriptLayers } from "./support/services";
import {
  collapseCredits,
  viewportDetails,
  waitForStableLayout,
} from "./support/states";
import { IDENTIFY_FEEDBACK_MS, TIMER_SLACK_MS } from "./support/timers";

/** The sizes the waiting line and the card must fit: phone, tablet and desktop. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

const LAYERS =
  "#layers=kind-identify-flood,kind-identify-rain&map=7.00/30.00000/31.00000";

test.describe("identify at a tap @a11y", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });
  test.setTimeout(90_000);

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(
        `the waiting line passes axe in ${colorScheme} at ${viewport.width}px @a11y`,
        viewportDetails(viewport),
        async ({ page, mapPage }) => {
          await scriptLayers(page, [IDENTIFY_FLOOD, IDENTIFY_RAIN]);
          const service = await mockIdentifyData(page);
          service.set("flood", "hold");
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          await mapPage.goto(LAYERS);
          await collapseCredits(mapPage);
          await mapPage.host.click();
          await expect.poll(() => service.queries.length).toBeGreaterThan(0);
          await page.clock.runFor(IDENTIFY_FEEDBACK_MS + TIMER_SLACK_MS);
          await expect(page.getByTestId("identify-status")).toBeVisible();
          await waitForStableLayout(page);

          expect(await axeViolations(page)).toEqual([]);
          expect((await inspectControls(page)).unnamed).toEqual([]);
        },
      );

      test(
        `the card and the list of an identified feature pass axe in ${colorScheme} at ${viewport.width}px @a11y`,
        viewportDetails(viewport),
        async ({ page, mapPage }) => {
          await scriptLayers(page, [IDENTIFY_FLOOD, IDENTIFY_RAIN]);
          const service = await mockIdentifyData(page);
          service.set("flood", "found");
          service.set("rain", "found");
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          await mapPage.goto(LAYERS);
          await collapseCredits(mapPage);
          await mapPage.host.click();
          await expect(page.getByTestId("feature-choices")).toBeVisible();
          await waitForStableLayout(page);
          expect(await axeViolations(page)).toEqual([]);

          await page
            .getByTestId("feature-choices-row")
            .filter({ hasText: "Gauge 4" })
            .click();
          await expect(page.getByTestId("feature-card")).toBeVisible();
          await waitForStableLayout(page);
          expect(await axeViolations(page)).toEqual([]);
          expect((await inspectControls(page)).unnamed).toEqual([]);
        },
      );
    }
  }
});
