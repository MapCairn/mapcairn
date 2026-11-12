// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits, waitForStableLayout } from "./support/states";

/** Two layers on that have a key, in different groups. */
const TWO_KEYED = "#layers=earthquakes,fire-alerts";

/** Six layers on that have a key, enough to need the panel's own scroll on a screen 900 tall. */
const SIX_KEYED =
  "#layers=earthquakes,volcano-alerts,fire-alerts,drought-alerts,flood-alerts,cyclones";

const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;
const PHONE_ON_ITS_SIDE = { width: 844, height: 390 } as const;
const TABLET = { width: 768, height: 1024 } as const;

test.use({ reducedMotion: "reduce", fastCredits: true });

/**
 * Opens the app and lets the credits' first showing end. The key steps aside
 * while the credits are open, so it is not there to read until they close.
 */
async function openApp(mapPage: MapPage, hash = ""): Promise<void> {
  await mapPage.goto(hash);
  await collapseCredits(mapPage);
}

test.describe("the map key", () => {
  test("shows a block for each layer that is on and has a key, without opening Layers", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(DESKTOP);
    await openApp(mapPage, TWO_KEYED);

    await expect(mapPage.mapKey).toBeVisible();
    await expect(
      mapPage.mapKey.getByRole("heading", { name: "Map key", level: 2 }),
    ).toBeVisible();
    await expect(mapPage.mapKey.getByRole("heading", { level: 3 })).toHaveText([
      "Earthquakes",
      "Fire alerts",
    ]);
    await expect(
      mapPage.mapKey.getByRole("list", { name: "Earthquakes key" }),
    ).toContainText("Below 2.5");
    await expect(
      mapPage.mapKey.getByRole("list", { name: "Fire alerts key" }),
    ).toContainText("Orange alert");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
  });

  test("shows no key when no layer that is on has one", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(DESKTOP);
    await openApp(mapPage);
    await expect(mapPage.mapKey).toHaveCount(0);

    await openApp(mapPage, "#layers=imagery");
    await expect(mapPage.mapKey).toHaveCount(0);
  });

  test("follows the Layers section: a layer turned on adds its block, and the section keeps its own key", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(DESKTOP);
    await openApp(mapPage);
    await mapPage.openMapOptions();

    await page
      .getByTestId("layer-earthquakes")
      .getByRole("switch", { name: /Earthquakes/ })
      .click();

    await expect(page.getByTestId("map-key-earthquakes")).toBeVisible();
    await expect(page.getByTestId("layer-legend-earthquakes")).toBeVisible();

    await page
      .getByTestId("layer-earthquakes")
      .getByRole("switch", { name: /Earthquakes/ })
      .click();
    await expect(mapPage.mapKey).toHaveCount(0);
  });

  test("minimises to a chip with the count and comes back, keeping focus on the one button", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(DESKTOP);
    await openApp(mapPage, TWO_KEYED);
    await expect(mapPage.mapKeyToggle).toHaveAttribute("aria-expanded", "true");

    await mapPage.mapKeyToggle.focus();
    await page.keyboard.press("Enter");

    await expect(mapPage.mapKeyToggle).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(mapPage.mapKeyToggle).toHaveAccessibleName(
      "Map key, 2 layers",
    );
    await expect(mapPage.mapKeyToggle).toContainText("Key, 2 layers");
    await expect(mapPage.mapKeyToggle).toBeFocused();
    await expect(page.getByTestId("map-key-earthquakes")).toHaveCount(0);
    await expect(
      mapPage.mapKey.getByRole("heading", { name: "Map key", level: 2 }),
    ).toBeAttached();

    await page.keyboard.press("Space");

    await expect(mapPage.mapKeyToggle).toHaveAttribute("aria-expanded", "true");
    await expect(mapPage.mapKeyToggle).toBeFocused();
    await expect(page.getByTestId("map-key-earthquakes")).toBeVisible();
  });

  test("a phone in either orientation starts minimised, and a larger screen starts open", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    const starts = [
      [DESKTOP, "true"],
      [TABLET, "true"],
      [PHONE, "false"],
      [PHONE_ON_ITS_SIDE, "false"],
    ] as const;
    for (const [viewport, expanded] of starts) {
      await page.setViewportSize(viewport);
      await openApp(mapPage, TWO_KEYED);
      await expect(
        mapPage.mapKeyToggle,
        `${viewport.width}x${viewport.height}`,
      ).toHaveAttribute("aria-expanded", expanded);
      await expect(mapPage.mapKeyToggle).toHaveAccessibleName(
        "Map key, 2 layers",
      );
    }
  });

  test("keeps the state it started with when the screen is turned", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(PHONE);
    await openApp(mapPage, TWO_KEYED);
    await expect(mapPage.mapKeyToggle).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await page.setViewportSize(PHONE_ON_ITS_SIDE);
    await expect(mapPage.mapKeyToggle).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await page.setViewportSize(DESKTOP);
    await expect(mapPage.mapKeyToggle).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await mapPage.mapKeyToggle.click();
    await page.setViewportSize(PHONE);
    await expect(mapPage.mapKeyToggle).toHaveAttribute("aria-expanded", "true");
  });

  test("is not put in the address or in storage", async ({ page, mapPage }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(DESKTOP);
    await openApp(mapPage, TWO_KEYED);
    const before = await page.evaluate(() => Object.keys(localStorage).sort());
    const urlBefore = page.url();

    await mapPage.mapKeyToggle.click();
    await expect(mapPage.mapKeyToggle).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(
      before,
    );
  });

  test("steps aside while the credits are open and returns when they close", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize(PHONE);
    await openApp(mapPage, TWO_KEYED);
    await expect(mapPage.mapKey).toBeVisible();

    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toBeVisible();
    await expect(mapPage.mapKey).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(mapPage.creditsRegion).toBeHidden();
    await expect(mapPage.mapKey).toBeVisible();
  });

  test("scrolls inside its own height and never reaches the controls", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await page.setViewportSize({ width: 1440, height: 640 });
    await openApp(mapPage, SIX_KEYED);
    await waitForStableLayout(page);

    const body = page.getByTestId("map-key-body");
    await expect(body).toBeVisible();
    const scrolls = await body.evaluate(
      (element) => element.scrollHeight > element.clientHeight + 1,
    );
    expect(scrolls).toBe(true);
    await expect(
      mapPage.mapKey.getByRole("region", { name: "Layer keys" }),
    ).toHaveAttribute("tabindex", "0");

    const key = await mapPage.mapKey.boundingBox();
    const search = await mapPage.searchLandmark.boundingBox();
    const scale = await mapPage.scaleBar.boundingBox();
    if (!(key && search && scale)) {
      throw new Error("The key, the search pill or the scale bar has no box.");
    }
    expect(key.y).toBeGreaterThanOrEqual(search.y + search.height);
    expect(key.y + key.height).toBeLessThanOrEqual(scale.y);

    await body.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight });
    });
    await expect(page.getByTestId("map-key-cyclones")).toBeInViewport();
  });
});
