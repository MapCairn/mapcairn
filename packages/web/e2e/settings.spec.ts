import { expect, test } from "./fixtures";
import { scriptMemorySettings } from "./support/services";

test.describe("settings", () => {
  test.use({ reducedMotion: "reduce" });

  test("units switch the scale bar to imperial and are remembered", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto("#map=12.00/51.50000/-0.12000");
    await expect(mapPage.scaleBar).toHaveAccessibleName(/(metre|kilometre)/);
    await mapPage.openSettings();
    const units = page.getByRole("radiogroup", { name: "Units" });
    await expect(units.getByRole("radio", { name: "Metric" })).toBeChecked();
    await units.getByRole("radio", { name: "Imperial" }).click();
    await expect(mapPage.scaleBar).toHaveAccessibleName(/(foot|feet|mile)/);

    await page.reload();
    await mapPage.waitForMap();
    await expect(mapPage.scaleBar).toHaveAccessibleName(/(foot|feet|mile)/);
    await expect(page.getByTestId("settings-not-saved")).toHaveCount(0);
  });

  test("a theme override wins over the system and survives a reload", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await mapPage.goto();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");

    await mapPage.openSettings();
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
    await theme.getByRole("radio", { name: "Dark" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(() => localStorage.getItem("mapcairn:theme")),
    ).toBe("dark");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await mapPage.waitForMap();

    await mapPage.openSettings();
    await theme.getByRole("radio", { name: "System" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html).toHaveAttribute("data-theme", "dark");
  });

  test("the zoom buttons switch shows and hides the zoom group", async ({
    page,
    mapPage,
    isMobile,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    const zoomSwitch = page.getByRole("switch", { name: "Show zoom buttons" });
    // On by default with a mouse, off on touch screens.
    if (isMobile) {
      await expect(zoomSwitch).not.toBeChecked();
      await expect(mapPage.zoomControls).toHaveCount(0);
    } else {
      await expect(zoomSwitch).toBeChecked();
      await expect(mapPage.zoomControls).toBeVisible();
    }
    await zoomSwitch.click();
    if (isMobile) {
      await expect(mapPage.zoomControls).toBeVisible();
    } else {
      await expect(mapPage.zoomControls).toHaveCount(0);
    }
  });

  test("says when changes cannot be remembered", async ({ page, mapPage }) => {
    await scriptMemorySettings(page);
    await mapPage.goto();
    await mapPage.openSettings();
    await expect(page.getByTestId("settings-not-saved")).toHaveText(
      "Changes will not be remembered on this device.",
    );
    // The in-memory store still works for this visit.
    await page
      .getByRole("radiogroup", { name: "Units" })
      .getByRole("radio", { name: "Imperial" })
      .click();
    await expect(mapPage.scaleBar).toHaveAccessibleName(/(foot|feet|mile)/);
  });

  test("links to the privacy policy", async ({ page, mapPage }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    await page.getByRole("link", { name: "Read the privacy policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: /privacy/i }),
    ).toBeVisible();
  });
});

test.describe("reduced motion", () => {
  test("with reduced motion the scale bar never fades and motion tokens collapse", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mapPage.goto();
    await page.waitForTimeout(2_500);
    await expect(mapPage.scaleBar).toHaveAttribute("data-idle", "false");
    await mapPage.openSettings();
    const durations = await mapPage.sheet.evaluate((sheet) =>
      getComputedStyle(sheet)
        .transitionDuration.split(",")
        .map((value) => Number.parseFloat(value)),
    );
    expect(Math.max(...durations)).toBeLessThan(0.001);
  });

  test("without reduced motion the scale bar fades when idle", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await mapPage.goto();
    await expect(mapPage.scaleBar).toHaveAttribute("data-idle", "true", {
      timeout: 5_000,
    });
  });
});
