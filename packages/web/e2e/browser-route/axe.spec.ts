// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Page, test } from "@playwright/test";
import type { MapPage } from "../pages/MapPage";
import { axeViolations, inspectControls } from "../support/a11y";
import { enterState, leaveState, waitForStableLayout } from "../support/states";
import {
  openRoute,
  ROUTE_LANGUAGES,
  ROUTE_VIEWPORTS,
  type Route,
} from "./route";

/*
 * The browser route (`@mapcairn/sdk/browser`) puts the interface in a plain
 * page, in the light DOM, so it gets its own axe run: both themes, both pages
 * (`mountMap` and `<mapcairn-map>`), one language read left to right and one
 * right to left, and a phone, a tablet and a desktop. Every title carries
 * @a11y, so `npm run a11y` runs these and `npm run e2e` leaves them out.
 */

/** Two themes, each with a fresh page, and the states of the chrome the route has. */
const THEMES = ["light", "dark"] as const;

/** Each state walked, then left. The credits' first showing is over before "rest". */
const STATES = [
  "rest",
  "attribution open",
  "sheet open",
  "settings open",
  "measure active",
] as const;

/** Opens the search results, which the page's provider answers with two places. */
async function openSearch(mapPage: MapPage): Promise<void> {
  await mapPage.search("cape");
  await expect(mapPage.searchOptions).toHaveCount(2);
  await expect(mapPage.searchPanel).toBeVisible();
}

/** Axe and the control checks on the page as it is now. */
async function audit(page: Page): Promise<void> {
  await waitForStableLayout(page);
  expect(await axeViolations(page)).toEqual([]);
  const controls = await inspectControls(page);
  expect(controls.unnamed).toEqual([]);
  expect(controls.positiveTabindex).toEqual([]);
  expect(controls.tooSmall).toEqual([]);
}

test.describe("the browser route, axe and control checks @a11y", () => {
  for (const route of ["function", "element"] as const satisfies Route[]) {
    for (const language of ROUTE_LANGUAGES) {
      for (const viewport of ROUTE_VIEWPORTS) {
        test(`${route} page in ${language.tag} at ${viewport.width}x${viewport.height} passes in both themes @a11y`, async ({
          page,
        }) => {
          test.setTimeout(120_000);
          await page.setViewportSize(viewport);
          await page.clock.install();
          for (const theme of THEMES) {
            await page.emulateMedia({ colorScheme: theme });
            const mapPage = await openRoute(page, {
              route,
              language,
              theme,
              directionOnElement: true,
            });
            await expect(page.locator("html")).toHaveAttribute(
              "dir",
              language.direction,
            );
            for (const state of STATES) {
              await test.step(`${theme}, ${state}`, async () => {
                await enterState(mapPage, state);
                await audit(page);
                await leaveState(mapPage, state);
              });
            }
            await test.step(`${theme}, search open`, async () => {
              await openSearch(mapPage);
              await audit(page);
            });
            await page.goto("about:blank");
          }
        });
      }
    }
  }
});
