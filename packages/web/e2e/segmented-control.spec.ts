// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";

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

  test("a toolbar takes focus on its chosen mode as it opens", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.measureButton.click();

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
