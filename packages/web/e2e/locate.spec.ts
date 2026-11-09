import { expect, test } from "./fixtures";
import { scriptGeolocation, updateGeolocationScript } from "./support/services";

/** Every way finding the location can fail, with the message the banner shows. */
const FAILURES = [
  {
    outcome: "denied",
    message:
      "Location access is blocked. Allow it in your browser settings, or search for a place instead.",
  },
  {
    outcome: "timeout",
    message:
      "Finding your location took too long. Try again, or search for a place instead.",
  },
  {
    outcome: "unavailable",
    message:
      "Your location is not available right now. Check that location services are on, or search for a place instead.",
  },
] as const;

test.describe("locate me", () => {
  test.use({ reducedMotion: "reduce" });

  test("flies to the fix, draws its accuracy and announces it", async ({
    page,
    mapPage,
  }) => {
    await scriptGeolocation(page, {
      outcome: "fix",
      lat: -33.9249,
      lng: 18.4241,
      accuracyMetres: 25,
    });
    await mapPage.goto("#map=3.00/0.00000/0.00000");
    await mapPage.locateButton.click();

    await expect(mapPage.accuracyCircle).toBeAttached();
    await expect
      .poll(async () => (await mapPage.hashView())?.lat ?? 0)
      .toBeCloseTo(-33.9249, 3);
    expect((await mapPage.hashView())?.lng).toBeCloseTo(18.4241, 3);
    expect((await mapPage.hashView())?.zoom).toBeGreaterThanOrEqual(15);
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Location found, accuracy about 25 metres");
    await expect(mapPage.locateError).toHaveCount(0);
  });

  test("is busy while it looks", async ({ page, mapPage }) => {
    await scriptGeolocation(page, {
      outcome: "fix",
      lat: 1,
      lng: 1,
      accuracyMetres: 10,
      delayMs: 2_000,
    });
    await mapPage.goto();
    await mapPage.locateButton.click();
    await expect(mapPage.locateButton).toHaveAttribute("aria-busy", "true");
    await expect(mapPage.accuracyCircle).toBeAttached({ timeout: 5_000 });
    await expect(mapPage.locateButton).not.toHaveAttribute("aria-busy", "true");
  });

  for (const { outcome, message } of FAILURES) {
    test(`explains a ${outcome} location in an alert`, async ({
      page,
      mapPage,
    }) => {
      await scriptGeolocation(page, { outcome });
      await mapPage.goto();
      await mapPage.locateButton.click();

      await expect(mapPage.locateError).toBeVisible();
      await expect(mapPage.locateError).toContainText(message);
      await expect(
        page.getByRole("alert").filter({ hasText: message }),
      ).toBeVisible();
      await expect(mapPage.accuracyCircle).toHaveCount(0);
    });
  }

  test("says location is unavailable on a browser without geolocation", async ({
    page,
    mapPage,
  }) => {
    await scriptGeolocation(page, { outcome: "absent" });
    await mapPage.goto();
    await mapPage.locateButton.click();
    await expect(mapPage.locateError).toContainText(
      "Your location is not available right now.",
    );
  });

  test("Try again recovers, and the banner can be dismissed", async ({
    page,
    mapPage,
  }) => {
    await scriptGeolocation(page, { outcome: "denied" });
    await mapPage.goto();
    await mapPage.locateButton.click();
    await expect(mapPage.locateError).toBeVisible();

    await updateGeolocationScript(page, {
      outcome: "fix",
      lat: 10,
      lng: 10,
      accuracyMetres: 50,
    });
    await mapPage.locateError
      .getByRole("button", { name: "Try again" })
      .click();
    await expect(mapPage.locateError).toHaveCount(0);
    await expect(mapPage.accuracyCircle).toBeAttached();

    await updateGeolocationScript(page, { outcome: "timeout" });
    await mapPage.locateButton.click();
    await expect(mapPage.locateError).toBeVisible();
    const dismiss = mapPage.locateError.getByRole("button").last();
    await expect(dismiss).not.toHaveAccessibleName("Try again");
    await dismiss.click();
    await expect(mapPage.locateError).toHaveCount(0);
  });
});
