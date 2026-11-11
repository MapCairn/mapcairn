import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";

const card = (page: Page) => page.getByTestId("tour-card");

/** Presses Tab until `name` has focus, as a keyboard user would. */
async function tabTo(page: Page, name: string) {
  const target = page.getByRole("button", { name, exact: true });
  for (let presses = 0; presses < 12; presses += 1) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test.describe("first-visit tour", () => {
  test.use({ firstVisit: true, reducedMotion: "reduce" });

  test("a first visit offers the welcome card without moving focus, and Skip is remembered", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAccessibleName("New to MapCairn?");
    await expect(card(page).locator(":focus")).toHaveCount(0);

    await card(page).getByRole("button", { name: "Skip", exact: true }).click();
    await expect(card(page)).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("mapcairn:tourSeen")),
      )
      .toBe("1");

    // A bare address: a reload would carry the app's own view in the hash.
    await mapPage.goto();
    await expect(card(page)).toHaveCount(0);
  });

  test("the whole tour by keyboard only, with Next, ending with focus on the map", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.searchInput.focus();
    await tabTo(page, "Take the tour");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Turn on a layer" }),
    ).toBeFocused();
    await expect(mapPage.mapOptionsButton).toHaveAttribute(
      "data-tour-highlight",
      "true",
    );
    for (const next of ["Try the globe", "Find a place"]) {
      await tabTo(page, "Next");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: next })).toBeFocused();
    }
    await tabTo(page, "Finish");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Tour finished" }),
    ).toBeFocused();
    await tabTo(page, "Close");
    await page.keyboard.press("Enter");
    await expect(card(page)).toHaveCount(0);
    await expect(mapPage.region).toBeFocused();
  });

  test("steps advance when the person does them", async ({ page, mapPage }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await page.getByRole("button", { name: "Take the tour" }).click();
    await mapPage.mapOptionsButton.click();
    const layers = page.getByTestId("sheet-section-layers");
    await expect(layers).toBeVisible();
    await layers.getByRole("switch").first().click();
    await expect(
      page.getByRole("heading", { name: "Try the globe" }),
    ).toBeVisible();

    await mapPage.settingsButton.click();
    await page
      .getByRole("radiogroup", { name: "Map shape" })
      .getByRole("radio", { name: "Globe" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Find a place" }),
    ).toBeVisible();

    await mapPage.searchInput.click();
    await expect(
      page.getByRole("heading", { name: "Tour finished" }),
    ).toBeVisible();
  });

  test("Escape in the card skips; Escape in the sheet only closes the sheet", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await page.getByRole("button", { name: "Take the tour" }).click();
    await mapPage.openSettings();
    await page.keyboard.press("Escape");
    await expect(mapPage.sheet).not.toHaveAttribute("data-state", "open");
    await expect(
      page.getByRole("heading", { name: "Turn on a layer" }),
    ).toBeVisible();

    await page.getByRole("heading", { name: "Turn on a layer" }).focus();
    await page.keyboard.press("Escape");
    await expect(card(page)).toHaveCount(0);
    await expect(mapPage.region).toBeFocused();
  });

  test("Help starts the tour again after a skip", async ({ page, mapPage }) => {
    await mapPage.goto();
    await card(page).getByRole("button", { name: "Skip", exact: true }).click();
    await mapPage.openSettings();
    await page.getByRole("button", { name: "Take the tour" }).click();
    await expect(mapPage.sheet).not.toHaveAttribute("data-state", "open");
    await expect(
      page.getByRole("heading", { name: "Turn on a layer" }),
    ).toBeFocused();
  });

  test("a shared link shows no card", async ({ page, mapPage }) => {
    await mapPage.goto("#map=12.00/51.50000/-0.12000");
    await expect(mapPage.region).toBeVisible();
    await expect(card(page)).toHaveCount(0);
  });
});
