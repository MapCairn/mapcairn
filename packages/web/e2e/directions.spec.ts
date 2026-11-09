import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations } from "./support/a11y";
import { mockRoutingService, type RoutingScript } from "./support/routing";
import { waitForStableLayout } from "./support/states";

/*
 * Directions: stops from the map, the map centre, a place search and the
 * dropped pin; a route and a travel-time area from the mocked routing
 * service; every failure; keyboard-only use; and one tool at a time. The
 * mocked service answers from the adapter's recorded fixtures, so the real
 * adapter and decoder run.
 */

test.use({ reducedMotion: "reduce" });

const START = "#map=11.00/48.85660/2.35220";

const VIEWPORTS = [
  { name: "bottom sheet", width: 390, height: 844 },
  { name: "side panel", width: 1280, height: 720 },
] as const;

const panel = (page: Page) => page.getByTestId("directions-panel");
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name });
const getRoute = (page: Page) => button(page, "Get route");
const addAtCentre = (page: Page) => button(page, "Add stop at map centre");

async function openDirections(mapPage: MapPage): Promise<void> {
  await mapPage.directionsButton.click();
  await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
  await expect(
    mapPage.sheet.getByRole("heading", { name: "Directions", level: 2 }),
  ).toBeFocused();
}

/** Taps two places in the part of the map the sheet or the side panel leaves free. */
async function tapTwoStops(mapPage: MapPage): Promise<void> {
  const box = await mapPage.host.boundingBox();
  if (!box) {
    throw new Error("The map has no box.");
  }
  const wide = box.width > 700;
  const places = wide
    ? ([
        [0.62, 0.35],
        [0.78, 0.6],
      ] as const)
    : ([
        [0.55, 0.15],
        [0.4, 0.28],
      ] as const);
  for (const [x, y] of places) {
    await mapPage.host.click({
      position: { x: box.width * x, y: box.height * y },
    });
  }
}

async function addTwoStopsAtCentre(
  page: Page,
  mapPage: MapPage,
): Promise<void> {
  await addAtCentre(page).click();
  await mapPage.focusMap();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await addAtCentre(page).click();
}

const stopRows = (page: Page): Locator =>
  page.getByTestId("directions-stop-row");

for (const viewport of VIEWPORTS) {
  test.describe(`directions in the ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    let routing: RoutingScript;

    test.beforeEach(async ({ page }) => {
      routing = await mockRoutingService(page);
    });

    test("opens a labelled panel with focus inside, and sends nothing until asked", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await expect(mapPage.directionsButton).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await openDirections(mapPage);
      await expect(mapPage.directionsButton).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(panel(page)).toContainText("Tap the map to add a stop");
      await expect(getRoute(page)).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByTestId("directions-note")).toContainText(
        "Nothing is sent until you ask",
      );
      await addTwoStopsAtCentre(page, mapPage);
      expect(routing.requests).toEqual([]);
    });

    test("takes stops from taps on the map and finds a route", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await tapTwoStops(mapPage);
      await expect(stopRows(page)).toHaveCount(2);
      await expect(page.getByTestId("directions-stop")).toHaveCount(2);
      await expect(mapPage.host).toHaveCSS("cursor", "crosshair");

      await getRoute(page).click();
      await expect(page.getByTestId("directions-figures")).toHaveText(
        /^[\d.,]+ km, \d+ h \d+ min$/,
      );
      expect(routing.requests).toHaveLength(1);
      expect(routing.requests[0]?.endpoint).toBe("route");
      expect(routing.requests[0]?.body).toMatchObject({ costing: "auto" });
      expect(routing.requests[0]?.body.locations).toHaveLength(2);
      await expect
        .poll(() => mapPage.announcements())
        .toContainEqual(expect.stringMatching(/^Route found, .+ driving$/));
    });

    test("names the service and OpenStreetMap in the credits only while a result is on the map", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addTwoStopsAtCentre(page, mapPage);
      await mapPage.creditsButton.click();
      await expect(
        mapPage.creditsRegion.getByRole("link", { name: /Valhalla/ }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");

      await getRoute(page).click();
      await expect(page.getByTestId("directions-result")).toBeVisible();
      await mapPage.creditsButton.click();
      await expect(
        mapPage.creditsRegion.getByRole("link", { name: /Valhalla/ }),
      ).toBeVisible();
      await expect(
        mapPage.creditsRegion.getByRole("link", {
          name: "© OpenStreetMap contributors",
        }),
      ).toHaveCount(1);
    });

    test("sends the chosen travel mode", async ({ page, mapPage }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addTwoStopsAtCentre(page, mapPage);
      await page.getByRole("radio", { name: "Walk" }).click();
      await getRoute(page).click();
      await expect(page.getByTestId("directions-result")).toBeVisible();
      expect(routing.requests[0]?.body).toMatchObject({
        costing: "pedestrian",
      });
      await page.getByRole("radio", { name: "Cycle" }).click();
      // A different mode clears a result that was found for the old one.
      await expect(page.getByTestId("directions-result")).toHaveCount(0);
      await getRoute(page).click();
      await expect(page.getByTestId("directions-result")).toBeVisible();
      expect(routing.requests[1]?.body).toMatchObject({ costing: "bicycle" });
    });

    test("shows each leg of a route through three stops", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addAtCentre(page).click();
      for (let stop = 0; stop < 2; stop += 1) {
        await mapPage.focusMap();
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await addAtCentre(page).click();
      }
      await expect(stopRows(page)).toHaveCount(3);
      await getRoute(page).click();
      await expect(page.getByTestId("directions-leg")).toHaveCount(2);
      await expect(page.getByTestId("directions-leg").first()).toContainText(
        "A to B:",
      );
    });

    test("adds a stop by place search, only when asked", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      const input = page.getByTestId("directions-search-input");
      await input.fill("Soweto");
      await expect(page.getByTestId("directions-search-results")).toHaveCount(
        0,
      );
      await input.press("Enter");
      await page
        .getByRole("button", { name: /^Add Soweto/ })
        .first()
        .click();
      await expect(stopRows(page)).toHaveCount(1);
      await expect(stopRows(page).first()).toContainText("Soweto");
    });

    test("offers the dropped pin as a stop", async ({ page, mapPage }) => {
      await mapPage.goto(START);
      await mapPage.focusMap();
      await page.keyboard.press("p");
      await expect(mapPage.pinCard).toBeVisible();
      await mapPage.pinClearButton.click();
      await mapPage.focusMap();
      await page.keyboard.press("p");
      await expect(mapPage.pinMarker).toHaveCount(1);
      await mapPage.directionsButton.click();
      await expect(mapPage.pinCard).toHaveCount(0);
      await button(page, "Add dropped pin").click();
      await expect(stopRows(page).first()).toContainText("Dropped pin");
    });

    test("reorders and removes stops, with focus kept", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addTwoStopsAtCentre(page, mapPage);
      const before = await stopRows(page).allTextContents();
      await button(page, "Move stop A down").click();
      const after = await stopRows(page).allTextContents();
      expect(after[0]?.replace(/^A/, "").replace(/^Stop A: /, "")).toContain(
        before[1]?.replace(/^B/, "").replace(/^Stop B: /, "") ?? "",
      );
      await button(page, "Remove stop B").click();
      await expect(stopRows(page)).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "Stops" })).toBeFocused();
      await button(page, "Clear directions").click();
      await expect(stopRows(page)).toHaveCount(0);
    });

    test("shows the travel time area for the first stop, with its size", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addAtCentre(page).click();
      await button(page, "Show the area reachable within 15 minutes").click();
      await expect(page.getByTestId("directions-figures")).toHaveText(
        "15 min driving",
      );
      await expect(page.getByTestId("directions-area")).toHaveText(
        /[\d.,]+ (m²|ha|km²)/,
      );
      expect(routing.requests[0]?.endpoint).toBe("isochrone");
      expect(routing.requests[0]?.body).toMatchObject({
        costing: "auto",
        polygons: true,
        contours: [{ time: 15 }],
      });
      await expect(page.getByTestId("directions-area-15")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    test("keeps stops and results out of the address", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addTwoStopsAtCentre(page, mapPage);
      await getRoute(page).click();
      await expect(page.getByTestId("directions-result")).toBeVisible();
      const hash = await page.evaluate(() => window.location.hash);
      expect(hash).not.toMatch(/stop|route|direction|locations/i);
    });

    test("Measure and Directions take turns, and the pin keeps the panel open", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addTwoStopsAtCentre(page, mapPage);
      await mapPage.startMeasuring();
      await expect(mapPage.directionsButton).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(panel(page)).toHaveCount(0);
      // The stops stay on the map.
      await expect(page.getByTestId("directions-stop")).toHaveCount(2);
      await mapPage.measureDone.click();
      await mapPage.directionsButton.click();
      await expect(stopRows(page)).toHaveCount(2);
      await mapPage.focusMap();
      await page.keyboard.press("p");
      await expect(panel(page)).toBeVisible();
      await expect(mapPage.pinCard).toHaveCount(0);
    });
  });
}

test.describe("directions failures", () => {
  let routing: RoutingScript;

  test.beforeEach(async ({ page, mapPage }) => {
    routing = await mockRoutingService(page);
    await mapPage.goto(START);
    await openDirections(mapPage);
    await addTwoStopsAtCentre(page, mapPage);
  });

  test("a busy service says so, announces it and offers Try again", async ({
    page,
    mapPage,
  }) => {
    routing.mode = "busy";
    await getRoute(page).click();
    await expect(page.getByTestId("directions-error")).toContainText(
      "The routing service is busy",
    );
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(expect.stringContaining("The routing service is busy"));
    routing.mode = "ok";
    await page.getByTestId("directions-retry").click();
    await expect(page.getByTestId("directions-result")).toBeVisible();
    await expect(page.getByTestId("directions-error")).toHaveCount(0);
  });

  test("an overloaded service is also reported as busy", async ({ page }) => {
    routing.mode = "unavailable";
    await getRoute(page).click();
    await expect(page.getByTestId("directions-error")).toContainText("busy");
    await expect(page.getByTestId("directions-retry")).toBeVisible();
  });

  test("a route that cannot be found says so, with no Try again", async ({
    page,
  }) => {
    routing.mode = "no-route";
    await getRoute(page).click();
    await expect(page.getByTestId("directions-error")).toContainText(
      "No route was found",
    );
    await expect(page.getByTestId("directions-retry")).toHaveCount(0);
  });

  test("a failed connection says the visitor may be offline", async ({
    page,
  }) => {
    routing.mode = "offline";
    await getRoute(page).click();
    await expect(page.getByTestId("directions-error")).toContainText("offline");
    routing.mode = "ok";
    await page.getByTestId("directions-retry").click();
    await expect(page.getByTestId("directions-result")).toBeVisible();
  });

  test("an area that cannot be reached says so", async ({ page }) => {
    routing.mode = "no-route";
    await button(page, "Show the area reachable within 5 minutes").click();
    await expect(page.getByTestId("directions-error")).toContainText(
      "Nothing is reachable",
    );
  });

  test("Cancel stops a request that is waiting, and the late answer is ignored", async ({
    page,
    mapPage,
  }) => {
    routing.delayMs = 1500;
    await getRoute(page).click();
    await expect(page.getByTestId("directions-loading")).toBeVisible();
    await page.getByTestId("directions-cancel").click();
    await expect(page.getByTestId("directions-loading")).toHaveCount(0);
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual("Cancelled");
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("directions-result")).toHaveCount(0);
  });
});

test.describe("directions by keyboard", () => {
  test("every step works without a pointer", async ({ page, mapPage }) => {
    const routing = await mockRoutingService(page);
    await mapPage.goto(START);
    await mapPage.directionsButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      mapPage.sheet.getByRole("heading", { name: "Directions", level: 2 }),
    ).toBeFocused();

    await addAtCentre(page).focus();
    await page.keyboard.press("Enter");
    await mapPage.focusMap();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await addAtCentre(page).focus();
    await page.keyboard.press("Enter");
    await expect(stopRows(page)).toHaveCount(2);

    await page.getByRole("radio", { name: "Walk" }).focus();
    await page.keyboard.press("Space");
    await getRoute(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("directions-result")).toBeVisible();
    expect(routing.requests[0]?.body).toMatchObject({ costing: "pedestrian" });

    await button(page, "Move stop B up").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("directions-result")).toHaveCount(0);
    await button(page, "Clear directions").focus();
    await page.keyboard.press("Enter");
    await expect(stopRows(page)).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.directionsButton).toBeFocused();
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  for (const viewport of VIEWPORTS) {
    test(`has no axe violation with a route shown, in ${colorScheme} at ${viewport.width}x${viewport.height} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await mockRoutingService(page);
      await page.emulateMedia({ colorScheme });
      await mapPage.goto(START);
      await openDirections(mapPage);
      await addTwoStopsAtCentre(page, mapPage);
      await getRoute(page).click();
      await expect(page.getByTestId("directions-result")).toBeVisible();
      await waitForStableLayout(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
}
