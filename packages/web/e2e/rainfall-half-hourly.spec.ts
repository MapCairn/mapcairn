import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits } from "./support/states";

const LAYER = "rainfall-half-hourly";
const TILE_URL =
  /gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/IMERG_Precipitation_Rate_30min\/default\/([^/]+)\/GoogleMapsCompatible_Level6\/\d+\/\d+\/\d+\.png/;
/**
 * The page's clock: 20:14 UTC on 11 November 2026. The layer offers half
 * hours up to seven hours back, so its newest slot is 13:00.
 */
const NOW = "2026-11-11T20:14:00Z";
const NEWEST = "2026-11-11T13:00:00Z";

/** The half hours the tiles were asked for, as GIBS names them, in request order. */
function requestedTimes(urls: readonly string[]): string[] {
  return urls.flatMap((url) => {
    const time = TILE_URL.exec(url)?.[1];
    return time ? [decodeURIComponent(time)] : [];
  });
}

/**
 * Fixes the page's `Date` before it loads, so the newest slot cannot move
 * across a half hour while a test runs. Timers keep running.
 */
async function freezeTime(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
}

/**
 * Moves focus to the year field of a native date input, whatever order the
 * browser's locale puts the fields in: each field is nudged up and back, and
 * the one that changes the year is the one wanted.
 */
async function focusYearField(page: Page, date: Locator): Promise<void> {
  await date.focus();
  for (let field = 0; field < 3; field += 1) {
    const before = await date.inputValue();
    await page.keyboard.press("ArrowUp");
    const after = await date.inputValue();
    await page.keyboard.press("ArrowDown");
    if (after.slice(0, 4) !== before.slice(0, 4)) {
      return;
    }
    await page.keyboard.press("ArrowRight");
  }
  throw new Error("The date input has no year field the keyboard can reach.");
}

test.describe("half-hourly rainfall layer", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await freezeTime(page);
  });

  test("asks NASA for nothing until it is on, then for the newest half hour, and again for a chosen one", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    expect(requestedTimes(requests.urls)).toEqual([]);

    const item = page.getByTestId(`layer-${LAYER}`);
    await item.getByRole("switch", { name: /Rainfall, half-hourly/ }).click();
    await expect(page).toHaveURL(new RegExp(`layers=[^&]*${LAYER}`));
    await expect
      .poll(() => [...new Set(requestedTimes(requests.urls))])
      .toEqual([NEWEST]);

    const group = item.getByRole("group", { name: "Half hour shown" });
    await expect(group).toContainText(
      "Showing 13:00 to 13:30 UTC on 11 November 2026.",
    );
    await expect(group).toContainText(
      "Newest available: 13:00 UTC on 11 November 2026. Newer times may not be out yet, so they are not offered.",
    );

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
    await expect(date).toHaveAttribute("min", "1998-01-01");
    await expect(date).toHaveAttribute("max", "2026-11-11");
    await expect(date).toHaveValue("2026-11-11");
    await expect(time).toHaveValue("2026-11-11t1300");
    const options = await time.locator("option").allTextContents();
    expect(options).toHaveLength(27);
    expect(options.at(-1)).toBe("13:00");
  });

  test("keeps the time of day while a year is typed digit by digit", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await mapPage.goto(`#layers=${LAYER}&${LAYER}.time=2026-11-05t2130`);
    await mapPage.openMapOptions();
    const date = page.getByTestId(`layer-control-${LAYER}-time-date`);
    const time = page.getByTestId(`layer-control-${LAYER}-time-time`);
    await expect(time).toHaveValue("2026-11-05t2130");
    await focusYearField(page, date);
    await page.keyboard.type("2025", { delay: 50 });
    await expect(date).toHaveValue("2025-11-05");
    await expect(time).toHaveValue("2025-11-05t2130");
    await expect(page).toHaveURL(new RegExp(`${LAYER}\\.time=2025-11-05t2130`));
    expect(
      requestedTimes(requests.urls).filter((value) => value.startsWith("1998")),
    ).toEqual([]);
    await expect(page.getByTestId("live-region-polite")).not.toContainText(
      "Time moved",
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
    await expect
      .poll(() => [...new Set(requestedTimes(requests.urls))])
      .toEqual([NEWEST]);
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

  test("carries the GIBS and IMERG credits, beside the daily layer's", async ({
    page,
    mapPage,
  }) => {
    await freezeTime(page);
    await mockLayerProviders(page);
    await mapPage.goto(`#layers=rainfall,${LAYER}`);
    await collapseCredits(mapPage);
    await mapPage.creditsButton.click();
    const credits = mapPage.creditsRegion;
    await expect(credits).toContainText(
      "Global Imagery Browse Services (GIBS)",
    );
    await expect(
      credits.getByRole("link", {
        name: /GPM IMERG half-hourly precipitation \(Early and Final runs\)/,
      }),
    ).toHaveAttribute("href", "https://gpm.nasa.gov/data/imerg");
    await expect(
      credits.getByRole("link", { name: /^GPM IMERG precipitation, Huffman/ }),
    ).toHaveAttribute("href", "https://doi.org/10.5067/GPM/IMERG/3B-HH/07");
  });
});
