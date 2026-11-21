// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits } from "./support/states";

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

  test("Help starts the tour from the sheet on a screen too small for the card beside it, and focuses the step once the sheet is gone", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await mapPage.goto();
    await expect(card(page)).toBeVisible();
    await mapPage.openSettings();
    await expect(card(page)).toBeHidden();
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

/*
 * The credits' first showing and the welcome card are two overlays. On a
 * phone they would cover much of the map together, so the credits wait for
 * the tour to be answered; where the cards sit in different corners they show
 * as they always did. The clock is the page's own, jumped past the five
 * seconds by `collapseCredits`.
 */
test.describe("credits first showing beside the tour card", () => {
  test.use({ firstVisit: true, reducedMotion: "reduce", fastCredits: true });

  const creditsRoot = (page: Page) =>
    page.locator('[data-chrome="attribution"]');

  test("on a phone the credits wait for the tour, then show for their time", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mapPage.goto();
    await expect(card(page)).toBeVisible();
    // `goto` returns once the map has started: the first showing would have begun by now.
    await expect(mapPage.creditsButton).toBeVisible();
    await page.clock.fastForward(10_000);
    await expect(mapPage.creditsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(creditsRoot(page)).not.toHaveAttribute(
      "data-intro-started",
      "true",
    );

    await card(page).getByRole("button", { name: "Skip", exact: true }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(creditsRoot(page)).toHaveAttribute(
      "data-intro-started",
      "true",
    );
    await expect(mapPage.creditsRegion).toBeVisible();
    await expect(mapPage.creditsRegion.getByRole("link").first()).toBeVisible();
    await collapseCredits(mapPage);
  });

  test("on a phone they are shown after the whole tour too", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mapPage.goto();
    await card(page)
      .getByRole("button", { name: "Take the tour", exact: true })
      .click();
    for (const name of ["Next", "Next", "Finish"]) {
      await card(page).getByRole("button", { name, exact: true }).click();
    }
    await expect(mapPage.creditsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(creditsRoot(page)).not.toHaveAttribute(
      "data-intro-started",
      "true",
    );
    await card(page)
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(creditsRoot(page)).toHaveAttribute(
      "data-intro-started",
      "true",
    );
    await expect(mapPage.creditsRegion).toBeVisible();
  });

  test("on a phone, opening the credits by hand during the tour counts as seeing them", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mapPage.goto();
    await expect(card(page)).toBeVisible();
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toBeVisible();
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toBeHidden();

    await card(page).getByRole("button", { name: "Skip", exact: true }).click();
    await expect(card(page)).toHaveCount(0);
    await page.clock.fastForward(10_000);
    await expect(mapPage.creditsRegion).toBeHidden();
    await expect(creditsRoot(page)).not.toHaveAttribute(
      "data-intro-started",
      "true",
    );
  });

  test("on a desktop screen they show beside the card, as before", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mapPage.goto();
    await expect(card(page)).toBeVisible();
    await expect(creditsRoot(page)).toHaveAttribute(
      "data-intro-started",
      "true",
    );
    await expect(mapPage.creditsRegion).toBeVisible();
    await expect(card(page)).toBeVisible();
  });
});
