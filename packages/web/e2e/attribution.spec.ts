import { expect, test } from "./fixtures";

test.describe("map credits", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens a labelled region of real links and returns focus on Escape", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    const button = mapPage.creditsButton;
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const regionId = await button.getAttribute("aria-controls");
    expect(regionId).toBeTruthy();
    await expect(mapPage.creditsRegion).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(mapPage.creditsRegion).toBeVisible();
    await expect(mapPage.creditsRegion).toHaveAttribute("id", regionId ?? "");
    const osm = mapPage.creditsRegion.getByRole("link", {
      name: "© OpenStreetMap contributors",
    });
    await expect(osm).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    await expect(osm).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(
      mapPage.creditsRegion.getByRole("link", { name: "OpenFreeMap" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(mapPage.creditsRegion).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("a second press, a press outside and a map move all close it", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.creditsButton.click();
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toBeHidden();
    await expect(mapPage.creditsButton).toBeFocused();

    await mapPage.creditsButton.click();
    await mapPage.searchInput.click();
    await expect(mapPage.creditsRegion).toBeHidden();

    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion).toBeVisible();
    // Focus moves without a pointer, so only the map moving can close it.
    await mapPage.focusMap();
    await expect(mapPage.creditsRegion).toBeVisible();
    await page.keyboard.press("+");
    await expect(mapPage.creditsRegion).toBeHidden();
  });
});
