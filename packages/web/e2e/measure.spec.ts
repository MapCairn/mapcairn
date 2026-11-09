import { expect, test } from "./fixtures";
import { seedStoredSettings } from "./support/services";

const START = "#map=12.00/51.50000/-0.12000";

test.describe("measure", () => {
  test.use({ reducedMotion: "reduce" });

  test("is off by default, and Measure opens the toolbar with focus inside", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await expect(mapPage.measureToolbar).toHaveCount(0);
    await expect(mapPage.measureButton).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await mapPage.startMeasuring();
    await expect(mapPage.measureButton).toHaveAttribute("aria-pressed", "true");
    await expect(mapPage.measureToolbar.locator(":focus")).toHaveCount(1);
    await expect(mapPage.measureToolbar).toContainText(
      "Tap the map to add points, or use Add point at map centre.",
    );
    await expect(mapPage.measureUndo).toBeDisabled();
    await expect(mapPage.measureClear).toBeDisabled();
  });

  test("measures a distance from points added at the map centre", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startMeasuring();
    await mapPage.measureAddPoint.click();
    await mapPage.focusMap();
    await page.keyboard.press("Shift+ArrowDown");
    await expect
      .poll(async () => (await mapPage.hashView())?.lat ?? 99)
      .toBeLessThan(51.5);
    await mapPage.measureAddPoint.click();

    await expect(mapPage.measureReadout).toHaveText(/^[\d.,]+ (m|km)$/);
    await expect(mapPage.measureOverlay).toHaveAttribute(
      "data-mode",
      "distance",
    );
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(expect.stringMatching(/^Total distance /));
  });

  test("clicks on the map add points, and Area measures an area", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startMeasuring();
    await mapPage.measureToolbar.getByRole("radio", { name: "Area" }).click();
    await expect(mapPage.measureOverlay).toHaveAttribute("data-mode", "area");

    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    for (const [x, y] of [
      [box.width / 2 - 80, box.height / 2 - 80],
      [box.width / 2 + 80, box.height / 2 - 80],
      [box.width / 2, box.height / 2 + 40],
    ] as const) {
      await mapPage.host.click({ position: { x, y } });
    }
    await expect(mapPage.measureReadout).toHaveText(/(m²|km²|ha)$/);
    await expect(mapPage.pinMarker).toHaveCount(0);
  });

  test("Undo removes the last point and Clear removes them all, keeping the toolbar", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startMeasuring();
    await mapPage.measureAddPoint.click();
    await mapPage.focusMap();
    await page.keyboard.press("ArrowRight");
    await mapPage.measureAddPoint.click();
    await expect(mapPage.measureReadout).toHaveText(/\d/);
    const twoPoints = await mapPage.measureReadout.textContent();

    await mapPage.focusMap();
    await page.keyboard.press("ArrowRight");
    await mapPage.measureAddPoint.click();
    await expect(mapPage.measureReadout).not.toHaveText(twoPoints ?? "");
    await mapPage.measureUndo.click();
    await expect(mapPage.measureReadout).toHaveText(twoPoints ?? "");

    await mapPage.measureClear.click();
    await expect(mapPage.measureClear).toBeDisabled();
    await expect(mapPage.measureToolbar).toBeVisible();
    await expect(mapPage.measureReadout).not.toHaveText(twoPoints ?? "");
  });

  test("Done and Escape close the toolbar and return focus to Measure", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startMeasuring();
    await mapPage.measureDone.click();
    await expect(mapPage.measureToolbar).toHaveCount(0);
    await expect(mapPage.measureButton).toBeFocused();
    await expect(mapPage.measureButton).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await mapPage.startMeasuring();
    await page.keyboard.press("Escape");
    await expect(mapPage.measureToolbar).toHaveCount(0);
    await expect(mapPage.measureButton).toBeFocused();
  });

  test("uses imperial units when they are chosen", async ({
    page,
    mapPage,
  }) => {
    await seedStoredSettings(page, { units: "imperial" });
    await mapPage.goto(START);
    await mapPage.startMeasuring();
    await mapPage.measureAddPoint.click();
    await mapPage.focusMap();
    await page.keyboard.press("Shift+ArrowDown");
    await mapPage.measureAddPoint.click();
    await expect(mapPage.measureReadout).toHaveText(/(ft|mi)$/);
  });
});
