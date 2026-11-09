import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { RASTER_BASEMAP_ID } from "./support/basemaps";

/** A view away from the poles and the antimeridian, so pans are easy to read. */
const START = "#map=4.00/10.00000/20.00000";

/** Waits until the address reports a view that passes `check`. */
async function expectHashView(
  mapPage: MapPage,
  check: (
    view: NonNullable<Awaited<ReturnType<MapPage["hashView"]>>>,
  ) => boolean,
): Promise<void> {
  await expect
    .poll(async () => {
      const view = await mapPage.hashView();
      return view !== null && check(view);
    })
    .toBe(true);
}

test.describe("keyboard map controls", () => {
  test.use({ reducedMotion: "reduce" });

  test.describe("on the default basemap", () => {
    test.beforeEach(async ({ mapPage }) => {
      await mapPage.goto(START);
      await mapPage.focusMap();
    });

    test("arrow keys pan the map", async ({ page, mapPage }) => {
      await page.keyboard.press("ArrowRight");
      await expectHashView(mapPage, (view) => view.lng > 20.5);
      await page.keyboard.press("ArrowDown");
      await expectHashView(mapPage, (view) => view.lat < 9.5);
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowUp");
      await expectHashView(
        mapPage,
        (view) =>
          Math.abs(view.lng - 20) < 0.1 && Math.abs(view.lat - 10) < 0.1,
      );
      await expect(mapPage.region).toBeFocused();
    });

    test("plus and minus zoom, and the level is announced", async ({
      page,
      mapPage,
    }) => {
      await page.keyboard.press("+");
      await expect(mapPage.host).toHaveAttribute("data-zoom", "5.00");
      await expect
        .poll(() => mapPage.announcements())
        .toContain("Zoom level 5");
      await page.keyboard.press("-");
      await page.keyboard.press("-");
      await expect(mapPage.host).toHaveAttribute("data-zoom", "3.00");
      await page.keyboard.press("=");
      await expect(mapPage.host).toHaveAttribute("data-zoom", "4.00");
    });

    test("P drops a pin at the centre and focuses its card", async ({
      page,
      mapPage,
    }) => {
      await page.keyboard.press("p");
      await expect(mapPage.pinMarker).toBeVisible();
      await expect(mapPage.pinHeading).toBeFocused();
      const [lat, lng] = ((await mapPage.pinCoordinates.textContent()) ?? "")
        .split(",")
        .map(Number);
      expect(lat).toBeCloseTo(10, 1);
      expect(lng).toBeCloseTo(20, 1);
    });

    test("Escape closes the open surface", async ({ page, mapPage }) => {
      await page.keyboard.press("p");
      await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
      await mapPage.focusMap();
      await page.keyboard.press("Escape");
      await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
      await expect(mapPage.pinMarker).toBeVisible();
    });

    test("keys with Control, Alt or Meta are left to the browser", async ({
      page,
      mapPage,
    }) => {
      await page.keyboard.press("Control+ArrowRight");
      await page.keyboard.press("Alt+p");
      await expect(mapPage.pinMarker).toHaveCount(0);
      await page.keyboard.press("p");
      await expect(mapPage.pinMarker).toBeVisible();
      expect((await mapPage.hashView())?.lng).toBeCloseTo(20, 2);
    });
  });

  test("Shift with left or right rotates the map, and Home or 0 resets north", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.focusMap();
    await expect(mapPage.compassButton).toHaveCount(0);

    await page.keyboard.press("Shift+ArrowRight");
    await expectHashView(mapPage, (view) => view.bearing === 15);
    await expect(mapPage.compassButton).toBeVisible();
    await page.keyboard.press("Home");
    await expectHashView(mapPage, (view) => view.bearing === 0);
    await expect(mapPage.compassButton).toHaveCount(0);

    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await expectHashView(mapPage, (view) => view.bearing === 330);
    await page.keyboard.press("0");
    await expectHashView(mapPage, (view) => view.bearing === 0);

    await page.keyboard.press("Shift+ArrowRight");
    await mapPage.compassButton.click();
    await expectHashView(mapPage, (view) => view.bearing === 0);
  });

  test("Shift with up or down pans further, and the raster basemap rotates too", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(`${START}&basemap=${RASTER_BASEMAP_ID}`);
    await mapPage.focusMap();
    await page.keyboard.press("ArrowUp");
    await expectHashView(mapPage, (view) => view.lat > 10.5);
    const step = ((await mapPage.hashView())?.lat ?? 0) - 10;

    await page.keyboard.press("Shift+ArrowUp");
    // One Shift press pans three plain steps; Mercator latitude shrinks per
    // pixel going north, so the total is a little under four steps but well
    // over three.
    await expectHashView(mapPage, (view) => view.lat - 10 > 3 * step);
    expect((await mapPage.hashView())?.bearing).toBe(0);

    await page.keyboard.press("Shift+ArrowRight");
    await expectHashView(mapPage, (view) => view.bearing === 15);
    await expect(mapPage.compassButton).toBeVisible();
    await expect(mapPage.region).toHaveAccessibleDescription(
      /Shift with left or right arrow: rotate the map./,
    );
  });
});
