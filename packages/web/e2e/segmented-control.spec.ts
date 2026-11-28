// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { TIMER_SLACK_MS } from "./support/timers";

/** `MEASURE_ANNOUNCE_DELAY_MS` in `useMeasure`: the points must stay still this long. */
const MEASURE_ANNOUNCE_DELAY_MS = 800;

/**
 * Holds back the chunk that has Lit and the private elements, as a slow
 * connection would, until the returned function lets it arrive.
 */
async function holdElementsChunk(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/js\/elements-[\w-]+\.js$/, async (route) => {
    await held;
    await route.continue();
  });
  return () => release();
}

/**
 * The segmented control's keyboard model in a real browser, on the Settings
 * panel's Theme and Units groups: one tab stop into a group, arrow keys that
 * move focus without choosing, and Space or Enter that choose.
 */
test.describe("segmented control keyboard", () => {
  test.use({ reducedMotion: "reduce" });

  test("Tab enters on the chosen item, arrows move and only Space or Enter choose", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    const units = page.getByRole("radiogroup", { name: "Units" });
    const system = theme.getByRole("radio", { name: "System" });
    const metric = units.getByRole("radio", { name: "Metric" });
    const imperial = units.getByRole("radio", { name: "Imperial" });

    // From the first group, one Tab goes to the next group's chosen item.
    await theme.focus();
    await expect(system).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(metric).toBeFocused();

    await page.keyboard.press("ArrowRight");
    await expect(imperial).toBeFocused();
    await expect(metric).toBeChecked();
    await expect(imperial).toHaveCSS("outline-style", "solid");

    await page.keyboard.press("Space");
    await expect(imperial).toBeChecked();

    await page.keyboard.press("ArrowDown");
    await expect(metric).toBeFocused();
    await expect(imperial).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(metric).toBeChecked();

    await page.keyboard.press("End");
    await expect(imperial).toBeFocused();
    await page.keyboard.press("Home");
    await expect(metric).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(imperial).toBeFocused();
    await page.keyboard.press("PageUp");
    await expect(metric).toBeFocused();
    await page.keyboard.press("PageDown");
    await expect(imperial).toBeFocused();

    // Shift+Tab leaves the group backwards, past the group itself.
    await page.keyboard.press("Shift+Tab");
    await expect(system).toBeFocused();
    // Tab goes in through the group again, which lands on the chosen item.
    await page.keyboard.press("Tab");
    await expect(metric).toBeFocused();
  });

  test("an announcement made before the control has loaded is spoken once it has, and focus is not taken back", async ({
    page,
    mapPage,
  }) => {
    await page.clock.install();
    const release = await holdElementsChunk(page);
    await mapPage.goto();
    await mapPage.measureButton.click();
    const addPoint = page.getByTestId("measure-add-point");
    await addPoint.click();
    await addPoint.click();
    // The total is announced once the points have been still a while.
    await page.clock.runFor(MEASURE_ANNOUNCE_DELAY_MS + TIMER_SLACK_MS);
    await expect(page.getByRole("radiogroup")).toHaveCount(0);
    await expect(mapPage.politeAnnouncer).toHaveText("");

    await addPoint.focus();
    release();

    await expect(
      page.getByRole("radiogroup", { name: "Measure" }),
    ).toBeVisible();
    await expect(mapPage.politeAnnouncer).toContainText("0 m");
    await expect(addPoint).toBeFocused();
  });

  test("a toolbar opened before the control has loaded takes focus when it draws", async ({
    page,
    mapPage,
  }) => {
    const release = await holdElementsChunk(page);
    await mapPage.goto();
    await mapPage.measureButton.click();
    await expect(page.getByRole("toolbar", { name: "Measure" })).toBeVisible();

    release();

    await expect(page.getByRole("radio", { name: "Distance" })).toBeFocused();
  });

  test.describe("on a right-to-left page", () => {
    test.use({ direction: "rtl" });

    test("Left moves to the next item and Right to the previous one", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto();
      await mapPage.openSettings();
      const units = page.getByRole("radiogroup", { name: "Units" });
      const metric = units.getByRole("radio", { name: "Metric" });
      const imperial = units.getByRole("radio", { name: "Imperial" });
      await units.focus();
      await expect(metric).toBeFocused();

      await page.keyboard.press("ArrowLeft");
      await expect(imperial).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(metric).toBeFocused();
    });
  });
});
