import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";

/** "Show on map" lowers a phone's sheet to peek; raise it to full again. */
async function raiseSheet(page: Page, mapPage: MapPage): Promise<void> {
  if (
    (await mapPage.sheet.getAttribute("data-detent")) === "peek" &&
    (await mapPage.sheetHandle.isVisible())
  ) {
    await mapPage.sheetHandle.focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
  }
}

/**
 * One generic spec over every data layer, found through the Layers section
 * rather than a list in the test, so a new definition is covered with no
 * change here. Provider responses come from the committed fixtures, through
 * the real fetch source and decoders.
 */
test.describe("data layers", () => {
  test.use({ reducedMotion: "reduce" });

  test("every layer turns on from its switch, reports its status, and writes the permalink", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    const section = page.getByTestId("sheet-section-layers");
    // Only the layer items themselves: control wrappers have test ids too.
    const ids = (
      await section
        .locator('li[data-testid^="layer-"]')
        .evaluateAll((items) =>
          items.map((item) => item.getAttribute("data-testid") ?? ""),
        )
    ).map((testId) => testId.replace(/^layer-/, ""));
    expect(ids.length).toBeGreaterThan(0);
    expect(requests.urls).toEqual([]);

    for (const id of ids) {
      const item = page.getByTestId(`layer-${id}`);
      const toggle = item.getByRole("switch").first();
      await toggle.click();
      await expect(toggle).toBeChecked();
      await expect(page).toHaveURL(new RegExp(`layers=[^&]*${id}`));

      const status = page.getByTestId(`layer-status-${id}`);
      if (await status.count()) {
        await expect(status).not.toHaveText("Loading");
      }
      const list = page.getByTestId(`layer-list-${id}`);
      if (await list.count()) {
        await list.locator("summary").click();
        await list.getByTestId("layer-list-row").first().click();
        const card = page.getByTestId("feature-card");
        await expect(card).toBeVisible();
        await expect(page.getByTestId("feature-card-heading")).not.toBeEmpty();
        await raiseSheet(page, mapPage);
        await page.getByTestId("feature-card-close").click();
        await expect(card).toHaveCount(0);
      }
      await toggle.click();
      await expect(toggle).not.toBeChecked();
    }
  });

  test("a shared link turns its layers on with their control values", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=earthquakes&earthquakes.window=week");
    await mapPage.openMapOptions();
    const quakes = page.getByTestId("layer-earthquakes");
    await expect(quakes.getByRole("switch").first()).toBeChecked();
    await expect(quakes.getByRole("radio", { name: "Week" })).toBeChecked();
    await expect(page.getByTestId("layer-status-earthquakes")).toContainText(
      "shown",
    );
  });

  test("the list reaches the same card a tap on the map opens, by keyboard alone", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=earthquakes");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-earthquakes");
    await list.locator("summary").focus();
    await page.keyboard.press("Enter");
    await list.getByTestId("layer-list-row").first().focus();
    await page.keyboard.press("Enter");
    await raiseSheet(page, mapPage);
    await expect(page.getByTestId("feature-card")).toBeVisible();
    await expect(page.getByTestId("feature-card-link")).toHaveAttribute(
      "href",
      /^https:\/\/earthquake\.usgs\.gov\//,
    );
  });

  test("a failed load says so and offers Try again", async ({
    page,
    mapPage,
  }) => {
    await page.route(/earthquake\.usgs\.gov/, (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    await mapPage.goto("#layers=earthquakes");
    await mapPage.openMapOptions();
    await expect(page.getByTestId("layer-retry-earthquakes")).toBeVisible();
  });

  test("shows an alert's affected area on request", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto("#layers=cyclones");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-cyclones");
    await list.locator("summary").click();
    await list.getByTestId("layer-list-row").first().click();
    await raiseSheet(page, mapPage);
    expect(requests.urls.some((url) => url.includes("/polygons/"))).toBe(false);
    await page.getByTestId("feature-card-detail").click();
    await expect(page.getByTestId("feature-card-detail")).toHaveText(
      "Hide affected area",
    );
    expect(requests.urls.some((url) => url.includes("/polygons/"))).toBe(true);
  });

  test("passes axe with layers on and a card open @a11y", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=earthquakes,imagery,fire-alerts");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-earthquakes");
    await list.locator("summary").click();
    await list.getByTestId("layer-list-row").first().click();
    await raiseSheet(page, mapPage);
    expect(await axeViolations(page)).toEqual([]);
  });
});
