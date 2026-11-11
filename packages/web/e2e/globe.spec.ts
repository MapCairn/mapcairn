import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/*
 * Map shape: Flat is the default, Globe is a Settings choice that is
 * remembered, and an overlay on the far side of a globe is not drawn.
 */

const VIEW = "#map=2.00/0.00000/0.00000";

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
    for (let pass = 0; pass < 8; pass += 1) {
      if ((await mapPage.pinMarker.count()) === 0) {
        break;
      }
      await page.mouse.move(centreX - 75, y);
      await page.mouse.down();
      await page.mouse.move(centreX + 75, y, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    await expect(mapPage.pinMarker).toHaveCount(0);
  });
});
