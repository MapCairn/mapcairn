// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { TIMER_SLACK_MS } from "./support/timers";

/** The chunk that has Lit and the private elements, which the map waits for. */
const ELEMENTS_CHUNK = /\/assets\/js\/elements-[\w-]+\.js$/;

/** `ELEMENTS_LOAD_TIMEOUT_MS` in the map package: how long the map waits. */
const ELEMENTS_LOAD_TIMEOUT_MS = 30_000;

const NOTICE = "The map could not start. Reload the page to try again.";

/**
 * Holds back the elements chunk, as a slow connection would, until the
 * returned function lets it arrive.
 */
async function holdElementsChunk(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(ELEMENTS_CHUNK, async (route) => {
    await held;
    await route.continue();
  });
  return () => release();
}

/** The notice stands where the map would, and it was announced. */
async function expectCannotStart(page: Page): Promise<void> {
  const region = page.getByRole("region", { name: "Map" });
  await expect(region).toHaveText(NOTICE);
  await expect(region).toBeVisible();
  await expect(page.getByTestId("live-region-assertive")).toHaveText(NOTICE);
  await expect(page.getByTestId("map-placeholder")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zoom in" })).toHaveCount(0);
}

test.describe("the interface's own chunk", () => {
  test.use({ reducedMotion: "reduce" });

  test("the page for the map asks for it beside its scripts, and other pages do not", async ({
    request,
  }) => {
    const preload =
      /<link rel="modulepreload"[^>]* href="\/assets\/js\/elements-[\w-]+\.js"/;

    expect(await (await request.get("/map")).text()).toMatch(preload);
    for (const path of ["/", "/privacy"]) {
      expect(await (await request.get(path)).text()).not.toMatch(preload);
    }
  });

  test("the placeholder covers the wait for it, and the whole interface then draws at once", async ({
    page,
    mapPage,
  }) => {
    const release = await holdElementsChunk(page);
    await page.goto("/map");
    await expect(page.getByTestId("map-placeholder")).toBeVisible();
    await expect(page.getByTestId("chrome-skeleton")).toBeVisible();
    await expect(page.getByTestId("map-host")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);

    release();

    await mapPage.waitForMap();
    await expect(page.getByTestId("map-placeholder")).toHaveCount(0);
    await mapPage.openSettings();
    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });

  test("when it cannot be fetched, the page says the map could not start", async ({
    page,
  }) => {
    await page.route(ELEMENTS_CHUNK, (route) => route.abort());

    await page.goto("/map");

    await expectCannotStart(page);
  });

  test("when it never arrives, the page says so after the bound and not before", async ({
    page,
  }) => {
    await page.clock.install();
    await holdElementsChunk(page);
    await page.goto("/map");
    await expect(page.getByTestId("chrome-skeleton")).toBeVisible();

    await page.clock.runFor(ELEMENTS_LOAD_TIMEOUT_MS - TIMER_SLACK_MS * 5);
    await expect(page.getByTestId("map-placeholder")).toBeVisible();
    await expect(page.getByTestId("map-host")).toHaveCount(0);
    await page.clock.runFor(TIMER_SLACK_MS * 6);

    await expectCannotStart(page);
  });

  test("the notice that the map could not start passes axe in both themes @a11y", async ({
    page,
  }) => {
    await page.route(ELEMENTS_CHUNK, (route) => route.abort());
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/map");
      await expectCannotStart(page);

      expect(await axeViolations(page)).toEqual([]);
    }
  });
});
