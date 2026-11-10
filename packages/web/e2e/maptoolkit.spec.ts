import type { Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  DEFAULT_VECTOR_BASEMAP_ID,
  DEFAULT_VECTOR_BASEMAP_NAME,
  MAPTOOLKIT_BASEMAP_ID,
  MAPTOOLKIT_BASEMAP_NAME,
} from "./support/basemaps";
import { inspectPermanentCredit } from "./support/credit";
import { inspectChromeLayout } from "./support/layout";
import {
  MAPTOOLKIT_HOSTS_PATTERN,
  MAPTOOLKIT_STYLE_PATTERN,
} from "./support/network";
import { scriptGeolocation, scriptSearch } from "./support/services";
import {
  type ChromeState,
  enterState,
  leaveState,
  MATRIX_VIEWPORTS,
  viewportDetails,
  waitForCreditsCollapsed,
  waitForStableLayout,
} from "./support/states";

// Reduced motion so the sheet and the slots land at once.
test.use({ reducedMotion: "reduce" });

const START = "#map=8.00/-33.90000/18.40000/0";
const ON_MAPTOOLKIT = `${START}&basemap=${MAPTOOLKIT_BASEMAP_ID}`;

/** Records every request the page makes to a Maptoolkit host. */
function watchMaptoolkit(page: Page): Request[] {
  const seen: Request[] = [];
  page.on("request", (request) => {
    if (MAPTOOLKIT_HOSTS_PATTERN.test(request.url())) {
      seen.push(request);
    }
  });
  return seen;
}

const saveImage = (page: Page) => page.getByTestId("save-image-button");

test.describe("Maptoolkit Dark", () => {
  test("is offered in the picker, and requests nothing from Maptoolkit until it is chosen", async ({
    page,
    mapPage,
  }) => {
    const requests = watchMaptoolkit(page);
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: MAPTOOLKIT_BASEMAP_NAME,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("permanent-credit")).toHaveCount(0);
    expect(requests.map((request) => request.url())).toEqual([]);
  });

  test("shows a plain swatch in the picker, and requests no preview image for it", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    const tile = page.getByTestId(`basemap-option-${MAPTOOLKIT_BASEMAP_ID}`);
    await expect(
      page.getByTestId(`basemap-swatch-${MAPTOOLKIT_BASEMAP_ID}`),
    ).toBeVisible();
    await expect(tile.locator("img")).toHaveCount(0);
  });

  test("loads its style when chosen, saves the choice in the address, and shows the credit at once", async ({
    page,
    mapPage,
  }) => {
    const requests = watchMaptoolkit(page);
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(MAPTOOLKIT_BASEMAP_NAME);
    await expect(page.getByTestId("permanent-credit")).toBeVisible();
    await expect
      .poll(() => requests.map((request) => request.url()))
      .toContain("https://styles.maptoolkit.org/dark.json");
    await expect.poll(() => mapPage.hashBasemap()).toBe(MAPTOOLKIT_BASEMAP_ID);
    await expect
      .poll(() => mapPage.announcements())
      .toContain(`Basemap changed to ${MAPTOOLKIT_BASEMAP_NAME}`);
  });

  test("sends the style request without cookies, and says what else it sends", async ({
    page,
    mapPage,
  }) => {
    const requests = watchMaptoolkit(page);
    await mapPage.goto(ON_MAPTOOLKIT);
    const style = requests.find((request) =>
      request.url().endsWith("/dark.json"),
    );
    expect(style).toBeDefined();
    const headers = await (style as Request).allHeaders();
    // No cookie and no credentials: the request is cross-origin, the site
    // sets none, and MapLibre asks for none.
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    // The browser's default referrer policy under the site's
    // strict-origin-when-cross-origin header: the site's origin, no path.
    expect(headers.referer).toBe(`${new URL(page.url()).origin}/`);
    expect(headers["user-agent"]).toBeTruthy();
  });

  test("opens on Maptoolkit Dark from a saved choice or a link, with no other basemap's preview needed", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(ON_MAPTOOLKIT);
    await expect(page.getByTestId("permanent-credit")).toBeVisible();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: MAPTOOLKIT_BASEMAP_NAME,
      }),
    ).toBeChecked();
    await mapPage.chooseBasemap(DEFAULT_VECTOR_BASEMAP_NAME);
    await expect
      .poll(() => mapPage.hashBasemap())
      .toBe(DEFAULT_VECTOR_BASEMAP_ID);
    await page.reload();
    await mapPage.waitForMap();
    await expect(page.getByTestId("permanent-credit")).toHaveCount(0);
  });
});

test.describe("the permanent credit", () => {
  test.beforeEach(async ({ mapPage }) => {
    await mapPage.goto(ON_MAPTOOLKIT);
  });

  test("shows the logo and both credit lines, each linked as the licence requires", async ({
    page,
  }) => {
    const credit = page.getByTestId("permanent-credit");
    await expect(credit).toBeVisible();
    const logo = credit.getByRole("img", { name: "Maptoolkit" });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", "/basemaps/maptoolkit-logo.svg");
    expect(
      await logo.evaluate(
        (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
      ),
    ).toBe(true);
    expect((await logo.boundingBox())?.height).toBeGreaterThanOrEqual(24);
    await expect(
      credit.getByRole("link", { name: /^Maptoolkit/, exact: false }).first(),
    ).toHaveAttribute("href", "https://www.maptoolkit.org/");
    await expect(
      credit.getByRole("link", { name: /^© Maptoolkit/ }),
    ).toHaveAttribute("href", "https://www.maptoolkit.com/copyright/");
    await expect(
      credit.getByRole("link", { name: /^© Openstreetmap/ }),
    ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    // The credit text carries the licence wording.
    await expect(credit.locator("p")).toContainText("© Maptoolkit");
    await expect(credit.locator("p")).toContainText("© Openstreetmap");
    for (const link of await credit.getByRole("link").all()) {
      await expect(link).toHaveAttribute("rel", /noopener/);
      await expect(link).toHaveAttribute("target", "_blank");
    }
  });

  test("never collapses: it is still there after the collapsing credits have gone, and after the map moves", async ({
    page,
    mapPage,
  }) => {
    await expect(mapPage.creditsButton).toBeVisible();
    await expect(mapPage.creditsButton).toHaveAttribute(
      "aria-expanded",
      "false",
      { timeout: 10_000 },
    );
    await mapPage.focusMap();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("+");
    expect((await inspectPermanentCredit(page)).problems).toEqual([]);
  });

  test("keeps the other credits one button away: the collapsing credits still list the layers' and MapLibre's", async ({
    mapPage,
  }) => {
    await waitForCreditsCollapsed(mapPage);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toContainText("MapLibre");
  });
});

test.describe("Save image with Maptoolkit Dark", () => {
  test("is turned off with a visible reason, and does not save anything when pressed", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(ON_MAPTOOLKIT);
    await mapPage.openMapOptions();
    const button = saveImage(page);
    await expect(button).toHaveAttribute("aria-disabled", "true");
    const reason = page.getByTestId("export-blocked");
    await expect(reason).toBeVisible();
    await expect(reason).toHaveText(
      "The terms of Maptoolkit Dark do not allow saving images of its map. Choose another basemap to save an image.",
    );
    await expect(button).toHaveAttribute(
      "aria-describedby",
      (await reason.getAttribute("id")) ?? "",
    );
    let downloads = 0;
    page.on("download", () => {
      downloads += 1;
    });
    await button.focus();
    await expect(button).toBeFocused();
    // Playwright will not click an aria-disabled button by itself; a person can.
    await button.click({ force: true });
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
  });

  test("comes back when another basemap is chosen", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(ON_MAPTOOLKIT);
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(DEFAULT_VECTOR_BASEMAP_NAME);
    await expect(saveImage(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.getByTestId("export-blocked")).toHaveCount(0);
  });
});

test.describe("Maptoolkit Dark as a saved choice", () => {
  test("comes back after a reload with no basemap in the address", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(MAPTOOLKIT_BASEMAP_NAME);
    await expect(page.getByTestId("permanent-credit")).toBeVisible();
    // The choice is saved once the map has drawn it; the address names it too.
    await expect.poll(() => mapPage.hashBasemap()).toBe(MAPTOOLKIT_BASEMAP_ID);
    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await expect(page.getByTestId("permanent-credit")).toBeVisible();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: MAPTOOLKIT_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("falls back to the default basemap, and says so, when its style cannot load at start", async ({
    page,
    mapPage,
  }) => {
    await page.route(MAPTOOLKIT_STYLE_PATTERN, (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    await page.goto(`/${ON_MAPTOOLKIT}`);
    const banner = page.getByTestId("basemap-error");
    await expect(banner).toContainText("That basemap could not be loaded.", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("engine-error")).toHaveCount(0);
    await expect(page.getByTestId("permanent-credit")).toHaveCount(0);
    await mapPage.waitForMap();

    await banner.getByRole("button", { name: "Use previous basemap" }).click();
    await expect(banner).toHaveCount(0);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: DEFAULT_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();
    // A reload no longer asks for the basemap that failed: the address now
    // names the default, once the debounced write has happened.
    await expect
      .poll(() => mapPage.hashBasemap())
      .toBe(DEFAULT_VECTOR_BASEMAP_ID);
    await page.reload();
    await mapPage.waitForMap();
    await expect(page.getByTestId("basemap-error")).toHaveCount(0);
  });
});

/*
 * The credit must be whole, visible and unobstructed in every state, on the
 * three kinds of screen the layouts differ on: a phone held upright (the
 * bottom sheet, which is modal at full height), a short landscape phone (the
 * side panel on a small screen) and a desktop (the side panel). Hit testing,
 * not box comparison, decides "unobstructed".
 */
const CREDIT_VIEWPORTS = [
  MATRIX_VIEWPORTS[0], // 320 x 568, the narrowest phone
  MATRIX_VIEWPORTS[1], // 390 x 844
  MATRIX_VIEWPORTS[2], // 768 x 1024, the first width with the side panel: the credit sits after its column and wraps there
  MATRIX_VIEWPORTS[3], // 844 x 390, a short landscape phone
  MATRIX_VIEWPORTS[4], // 1280 x 720
] as const;

const CREDIT_STATES: readonly ChromeState[] = [
  "rest",
  "sheet open",
  "settings open",
  "search open",
  "measure active",
  "directions open",
  "draw active",
  "pin card",
  "attribution open",
];

async function expectCreditUnobstructed(
  page: Page,
  label: string,
): Promise<void> {
  await waitForStableLayout(page);
  const report = await inspectPermanentCredit(page);
  expect(report.problems, label).toEqual([]);
  const layout = await inspectChromeLayout(page);
  // The bottom sheet is one tall box translated down so that only its detent
  // shows, so its box reaches under the credit's row and, at full height,
  // over the (inert) chrome it covers on purpose. What it draws and hits is
  // judged by hit testing above and by `expectSheetStopsAboveCredit`.
  const detent = await page
    .locator('[data-chrome="sheet"]')
    .getAttribute("data-detent");
  const overlaps = layout.overlaps.filter(
    (overlap) =>
      !overlap.includes("sheet") ||
      (!overlap.includes("credit") && detent !== "full"),
  );
  expect(overlaps, `${label}: ${JSON.stringify(layout.boxes)}`).toEqual([]);
  expect(layout.outside, label).toEqual([]);
}

for (const viewport of CREDIT_VIEWPORTS) {
  test.describe(`credit at ${viewport.width} x ${viewport.height}`, () => {
    test.use({ viewport });
    test.setTimeout(120_000);

    test(
      "stays whole and unobstructed in every chrome state",
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        await scriptSearch(page);
        await mapPage.goto(ON_MAPTOOLKIT);
        for (const state of CREDIT_STATES) {
          await test.step(state, async () => {
            await enterState(mapPage, state);
            await expectCreditUnobstructed(page, state);
            await leaveState(mapPage, state);
          });
        }
      },
    );

    test(
      "stays whole and unobstructed with a tile error and a location error showing",
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        await scriptGeolocation(page, { outcome: "denied" });
        // A style whose one raster source is on a Maptoolkit host the suite
        // refuses to reach, so its tiles fail after the style has loaded.
        await page.route(MAPTOOLKIT_STYLE_PATTERN, (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              version: 8,
              sources: {
                tiles: {
                  type: "raster",
                  tiles: ["https://tiles.maptoolkit.org/test/{z}/{x}/{y}.png"],
                  tileSize: 256,
                },
              },
              layers: [{ id: "tiles", type: "raster", source: "tiles" }],
            }),
          }),
        );
        await mapPage.goto(ON_MAPTOOLKIT);
        await expect(page.getByTestId("tile-error")).toBeVisible({
          timeout: 20_000,
        });
        // Two banners do not fit above the credit on the smallest phone, which
        // is a limit of the screen, not of the credit.
        const roomForTwo = viewport.height >= 700;
        if (roomForTwo) {
          await mapPage.locateButton.click();
          await expect(mapPage.locateError).toBeVisible();
        }
        await expectCreditUnobstructed(page, "banners showing");
      },
    );

    test(
      "stays whole and unobstructed at every sheet height, and the sheet leaves its room",
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        await mapPage.goto(ON_MAPTOOLKIT);
        await mapPage.openMapOptions();
        const layout = await mapPage.layout();
        if (layout === "panel") {
          await expectCreditUnobstructed(page, "side panel");
          await expectPanelClearOfCredit(page);
          return;
        }
        // Half is where it opens. Walk peek, half, full and back to half.
        await expect(mapPage.sheet).toHaveAttribute("data-detent", "half");
        for (const [key, detent] of [
          ["Enter", "full"],
          ["Enter", "peek"],
          [" ", "half"],
        ] as const) {
          await mapPage.sheetHandle.focus();
          await page.keyboard.press(key);
          await expect(mapPage.sheet).toHaveAttribute("data-detent", detent);
          await expectCreditUnobstructed(page, `sheet at ${detent}`);
          await expectSheetStopsAboveCredit(page);
        }
        // At full height the sheet is modal; the credit must still be usable.
        await mapPage.sheetHandle.focus();
        await page.keyboard.press("ArrowUp");
        await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
        await expect(page.getByRole("dialog")).toHaveAttribute(
          "aria-modal",
          "true",
        );
        await expectCreditUnobstructed(page, "modal sheet at full");
        await expectSheetStopsAboveCredit(page);
      },
    );
  });
}

/** The side panel's box and the credit's do not touch. */
async function expectPanelClearOfCredit(page: Page): Promise<void> {
  const boxes = await page.evaluate(() => {
    const rect = (selector: string) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box
        ? { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
        : null;
    };
    return {
      panel: rect('[data-chrome="sheet"]'),
      credit: rect('[data-testid="permanent-credit"]'),
    };
  });
  expect(boxes.panel).not.toBeNull();
  expect(boxes.credit).not.toBeNull();
  if (boxes.panel && boxes.credit) {
    const apart =
      boxes.panel.right <= boxes.credit.left ||
      boxes.credit.right <= boxes.panel.left ||
      boxes.panel.bottom <= boxes.credit.top ||
      boxes.credit.bottom <= boxes.panel.top;
    expect(apart, JSON.stringify(boxes)).toBe(true);
  }
}

/**
 * The bottom sheet must not be drawn under the credit's row: a point in that
 * row, to the left of the credit, is not the sheet. (The sheet's own box is
 * translated down at the lower detents, so its box cannot be compared; what
 * it draws and hits is what counts.)
 */
async function expectSheetStopsAboveCredit(page: Page): Promise<void> {
  const hit = await page.evaluate(() => {
    const credit = document.querySelector<HTMLElement>(
      '[data-testid="permanent-credit"]',
    );
    if (!credit) {
      return "no credit";
    }
    const box = credit.getBoundingClientRect();
    const element = document.elementFromPoint(
      Math.max(2, box.left - 8),
      box.top + box.height / 2,
    );
    return element?.closest('[data-chrome="sheet"]') ? "sheet" : "clear";
  });
  expect(hit).toBe("clear");
}
