import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { GEOCODER_REVERSE_PATTERN } from "./support/network";
import { copiedText, scriptClipboard } from "./support/services";
import {
  LONG_PRESS_DELAY_MS,
  settleFrames,
  TIMER_SLACK_MS,
} from "./support/timers";

/** A view whose centre is easy to read back from the pin card. */
const START = "#map=10.00/-26.20000/28.04000";

/**
 * Records every Nominatim reverse request, then lets the shared mock answer
 * it. Routes registered later are tried first, so this sees the request
 * before the fixture's stub does.
 */
async function recordReverseRequests(page: Page): Promise<string[]> {
  const urls: string[] = [];
  await page.route(GEOCODER_REVERSE_PATTERN, (route) => {
    urls.push(route.request().url());
    return route.fallback();
  });
  return urls;
}

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
    await page.clock.install();
    await mapPage.goto(START);
    await mapPage.host.click({ position: { x: 100, y: 120 } });
    // Run the clock past a long press, so a press the click failed to end
    // would have dropped its pin by now.
    await page.clock.runFor(LONG_PRESS_DELAY_MS + TIMER_SLACK_MS);
    await settleFrames(page);
    await expect(mapPage.pinMarker).toHaveCount(0);

    await mapPage.host.click({ button: "right", position: { x: 100, y: 120 } });
    await expect(mapPage.pinMarker).toBeVisible();
    await expect(mapPage.pinCard).toBeVisible();
  });

  test("a press that moves is a pan, not a pin", async ({ page, mapPage }) => {
    await page.clock.install();
    await mapPage.goto(START);
    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 240, { steps: 5 });
    // Hold past a long press: one the move failed to cancel would fire now.
    await page.clock.runFor(LONG_PRESS_DELAY_MS + TIMER_SLACK_MS);
    await page.mouse.up();
    await settleFrames(page);
    await expect(mapPage.pinMarker).toHaveCount(0);
  });

  test("'Drop pin at map centre' drops a pin at the centre, and the card shows the address once asked", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await mapPage.dropPinButton.click();

    await expect(mapPage.pinCard).toBeVisible();
    await expect(mapPage.pinCoordinates).toHaveText("-26.20000, 28.04000");
    await expect(mapPage.pinAddress).toHaveCount(0);
    await mapPage.pinLookupButton.click();
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
    await mapPage.pinLookupButton.click();
    await expect(mapPage.pinAddress).toHaveText("No address found here.");
  });

  test("sends nothing to Nominatim until Look up address is pressed, and says what it sends", async ({
    page,
    mapPage,
  }) => {
    const requests = await recordReverseRequests(page);
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");

    await expect(mapPage.pinCard).toBeVisible();
    await expect(mapPage.pinLookupButton).toBeVisible();
    await expect(mapPage.pinLookupNote).toHaveText(
      "Sends the pin's position, to about 11 m, to OpenStreetMap's Nominatim service.",
    );
    await expect(mapPage.pinLookupButton).toHaveAccessibleDescription(
      /Nominatim/,
    );
    // Give a request that should not happen time to be made.
    await page.waitForTimeout(1_000);
    expect(requests).toHaveLength(0);
    await expect(mapPage.pinAddress).toHaveCount(0);

    await mapPage.pinLookupButton.click();
    await expect(mapPage.pinAddress).toContainText("Diepkloof");
    expect(requests).toHaveLength(1);
  });

  test("sends the pin's position rounded to four decimal places", async ({
    page,
    mapPage,
  }) => {
    const requests = await recordReverseRequests(page);
    await mapPage.goto(START);
    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    await mapPage.longPress(box.width / 2 + 63, box.height / 2 - 41);
    await expect(mapPage.pinCard).toBeVisible();
    const [lat, lng] = ((await mapPage.pinCoordinates.textContent()) ?? "")
      .split(",")
      .map(Number);

    await mapPage.pinLookupButton.click();
    await expect(mapPage.pinAddress).toBeVisible();
    expect(requests).toHaveLength(1);
    const query = new URL(requests[0] ?? "").searchParams;
    for (const [name, shown] of [
      ["lat", lat],
      ["lon", lng],
    ] as const) {
      const sent = query.get(name) ?? "";
      expect(sent).toMatch(/^-?\d+(\.\d{1,4})?$/);
      expect(Math.abs(Number(sent) - (shown ?? Number.NaN))).toBeLessThan(
        0.0001,
      );
    }
  });

  test("shows an error with Try again when the lookup fails, and retries", async ({
    page,
    mapPage,
  }) => {
    let failures = 1;
    await page.route(GEOCODER_REVERSE_PATTERN, (route) => {
      if (failures > 0) {
        failures -= 1;
        return route.fulfill({ status: 500, body: "Server error" });
      }
      return route.fallback();
    });
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");
    await mapPage.pinLookupButton.click();

    await expect(mapPage.pinAddressError).toHaveText(
      "Could not look up the address. Check your connection and try again.",
    );
    await expect(mapPage.pinAddress).toHaveCount(0);
    await expect
      .poll(() => mapPage.announcements())
      .toContain(
        "Could not look up the address. Check your connection and try again.",
      );

    await mapPage.pinLookupRetryButton.click();
    await expect(mapPage.pinAddress).toContainText("Diepkloof");
    await expect(mapPage.pinAddressError).toHaveCount(0);
  });

  test("moving the pin puts the card back to not looked up", async ({
    page,
    mapPage,
  }) => {
    const requests = await recordReverseRequests(page);
    await mapPage.goto(START);
    await mapPage.focusMap();
    await page.keyboard.press("p");
    await mapPage.pinLookupButton.click();
    await expect(mapPage.pinAddress).toContainText("Diepkloof");

    await mapPage.focusMap();
    await page.keyboard.press("Escape");
    await mapPage.focusMap();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => (await mapPage.hashView())?.lng ?? 0)
      .toBeGreaterThan(28.04);
    await page.keyboard.press("p");

    await expect(mapPage.pinCoordinates).not.toHaveText("-26.20000, 28.04000");
    await expect(mapPage.pinAddress).toHaveCount(0);
    await expect(mapPage.pinLookupButton).toBeVisible();
    expect(requests).toHaveLength(1);
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
