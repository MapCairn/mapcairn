import { expect, test } from "./fixtures";
import { collapseCredits, waitForStableLayout } from "./support/states";

/*
 * The brand row at the top of the sheet and side panel (DESIGN.md, `Sheet`):
 * the MapCairn mark and name above the title, decorative, with the title
 * still the accessible name. The bottom sheet leaves it out at the peek
 * detent.
 */

test.use({ reducedMotion: "reduce", fastCredits: true });

test.describe("brand in the side panel", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("sits above the title, decorative, with nothing to focus", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    await collapseCredits(mapPage);
    await mapPage.mapOptionsButton.click();
    await waitForStableLayout(mapPage.page);

    await expect(mapPage.sheetBrand).toBeVisible();
    await expect(mapPage.sheetBrand).toHaveAttribute("aria-hidden", "true");
    await expect(mapPage.brandMark).toBeVisible();
    await expect(mapPage.brandName).toHaveText("MapCairn");
    expect(
      await mapPage.sheetBrand.locator("button, a, [tabindex]").count(),
    ).toBe(0);

    const brand = await mapPage.sheetBrand.boundingBox();
    const title = await mapPage.sheetHeading.boundingBox();
    if (!(brand && title)) {
      throw new Error("A box is missing.");
    }
    expect(brand.y + brand.height).toBeLessThanOrEqual(title.y + 1);

    // The title still names the region.
    await expect(
      mapPage.page.getByRole("complementary", { name: "Map options" }),
    ).toBeVisible();
  });

  test("is at the top of Settings and Directions too", async ({ mapPage }) => {
    await mapPage.goto();
    await collapseCredits(mapPage);
    await mapPage.settingsButton.click();
    await expect(mapPage.sheetBrand).toBeVisible();
    await mapPage.directionsButton.click();
    await expect(mapPage.sheetBrand).toBeVisible();
  });
});

test.describe("brand in the bottom sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows at half and full and is left out at peek", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    await collapseCredits(mapPage);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "half");
    await expect(mapPage.sheetBrand).toBeVisible();

    await mapPage.sheetHandle.focus();
    await mapPage.page.keyboard.press("ArrowUp");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await expect(mapPage.sheetBrand).toBeVisible();

    await mapPage.page.keyboard.press("ArrowDown");
    await mapPage.page.keyboard.press("ArrowDown");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "peek");
    await expect(mapPage.sheetBrand).toBeHidden();
  });
});
