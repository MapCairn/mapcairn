import { expect, test } from "./fixtures";
import {
  DEFAULT_VECTOR_BASEMAP_ID,
  DEFAULT_VECTOR_BASEMAP_NAME,
  RASTER_BASEMAP_ID,
  RASTER_BASEMAP_NAME,
  REMOVED_BASEMAP_ID,
} from "./support/basemaps";

test.describe("permalink", () => {
  test.use({ reducedMotion: "reduce" });

  test("a shared link restores the view and basemap", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto("#map=10.00/-33.92000/18.42000/30&basemap=liberty");
    await expect(mapPage.host).toHaveAttribute("data-zoom", "10.00");
    const view = await mapPage.hashView();
    expect(view).toEqual({ zoom: 10, lat: -33.92, lng: 18.42, bearing: 30 });
    await expect(mapPage.compassButton).toBeVisible();

    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: "Liberty" }),
    ).toBeChecked();
    expect(
      await page.evaluate(() => localStorage.getItem("karta:basemapId")),
    ).toBeNull();
  });

  test("moving the map updates the address without adding history", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto("#map=5.00/10.00000/20.00000");
    const historyLength = await page.evaluate(() => history.length);
    await mapPage.focusMap();
    await page.keyboard.press("+");
    await expect
      .poll(async () => (await mapPage.hashView())?.zoom)
      .toBeGreaterThan(5);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  });

  test("a chosen basemap goes into the address and survives a reload", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(RASTER_BASEMAP_NAME);
    await expect.poll(() => mapPage.hashBasemap()).toBe(RASTER_BASEMAP_ID);
    await page.reload();
    await mapPage.waitForMap();
    expect(await mapPage.hashBasemap()).toBe(RASTER_BASEMAP_ID);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: RASTER_BASEMAP_NAME }),
    ).toBeChecked();
  });

  test("an invalid or unknown address is ignored", async ({ mapPage }) => {
    await mapPage.goto("#map=99/500/abc&basemap=Not_A_Map&layers=removed");
    await expect(mapPage.host).toHaveAttribute("data-zoom", "2.00");
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: DEFAULT_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  for (const retired of ["auto", REMOVED_BASEMAP_ID]) {
    test(`a link to the retired ${retired} basemap opens on the default basemap`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await mapPage.goto(`#map=5.00/10.00000/20.00000&basemap=${retired}`);
      // The address is rewritten when the map next settles.
      await mapPage.focusMap();
      await page.keyboard.press("+");
      await expect
        .poll(() => mapPage.hashBasemap())
        .toBe(DEFAULT_VECTOR_BASEMAP_ID);
      await mapPage.openMapOptions();
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: DEFAULT_VECTOR_BASEMAP_NAME,
        }),
      ).toBeChecked();
    });
  }

  test("without a link the last view is restored", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto("#map=7.00/48.85000/2.35000");
    // The view is saved a second after the map settles from a move.
    await mapPage.focusMap();
    await page.keyboard.press("+");
    await page.keyboard.press("-");
    // The engine round-trips the centre through floating point, so compare
    // numbers, not text.
    await expect
      .poll(async () => {
        const saved = await page.evaluate(() =>
          localStorage.getItem("karta:lastView"),
        );
        const lat = saved ? JSON.parse(saved).center.lat : Number.NaN;
        return Math.abs(lat - 48.85) < 1e-6;
      })
      .toBe(true);
    await mapPage.goto();
    await expect(mapPage.host).toHaveAttribute("data-zoom", "7.00");
    // The address is only written after the next move; P reads the centre now.
    await mapPage.focusMap();
    await page.keyboard.press("p");
    const [lat] = ((await mapPage.pinCoordinates.textContent()) ?? "")
      .split(",")
      .map(Number);
    expect(lat).toBeCloseTo(48.85, 3);
  });
});
