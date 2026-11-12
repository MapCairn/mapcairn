// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits } from "./support/states";

const TILE_URL =
  /gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/IMERG_Precipitation_Rate\/default\/(\d{4}-\d{2}-\d{2})\/GoogleMapsCompatible_Level6\/\d+\/\d+\/\d+\.png/;

/** The days the rainfall tiles were asked for, in request order. */
function requestedDays(urls: readonly string[]): string[] {
  return urls.flatMap((url) => {
    const day = TILE_URL.exec(url)?.[1];
    return day ? [day] : [];
  });
}

/** A day before today in UTC, as `YYYY-MM-DD`. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

test.describe("rainfall layer", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  test("asks NASA for nothing until it is on, then for the newest day, and again for a chosen day", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    const dayBefore = daysAgo(3);
    await mapPage.goto();
    await mapPage.openMapOptions();
    expect(requestedDays(requests.urls)).toEqual([]);

    const item = page.getByTestId("layer-rainfall");
    await expect(item).toContainText("Rainfall");
    await item.getByRole("switch").first().click();
    await expect(page).toHaveURL(/layers=[^&]*rainfall/);

    await expect
      .poll(() => requestedDays(requests.urls).length)
      .toBeGreaterThan(0);
    // The newest day is fixed when the app mounts; allow for UTC midnight
    // passing while the test runs.
    const days = [...new Set(requestedDays(requests.urls))];
    expect(days).toHaveLength(1);
    expect([dayBefore, daysAgo(3)]).toContain(days[0]);

    const before = requestedDays(requests.urls).length;
    await page.getByTestId("layer-control-rainfall-date").fill("2026-06-15");
    await expect(page).toHaveURL(/rainfall\.date=2026-06-15/);
    await expect
      .poll(() => requestedDays(requests.urls).slice(before))
      .toContain("2026-06-15");
  });

  test("says no imagery was found for a day NASA has none of, beside the date it can be changed on", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page, {
      noTile: (url) => requestedDays([url]).includes("2026-06-15"),
    });
    await mapPage.goto("#layers=rainfall&rainfall.date=2026-06-15");
    await mapPage.openMapOptions();
    const status = page.getByTestId("layer-status-rainfall");
    await expect(status).toHaveText(
      "No imagery was found for 15 June 2026. Try another.",
    );
    await expect(page.getByTestId("tile-error")).toHaveCount(0);
    await page.getByTestId("layer-control-rainfall-date").fill("2026-06-14");
    await expect(status).toHaveCount(0);
  });

  test("says what it is, names its colour scale in words and carries the credits", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=rainfall");
    await mapPage.openMapOptions();
    const item = page.getByTestId("layer-rainfall");
    await expect(item.getByRole("switch").first()).toBeChecked();
    await expect(item).toContainText("satellite");
    await expect(item).toContainText("mm per hour");
    await expect(item).toContainText("green");
    await expect(item).toContainText("dark red");
    await expect(item).toContainText("Not a forecast");
    await expect(item).toContainText("not for warnings");

    await collapseCredits(mapPage);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toContainText(
      "Global Imagery Browse Services (GIBS)",
    );
    await expect(mapPage.creditsRegion).toContainText("IMERG");
  });
});
