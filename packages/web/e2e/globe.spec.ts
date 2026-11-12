import { mercatorUnproject, NORMALISED_TILE_SIZE } from "@mapcairn/core";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";

/*
 * Map shape: Flat is the default, Globe is a Settings choice that is
 * remembered, and an overlay on the far side of a globe is not drawn.
 */

const VIEW = "#map=2.00/0.00000/0.00000";

const POPULATION_TILE =
  /GPW_Population_Density_2020\/default\/GoogleMapsCompatible_Level7\/(\d+)\/(\d+)\/\d+\.png/;

/** The latitude, in degrees, of the northern edge of row `y` at tile level `z`. */
function tileNorthLatitude(z: number, y: number): number {
  return mercatorUnproject({ x: 0, y: y * NORMALISED_TILE_SIZE }, z).lat;
}

function shapeGroup(page: Page) {
  return page.getByRole("radiogroup", { name: "Map shape" });
}

test.describe("map shape", () => {
  test.use({ reducedMotion: "reduce" });

  test("the map is flat by default", async ({ page, mapPage }) => {
    await mapPage.goto(VIEW);
    await expect(mapPage.host).toHaveAttribute("data-projection", "flat");
    await mapPage.openSettings();
    await expect(
      shapeGroup(page).getByRole("radio", { name: "Flat" }),
    ).toBeChecked();
    await expect(
      shapeGroup(page).getByRole("radio", { name: "Globe" }),
    ).not.toBeChecked();
  });

  test("choosing Globe redraws the map as a globe, announces it and survives a reload", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(VIEW);
    await mapPage.openSettings();
    await shapeGroup(page).getByRole("radio", { name: "Globe" }).click();
    await expect(mapPage.host).toHaveAttribute("data-projection", "globe");
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Map shape: globe");
    expect(
      await page.evaluate(() => localStorage.getItem("mapcairn:projection")),
    ).toBe('"globe"');
    // The address still holds the same view, in the same zoom units.
    expect(await page.evaluate(() => window.location.hash)).toContain(
      "#map=2.00/0.00000/0.00000",
    );

    await page.reload();
    await mapPage.waitForMap();
    await expect(mapPage.host).toHaveAttribute("data-projection", "globe");
    await mapPage.openSettings();
    await expect(
      shapeGroup(page).getByRole("radio", { name: "Globe" }),
    ).toBeChecked();

    await shapeGroup(page).getByRole("radio", { name: "Flat" }).click();
    await expect(mapPage.host).toHaveAttribute("data-projection", "flat");
  });

  test("paints the space around a globe in its own colour, from the first paint after a reload", async ({
    page,
    mapPage,
  }) => {
    const colours = () =>
      page.evaluate(() => {
        const host = document.querySelector("[data-map-host]") as HTMLElement;
        const engine = host.querySelector(".maplibregl-map") as HTMLElement;
        return [
          getComputedStyle(host).backgroundColor,
          getComputedStyle(engine).backgroundColor,
        ];
      });
    await mapPage.goto(VIEW);
    const [flatHost, flatEngine] = await colours();
    expect(flatEngine).toBe(flatHost);

    await mapPage.openSettings();
    await shapeGroup(page).getByRole("radio", { name: "Globe" }).click();
    await expect.poll(async () => (await colours())[0]).not.toBe(flatHost);
    const [globeHost, globeEngine] = await colours();
    expect(globeEngine).toBe(globeHost);

    // The pre-paint script marks a stored globe, so the placeholder that
    // shows before the app mounts is already the globe's colour.
    await page.reload();
    expect(
      await page.evaluate(() =>
        document.documentElement.getAttribute("data-map-shape"),
      ),
    ).toBe("globe");
    await mapPage.waitForMap();
    expect((await colours())[0]).toBe(globeHost);
  });

  test("the population layer asks for no tile south of 60 degrees south, where its provider serves opaque filler that a globe stretches into wedges at the pole", async ({
    page,
    mapPage,
  }) => {
    const requests = await mockLayerProviders(page);
    await page.addInitScript(() => {
      localStorage.setItem("mapcairn:projection", '"globe"');
    });
    await mapPage.goto("#map=3.00/-80.00000/30.00000&layers=population");
    await expect(mapPage.host).toHaveAttribute("data-projection", "globe");

    const tilesOf = () =>
      requests.urls.flatMap((url) => {
        const match = POPULATION_TILE.exec(url);
        return match ? [{ z: Number(match[1]), y: Number(match[2]) }] : [];
      });
    await expect.poll(() => tilesOf().length).toBeGreaterThan(0);

    const wholly = tilesOf().filter(
      ({ z, y }) => tileNorthLatitude(z, y) <= -60,
    );
    expect(wholly).toEqual([]);
  });

  test("a pin on the far side of a globe is not drawn", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(VIEW);
    await mapPage.openSettings();
    await shapeGroup(page).getByRole("radio", { name: "Globe" }).click();
    await expect(mapPage.host).toHaveAttribute("data-projection", "globe");
    await page.keyboard.press("Escape");

    await mapPage.focusMap();
    await page.keyboard.press("p");
    await expect(mapPage.pinMarker).toBeVisible();

    // Turn the globe with short drags until the pin has gone over the horizon.
    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    const centreX = box.x + box.width / 2;
    // Drag in the upper part of the map: on a phone the pin card's sheet covers the lower half.
    const y = box.y + box.height * 0.3;
    await expect(async () => {
      await page.mouse.move(centreX - 75, y);
      await page.mouse.down();
      await page.mouse.move(centreX + 75, y, { steps: 10 });
      await page.mouse.up();
      await expect(mapPage.pinMarker).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
  });
});
