import { expect, test } from "./fixtures";
import { E2E } from "./selectors";
import { ensurePanelOpen } from "./ui";

test.describe("shareable map links", () => {
  test("toggling a layer, switching basemap, and switching tabs update the URL, and reopening it restores that view", async ({
    page,
  }) => {
    await page.goto("/");
    await ensurePanelOpen(page);
    await page.getByTestId(E2E.basemapOption.satellite).click();

    const rapidRailCheckbox = page.getByTestId(E2E.layerToggle.rapidRail);
    await rapidRailCheckbox.check();

    await page.getByTestId(E2E.panelTab.story).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("layers"))
      .toBe("rapid-rail");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("basemap"))
      .toBe("satellite");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("panel"))
      .toBe("story");

    const sharedUrl = page.url();
    await page.goto(sharedUrl);
    await ensurePanelOpen(page);

    // The restored view opens on the Story tab (per `panel=story`), so the
    // layer toggles below aren't rendered until switching back to it.
    await expect(
      page.getByRole("heading", { name: "Why this map exists" }),
    ).toBeVisible();
    await expect(
      page.locator(".leaflet-tile-pane img").first(),
    ).toHaveAttribute("src", /arcgisonline\.com/);

    await page.getByTestId(E2E.panelTab.layers).click();
    await expect(page.getByTestId(E2E.layerToggle.rapidRail)).toBeChecked();
  });

  test("selecting a map feature updates the URL, and reopening it restores that selection", async ({
    page,
  }) => {
    await page.goto("/");

    await ensurePanelOpen(page);
    await page.getByTestId(E2E.layerToggle.townships).check();
    await page.getByTestId(E2E.panelToggle).click();

    const searchInput = page.getByTestId(E2E.locationSearchInput);
    await searchInput.focus();
    await searchInput.fill("Botshabelo");

    // The feature list populates asynchronously after the search box itself
    // is already interactive, so wait for the option to appear before
    // driving it by keyboard; see map-feature-accessibility.spec.ts.
    await expect(page.getByRole("option", { name: "Botshabelo" })).toBeVisible({
      timeout: 15_000,
    });
    await searchInput.press("ArrowDown");
    await searchInput.press("Enter");

    const details = page.getByTestId(E2E.featureDetails);
    await expect(details).toBeVisible({ timeout: 15_000 });
    await expect(details.locator("h2")).toHaveText("Botshabelo");

    await expect
      .poll(() => new URL(page.url()).searchParams.get("feature"))
      .not.toBeNull();

    const sharedUrl = page.url();
    await page.goto(sharedUrl);

    const restoredDetails = page.getByTestId(E2E.featureDetails);
    await expect(restoredDetails).toBeVisible({ timeout: 15_000 });
    await expect(restoredDetails.locator("h2")).toHaveText("Botshabelo");
  });

  test("a plain visit with no query string carries no permalink params", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    expect(new URL(page.url()).search).toBe("");
  });
});
