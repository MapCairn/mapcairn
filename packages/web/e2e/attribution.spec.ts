// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { collapseCredits, waitForCreditsCollapsed } from "./support/states";

test.describe("map credits", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  test("opens a labelled region of real links and returns focus on Escape", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await collapseCredits(mapPage);
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
    await collapseCredits(mapPage);
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

/*
 * The first showing runs on the app's own five-second timer, so these
 * wait for the real one: none of them fast-forwards the clock.
 */
test.describe("map credits first showing", () => {
  test.use({ reducedMotion: "reduce" });

  test("are shown on first load without taking focus, then collapse by themselves", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    // The OpenStreetMap attribution guidelines: shown before they may collapse.
    await expect(mapPage.creditsButton).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(mapPage.creditsRegion).toBeVisible();
    await expect(
      mapPage.creditsRegion.getByRole("link", {
        name: "© OpenStreetMap contributors",
      }),
    ).toBeVisible();
    await expect(mapPage.creditsButton).not.toBeFocused();
    await expect(
      mapPage.creditsRegion.getByRole("link").first(),
    ).not.toBeFocused();

    await waitForCreditsCollapsed(mapPage);
    await expect(mapPage.creditsButton).not.toBeFocused();
  });

  test.describe("with motion allowed", () => {
    test.use({ reducedMotion: "no-preference" });

    test("fade out before they close, and the button already says collapsed", async ({
      mapPage,
    }) => {
      await mapPage.goto();
      await expect(mapPage.creditsRegion).toBeVisible();
      // The fade lasts 200 ms, too short for polling to catch, so watch the
      // popover change from inside the page.
      const expandedWhileFading = await mapPage.creditsRegion.evaluate(
        (region) =>
          new Promise<string | null>((resolve) => {
            const button = region.parentElement?.querySelector("button");
            const observer = new MutationObserver(() => {
              if (
                region.hasAttribute("hidden") ||
                region.dataset.closing === "true"
              ) {
                observer.disconnect();
                resolve(
                  region.hasAttribute("hidden")
                    ? "hidden without fading"
                    : (button?.getAttribute("aria-expanded") ?? null),
                );
              }
            });
            observer.observe(region, { attributes: true });
          }),
      );
      expect(expandedWhileFading).toBe("false");
      await expect(mapPage.creditsRegion).toBeHidden();
    });
  });

  test("collapse on the first zoom, before their time is up", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await expect(mapPage.creditsRegion).toBeVisible();
    await mapPage.focusMap();
    await expect(mapPage.creditsRegion).toBeVisible();
    await page.keyboard.press("+");
    // Well inside the five seconds the credits would otherwise stay.
    await expect(mapPage.creditsButton).toHaveAttribute(
      "aria-expanded",
      "false",
      { timeout: 2_000 },
    );
    await expect(mapPage.creditsRegion).toBeHidden({ timeout: 2_000 });
  });
});
