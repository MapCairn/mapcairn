import { expect, test } from "./fixtures";
import { GEOCODER_REVERSE_PATTERN } from "./support/network";
import { copiedText, scriptClipboard } from "./support/services";

/** A view whose centre is easy to read back from the pin card. */
const START = "#map=10.00/-26.20000/28.04000";

test.describe("pin", () => {
  test.use({ reducedMotion: "reduce" });

  test("a long press drops a pin there and opens its card", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    // Away from the centre, so the coordinates differ from the map centre.
    await mapPage.longPress(box.width / 2 + 60, box.height / 2 - 40);

    await expect(mapPage.pinMarker).toBeVisible();
    await expect(mapPage.pinCard).toBeVisible();
    await expect(mapPage.pinHeading).toBeFocused();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
    const text = (await mapPage.pinCoordinates.textContent()) ?? "";
    const [lat, lng] = text.split(",").map(Number);
    expect(lat).toBeGreaterThan(-26.2);
    expect(lng).toBeGreaterThan(28.04);
    await expect
      .poll(() => mapPage.announcements())
      .toContain(`Pin dropped at ${text}`);
  });

  test("a right-click drops a pin, and a plain click does not", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.host.click({ position: { x: 100, y: 120 } });
    await page.waitForTimeout(800);
    await expect(mapPage.pinMarker).toHaveCount(0);

    await mapPage.host.click({ button: "right", position: { x: 100, y: 120 } });
    await expect(mapPage.pinMarker).toBeVisible();
    await expect(mapPage.pinCard).toBeVisible();
  });

  test("a press that moves is a pan, not a pin", async ({ page, mapPage }) => {
    await mapPage.goto(START);
    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 240, { steps: 5 });
    await page.waitForTimeout(700);
    await page.mouse.up();
    await expect(mapPage.pinMarker).toHaveCount(0);
  });

  test("'Drop pin at map centre' drops a pin at the centre, and the card shows the address", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await mapPage.dropPinButton.click();

    await expect(mapPage.pinCard).toBeVisible();
    await expect(mapPage.pinCoordinates).toHaveText("-26.20000, 28.04000");
    await expect(mapPage.pinAddress).toContainText("Diepkloof");
    await expect(mapPage.page.getByTestId("pin-note")).toHaveText(
      "A pin is on the map.",
    );
  });

  test("says when there is no address at the pin", async ({
    page,
    mapPage,
  }) => {
    await page.route(GEOCODER_REVERSE_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unable to geocode" }),
      }),
    );
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");
    await expect(mapPage.pinAddress).toHaveText("No address found here.");
  });

  test("copies the coordinates and says so", async ({ page, mapPage }) => {
    await scriptClipboard(page);
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");
    await mapPage.pinCopyButton.click();

    await expect(mapPage.pinCopyFeedback).toHaveText("Copied");
    expect(await copiedText(page)).toEqual(["-26.20000, 28.04000"]);
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Coordinates copied");
  });

  test("says when the coordinates could not be copied", async ({
    page,
    mapPage,
  }) => {
    await scriptClipboard(page, false);
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");
    await mapPage.pinCopyButton.click();

    await expect(mapPage.pinCopyFeedback).toHaveText("Could not copy");
    await expect
      .poll(() => mapPage.announcements())
      .toContain(
        "Could not copy. Select the coordinates and copy them manually.",
      );
  });

  test("Clear pin removes it and closes the card", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");
    await mapPage.pinClearButton.click();

    await expect(mapPage.pinMarker).toHaveCount(0);
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect.poll(() => mapPage.announcements()).toContain("Pin removed");
    await expect(mapPage.region).toBeFocused();
  });
});
