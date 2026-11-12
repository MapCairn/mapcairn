import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits, waitForStableLayout } from "./support/states";

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
 * Finds how many fields the year of a native date input sits after the first,
 * whatever order the browser puts them in, by nudging each field of a spare
 * date input added to the page for the purpose and removed after. The
 * control's own input is never nudged: its newest year is its last, so
 * ArrowUp there wraps to its first year, a real day the control would commit
 * and ask for tiles of before ArrowDown could put it back.
 */
async function yearFieldOffset(page: Page): Promise<number> {
  const probe = page.locator("[data-year-probe]");
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.type = "date";
    input.value = "2026-06-15";
    input.setAttribute("data-year-probe", "");
    document.body.append(input);
  });
  try {
    await probe.focus();
    for (let field = 0; field < 3; field += 1) {
      await page.keyboard.press("ArrowUp");
      if ((await probe.inputValue()).startsWith("2027")) {
        return field;
      }
      await page.keyboard.press("ArrowRight");
    }
    throw new Error("A date input has no year field the keyboard can reach.");
  } finally {
    await probe.evaluate((input) => input.remove());
  }
}

/**
 * Moves focus to the year field of the control's date input without changing
 * its value, so the only days it sees are the ones the test types.
 */
async function focusYearField(page: Page, date: Locator): Promise<void> {
  const offset = await yearFieldOffset(page);
  await date.focus();
  for (let field = 0; field < offset; field += 1) {
    await page.keyboard.press("ArrowRight");
  }
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

test.describe("half-hourly rainfall with no imagery for the time shown", () => {
  test.use({ reducedMotion: "reduce" });

  const NO_IMAGERY =
    "No imagery was found for 13:00 UTC on 11 November 2026. Try another.";

  /** A half hour NASA has no tiles for: the provider answers 404 to each. */
  const missing = (url: string) => requestedTimes([url]).includes(NEWEST);

  test.beforeEach(async ({ page }) => {
    await freezeTime(page);
  });

  test("says so beside the control, announces it politely, and does not blame the connection", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page, { noTile: missing });
    await mapPage.goto(`#layers=${LAYER}`);
    await mapPage.openMapOptions();

    const status = page.getByTestId(`layer-status-${LAYER}`);
    await expect(status).toHaveText(NO_IMAGERY);
    await expect(page.getByTestId("live-region-polite")).toHaveText(
      `Rainfall, half-hourly: ${NO_IMAGERY}`,
    );
    await expect(page.getByTestId("live-region-assertive")).toBeEmpty();
    await expect(page.getByTestId("tile-error")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Half hour shown" }),
    ).toBeEnabled();
    expect([...new Set(requestedTimes(requests.urls))]).toEqual([NEWEST]);
  });

  test("goes when another half hour is picked, and comes back for the one with none", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page, { noTile: missing });
    await mapPage.goto(`#layers=${LAYER}`);
    await mapPage.openMapOptions();
    const status = page.getByTestId(`layer-status-${LAYER}`);
    await expect(status).toHaveText(NO_IMAGERY);

    const time = page
      .getByRole("group", { name: "Half hour shown" })
      .getByRole("combobox", { name: "Time (UTC)" });
    await time.selectOption({ label: "12:30" });
    await expect(status).toHaveCount(0);
    await expect
      .poll(() => requestedTimes(requests.urls))
      .toContain("2026-11-11T12:30:00Z");
    await expect(status).toHaveCount(0);

    await time.selectOption({ label: "13:00" });
    await expect(status).toHaveText(NO_IMAGERY);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`its status passes axe in ${colorScheme} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mockLayerProviders(page, { noTile: missing });
      await mapPage.goto(`#layers=${LAYER}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId(`layer-status-${LAYER}`)).toHaveText(
        NO_IMAGERY,
      );
      await waitForStableLayout(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
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
