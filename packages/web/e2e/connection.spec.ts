// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits, waitForStableLayout } from "./support/states";
import { CONNECTION_SETTLE_MS, TIMER_SLACK_MS } from "./support/timers";

/*
 * The connection notice: one visible, polite message when the device goes
 * offline and another, with one Try again, when it is back. Offline is the
 * browser's own signal, switched with `context.setOffline`, which fires the
 * real `offline` and `online` events. The page clock is installed
 * (`fastCredits`) so the settle delay is stepped past, not slept through.
 * Layer providers are answered from the fixtures while online and fail with a
 * dropped connection while offline.
 */

test.use({ reducedMotion: "reduce", fastCredits: true });

/** The layer used throughout, a feed from a provider the suite mocks. */
const LAYER = "earthquakes";

/** Makes the earthquake feed fail as a dropped connection does while `state.offline` is set. */
async function failWhileOffline(page: Page): Promise<{ offline: boolean }> {
  const state = { offline: false };
  await mockLayerProviders(page);
  await page.route(/earthquake\.usgs\.gov/, (route) =>
    state.offline ? route.abort("internetdisconnected") : route.fallback(),
  );
  return state;
}

/** Steps the page clock past the settle delay, so the notice for a change shows. */
async function settle(page: Page): Promise<void> {
  await page.clock.runFor(CONNECTION_SETTLE_MS + TIMER_SLACK_MS);
}

test.describe("the connection notice", () => {
  test("says once that the device is offline, words a layer failure to match, and offers one Try again when it is back", async ({
    page,
    context,
    mapPage,
  }) => {
    const state = await failWhileOffline(page);
    await mapPage.goto();
    await collapseCredits(mapPage);
    const notice = page.getByTestId("connection-notice");
    await expect(notice).toHaveCount(0);

    state.offline = true;
    await context.setOffline(true);
    await expect(notice).toHaveCount(0);
    await settle(page);
    await expect(notice).toHaveText(
      "You are offline. Parts of the map may not load.",
    );
    await expect(notice.getByRole("status")).toBeVisible();
    await expect(notice.getByRole("button", { name: "Try again" })).toHaveCount(
      0,
    );

    await mapPage.openMapOptions();
    await page.getByTestId(`layer-${LAYER}`).getByRole("switch").click();
    await expect(page.getByTestId(`layer-status-${LAYER}`)).toContainText(
      "Could not load. You are offline.",
    );

    // The notice is the one live region for the connection: the announcer says nothing about it.
    expect(
      (await mapPage.announcements()).filter((text) =>
        /You are offline/.test(text),
      ),
    ).toEqual([]);

    state.offline = false;
    await context.setOffline(false);
    await settle(page);
    await expect(notice).toContainText("You are back online.");
    await expect(page.getByTestId(`layer-status-${LAYER}`)).toContainText(
      "Could not load. Check your connection.",
    );

    await notice.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId(`layer-status-${LAYER}`)).toContainText(
      /shown|No earthquakes/,
    );
    await expect(notice).toHaveCount(0);
  });

  test("says nothing for a connection that drops and returns within the settle delay", async ({
    page,
    context,
    mapPage,
  }) => {
    await failWhileOffline(page);
    await mapPage.goto();
    await collapseCredits(mapPage);
    await context.setOffline(true);
    await page.clock.runFor(CONNECTION_SETTLE_MS - TIMER_SLACK_MS);
    await context.setOffline(false);
    await settle(page);
    await settle(page);
    await expect(page.getByTestId("connection-notice")).toHaveCount(0);
  });

  test("leaves out the tile error while the notice is up", async ({
    page,
    context,
    mapPage,
  }) => {
    await failWhileOffline(page);
    await mapPage.goto();
    await collapseCredits(mapPage);
    await context.setOffline(true);
    await settle(page);
    await expect(page.getByTestId("connection-notice")).toBeVisible();
    await expect(page.getByTestId("tile-error")).toHaveCount(0);
  });

  test("a failure while the browser says it is online keeps its wording", async ({
    page,
    mapPage,
  }) => {
    await page.route(/earthquake\.usgs\.gov/, (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    await mapPage.goto(`#layers=${LAYER}`);
    await collapseCredits(mapPage);
    await mapPage.openMapOptions();
    await expect(page.getByTestId(`layer-status-${LAYER}`)).toContainText(
      "Could not load.",
    );
    await expect(page.getByTestId(`layer-status-${LAYER}`)).not.toContainText(
      "offline",
    );
    await expect(page.getByTestId("connection-notice")).toHaveCount(0);
  });
});

test.describe("the connection notice, accessibility", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`both notices pass axe in ${colorScheme} @a11y`, async ({
      page,
      context,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await failWhileOffline(page);
      await mapPage.goto();
      await collapseCredits(mapPage);
      const notice = page.getByTestId("connection-notice");

      await context.setOffline(true);
      await settle(page);
      await expect(notice).toBeVisible();
      await waitForStableLayout(page);
      expect(await axeViolations(page)).toEqual([]);

      await context.setOffline(false);
      await settle(page);
      await expect(notice).toContainText("You are back online.");
      await waitForStableLayout(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
