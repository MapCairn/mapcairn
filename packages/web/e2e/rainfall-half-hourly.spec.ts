import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits } from "./support/states";

const LAYER = "rainfall-half-hourly";
const TILE_URL =
  /gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/IMERG_Precipitation_Rate_30min\/default\/([^/]+)\/GoogleMapsCompatible_Level6\/\d+\/\d+\/\d+\.png/;
const HALF_HOUR_MS = 30 * 60_000;
const LATENCY_MS = 6 * 60 * 60_000;

/** The half hours the tiles were asked for, as GIBS names them, in request order. */
function requestedTimes(urls: readonly string[]): string[] {
  return urls.flatMap((url) => {
    const time = TILE_URL.exec(url)?.[1];
    return time ? [decodeURIComponent(time)] : [];
  });
}

/** The newest half hour the layer offers at the page's own time, as GIBS names it. */
async function newestOffered(page: Page): Promise<string> {
  const now = await page.evaluate(() => Date.now());
  const start = Math.floor((now - LATENCY_MS) / HALF_HOUR_MS) * HALF_HOUR_MS;
  return `${new Date(start).toISOString().slice(0, 19)}Z`;
}

test.describe("half-hourly rainfall layer", () => {
  test.use({ reducedMotion: "reduce" });

  test("asks NASA for nothing until it is on, then for the newest half hour, and again for a chosen one", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    expect(requestedTimes(requests.urls)).toEqual([]);

    const item = page.getByTestId(`layer-${LAYER}`);
    const before = await newestOffered(page);
    await item.getByRole("switch", { name: /Rainfall, half-hourly/ }).click();
    await expect(page).toHaveURL(new RegExp(`layers=[^&]*${LAYER}`));
    await expect
      .poll(() => requestedTimes(requests.urls).length)
      .toBeGreaterThan(0);
    const after = await newestOffered(page);
    const times = [...new Set(requestedTimes(requests.urls))];
    expect(times).toHaveLength(1);
    // The newest half hour is fixed when the app mounts; allow for a half
    // hour boundary passing while the test runs.
    expect([before, after]).toContain(times[0]);

    const group = item.getByRole("group", { name: "Half hour shown" });
    await expect(group).toContainText("Newest available:");
    await expect(group).toContainText("Later times are not out yet.");

    const count = requestedTimes(requests.urls).length;
    await group.getByLabel("Date (UTC)").fill("2026-06-15");
    await group
      .getByRole("combobox", { name: "Time (UTC)" })
      .selectOption({ label: "09:30" });
    await expect(page).toHaveURL(new RegExp(`${LAYER}\\.time=2026-06-15t0930`));
    await expect(group).toContainText(
      "Showing 09:30 to 10:00 UTC on 15 June 2026.",
    );
    await expect
      .poll(() => requestedTimes(requests.urls).slice(count))
      .toContain("2026-06-15T09:30:00Z");
  });

  test("offers only half hours that exist on the newest day", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto(`#layers=${LAYER}`);
    await mapPage.openMapOptions();
    const time = page.getByTestId(`layer-control-${LAYER}-time-time`);
    const date = page.getByTestId(`layer-control-${LAYER}-time-date`);
    const newestDay = await date.getAttribute("max");
    await expect(date).toHaveValue(newestDay as string);
    const options = await time.locator("option").allTextContents();
    const selected = await time.inputValue();
    expect(options.at(-1)).toBe(
      `${selected.slice(11, 13)}:${selected.slice(13, 15)}`,
    );
  });

  test("rounds a hand-edited link down to its half hour", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto(`#layers=${LAYER}&${LAYER}.time=2026-06-15t0945`);
    await expect
      .poll(() => requestedTimes(requests.urls))
      .toContain("2026-06-15T09:30:00Z");
    expect(requestedTimes(requests.urls)).not.toContain("2026-06-15T09:45:00Z");
    await mapPage.openMapOptions();
    await expect(
      page.getByTestId(`layer-control-${LAYER}-time-time`),
    ).toHaveValue("2026-06-15t0930");
  });

  test("moves a link to a half hour not out yet back to the newest", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto(`#layers=${LAYER}&${LAYER}.time=2099-01-01t0000`);
    const before = await newestOffered(page);
    await expect
      .poll(() => requestedTimes(requests.urls).length)
      .toBeGreaterThan(0);
    const after = await newestOffered(page);
    expect([...new Set(requestedTimes(requests.urls))]).toHaveLength(1);
    expect([before, after]).toContain(requestedTimes(requests.urls)[0]);
  });

  test("passes axe with its date and time control open @a11y", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto(`#layers=${LAYER}`);
    await mapPage.openMapOptions();
    await expect(
      page.getByRole("group", { name: "Half hour shown" }),
    ).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});

test.describe("half-hourly rainfall credits", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  test("carries the GIBS and IMERG credits", async ({ page, mapPage }) => {
    await mockLayerProviders(page);
    await mapPage.goto(`#layers=${LAYER}`);
    await collapseCredits(mapPage);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toContainText(
      "Global Imagery Browse Services (GIBS)",
    );
    await expect(mapPage.creditsRegion).toContainText("IMERG");
  });
});
