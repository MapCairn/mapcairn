// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { BROKEN, QUAKES, RAINFALL, WINDS } from "./support/catalogueLayers";
import { mockLayerProviders } from "./support/layers";
import { refreshCatalogue, scriptCatalogue } from "./support/services";

/**
 * How long a scripted answer is held back. A spec that looks at the section
 * while the catalogue loads installs the page's clock first and jumps it past
 * this to let the answer through, so it neither races the load nor waits.
 */
const HOLD_MS = 30_000;

test.describe("a layer catalogue that loads", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await mockLayerProviders(page);
  });

  test("says the layers are loading, then lists them", async ({
    page,
    mapPage,
  }) => {
    await page.clock.install();
    await scriptCatalogue(page, [[RAINFALL, WINDS, QUAKES]], HOLD_MS);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.layersSection).toContainText("Loading layers");
    await expect(mapPage.layersSection).toHaveAttribute("aria-busy", "true");
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(0);

    await page.clock.runFor(HOLD_MS);

    await expect(
      mapPage.layersSection.getByRole("switch", { name: "Rainfall" }),
    ).toBeVisible();
    await expect(mapPage.layersSection).not.toHaveAttribute("aria-busy");
    await expect(mapPage.layersSection).not.toContainText("Loading layers");
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(3);
    expect(await mapPage.announcements()).not.toContain("Loading layers");
  });

  test("shows a failed load with Try again, which works from the keyboard and returns focus to the Layers heading", async ({
    page,
    mapPage,
  }) => {
    await page.clock.install();
    await scriptCatalogue(page, ["fail", [RAINFALL]], HOLD_MS);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await page.clock.runFor(HOLD_MS);
    await expect(mapPage.layersSection).toContainText(
      "Layers could not be loaded.",
    );
    expect(await mapPage.announcements()).toContain(
      "Layers could not be loaded.",
    );
    const tryAgain = mapPage.layersSection.getByRole("button", {
      name: "Try again",
    });
    await tryAgain.focus();
    await page.keyboard.press("Enter");
    await expect(tryAgain).toHaveAttribute("aria-busy", "true");
    await expect(tryAgain).toBeFocused();
    await expect(mapPage.layersSection).toContainText("Loading layers");

    await page.clock.runFor(HOLD_MS);

    await expect(
      mapPage.layersSection.getByRole("switch", { name: "Rainfall" }),
    ).toBeVisible();
    await expect(tryAgain).toHaveCount(0);
    await expect(
      mapPage.layersSection.getByRole("heading", { name: "Layers" }),
    ).toBeFocused();
  });

  test("keeps Try again, and focus on it, when the retry fails again", async ({
    page,
    mapPage,
  }) => {
    await scriptCatalogue(page, ["fail", "invalid", [RAINFALL]]);
    await mapPage.goto();
    await mapPage.openMapOptions();
    const tryAgain = mapPage.layersSection.getByRole("button", {
      name: "Try again",
    });
    await tryAgain.focus();
    await page.keyboard.press("Enter");
    await expect(mapPage.layersSection).toContainText(
      "Layers could not be loaded.",
    );
    await expect(tryAgain).toBeFocused();
    await expect(tryAgain).not.toHaveAttribute("aria-busy");
    await page.keyboard.press("Enter");
    await expect(
      mapPage.layersSection.getByRole("switch", { name: "Rainfall" }),
    ).toBeVisible();
  });

  test("says when the catalogue has no layers", async ({ page, mapPage }) => {
    await scriptCatalogue(page, [[]]);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.layersSection).toContainText(
      "No layers are available.",
    );
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(0);
    expect(await mapPage.announcements()).toContain("No layers are available.");
  });

  test("counts the definitions it could not show, in the singular for one", async ({
    page,
    mapPage,
  }) => {
    await scriptCatalogue(page, [
      [RAINFALL, BROKEN],
      [RAINFALL, BROKEN, {}],
    ]);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.layersSection).toContainText(
      "1 layer could not be shown",
    );
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(1);
    expect(await mapPage.announcements()).toContain(
      "1 layer could not be shown.",
    );

    await refreshCatalogue(page);
    await expect(mapPage.layersSection).toContainText(
      "2 layers could not be shown",
    );
  });

  test("keeps a layer the link names while the list loads, turns it on when the list arrives, and says once that another is not available", async ({
    page,
    mapPage,
  }) => {
    await page.clock.install();
    await scriptCatalogue(page, [[RAINFALL, WINDS]], HOLD_MS);
    await mapPage.goto("#layers=catalogue-wind,retired");
    await mapPage.openMapOptions();
    await expect(mapPage.layersSection).toContainText("Loading layers");
    await expect(page).toHaveURL(/layers=catalogue-wind,retired/);
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Loading layers");

    await page.clock.runFor(HOLD_MS);

    const winds = mapPage.layersSection.getByRole("switch", { name: "Winds" });
    await expect(winds).toBeChecked();
    await expect(page).toHaveURL(/layers=catalogue-wind(&|$)/);
    const spoken = await mapPage.announcements();
    expect(
      spoken.filter(
        (message) => message === "1 layer in the link is not available.",
      ),
    ).toHaveLength(1);
  });

  test("turns off a layer a refresh removes, and says what changed in one message", async ({
    page,
    mapPage,
  }) => {
    await scriptCatalogue(page, [
      [RAINFALL, WINDS],
      [WINDS, QUAKES],
    ]);
    await mapPage.goto("#layers=catalogue-rain");
    await mapPage.openMapOptions();
    const rainfall = mapPage.layersSection.getByRole("switch", {
      name: "Rainfall",
    });
    await expect(rainfall).toBeChecked();

    await refreshCatalogue(page);

    await expect(rainfall).toHaveCount(0);
    await expect(
      mapPage.layersSection.getByRole("switch", { name: "Quakes" }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/layers=/);
    await expect
      .poll(() => mapPage.announcements())
      .toContain(
        "Rainfall is no longer available and was turned off. Layers updated: 1 added, 1 removed.",
      );
  });

  test("keeps the last list when a refresh fails, says so, and Try again brings the update", async ({
    page,
    mapPage,
  }) => {
    await scriptCatalogue(page, [[RAINFALL, WINDS], "fail", [WINDS]]);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(2);

    await refreshCatalogue(page);

    await expect(mapPage.layersSection).toContainText(
      "Layers could not be updated. Showing the last list.",
    );
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(2);
    expect(await mapPage.announcements()).toContain(
      "Layers could not be updated. Showing the last list.",
    );

    await mapPage.layersSection
      .getByRole("button", { name: "Try again" })
      .click();
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(1);
    await expect(mapPage.layersSection).not.toContainText("could not be");
  });

  test("offers no refresh button while nothing has failed", async ({
    page,
    mapPage,
  }) => {
    await scriptCatalogue(page, [[RAINFALL]]);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.layersSection.getByRole("switch")).toHaveCount(1);
    await expect(
      mapPage.layersSection.getByRole("button", {
        name: /try again|refresh|reload/i,
      }),
    ).toHaveCount(0);
  });
});

test.describe("the reference site's layers", () => {
  test("show no catalogue status, because the static catalogue is ready on the first render", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(
      mapPage.layersSection.getByRole("switch").first(),
    ).toBeVisible();
    await expect(page.getByTestId("catalogue-status")).toHaveCount(0);
    await expect(page.getByTestId("catalogue-skipped")).toHaveCount(0);
    await expect(mapPage.layersSection).not.toHaveAttribute("aria-busy");
    expect(await mapPage.announcements()).toEqual([]);
  });
});
