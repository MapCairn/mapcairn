import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { E2E } from "./selectors";
import { ensurePanelOpen } from "./ui";

async function mockTownshipData(page: Page) {
  await page.route("**/data/**/townships.display.v1.geojson*", (route) => {
    const isGauteng = new URL(route.request().url()).pathname.includes(
      "/gauteng/",
    );
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        type: "FeatureCollection",
        features: isGauteng
          ? [
              {
                type: "Feature",
                properties: {
                  id: "test-botshabelo",
                  name: "Botshabelo",
                  commuteMinutes: 20,
                  nearestJobCenter: "Pretoria CBD",
                  distanceKm: null,
                  nearestTransitKm: null,
                  spatialBurdenScore: null,
                },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [24.7, -28.6],
                      [24.8, -28.6],
                      [24.8, -28.7],
                      [24.7, -28.6],
                    ],
                  ],
                },
              },
            ]
          : [],
      }),
    });
  });
  await page.route("**/data/**/township-areas.display.v1.geojson*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ type: "FeatureCollection", features: [] }),
    }),
  );
}

test.describe("browse tab", () => {
  test("lists selectable features grouped by layer, and picking one opens its details and updates the URL", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await mockTownshipData(page);
    await page.goto("/");
    await ensurePanelOpen(page);
    await page.getByTestId(E2E.layerToggle.townships).check();

    await page.getByTestId(E2E.panelTab.browser).click();

    await expect(
      page.getByRole("heading", { name: "Modelled car time" }),
    ).toBeVisible({ timeout: 30_000 });

    const filterInput = page.getByTestId(E2E.featureBrowser.filter);
    await expect(filterInput).toBeVisible();
    await filterInput.fill("Botshabelo");

    const result = page.getByRole("button", { name: "Botshabelo" });
    await expect(result).toBeVisible({ timeout: 30_000 });
    await result.click();

    await expect(page.getByTestId(E2E.featureDetails).locator("h2")).toHaveText(
      "Botshabelo",
      { timeout: 30_000 },
    );
    await expect
      .poll(() => new URL(page.url()).searchParams.get("feature"))
      .not.toBeNull();
  });

  test("shows an empty-state message for a filter that matches nothing", async ({
    page,
  }) => {
    await mockTownshipData(page);
    await page.goto("/");
    await ensurePanelOpen(page);
    await page.getByTestId(E2E.layerToggle.townships).check();

    await page.getByTestId(E2E.panelTab.browser).click();

    const filterInput = page.getByTestId(E2E.featureBrowser.filter);
    await filterInput.fill("no such place exists anywhere");

    await expect(page.getByText("Nothing matched that search.")).toBeVisible();
  });
});
