import { expect, test } from "./fixtures";
import { GEOCODER_SEARCH_PATTERN } from "./support/network";
import {
  SAMPLE_RESULTS,
  scriptSearch,
  searchedQueries,
  updateSearchScript,
} from "./support/services";

test.describe("search", () => {
  test.use({ reducedMotion: "reduce" });

  test("is an ARIA 1.2 combobox whose results never take focus", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    const input = mapPage.searchInput;

    await expect(mapPage.searchLandmark).toBeVisible();
    await expect(input).toHaveAttribute("aria-autocomplete", "list");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    const listboxId = await input.getAttribute("aria-controls");
    expect(listboxId).toBeTruthy();
    // The list is hidden until there are results, so find it by test id.
    await expect(
      mapPage.page.getByTestId("location-search-results"),
    ).toHaveAttribute("id", listboxId ?? "");

    await input.focus();
    await page.keyboard.type("cape");
    await expect(mapPage.searchOptions).toHaveText([
      /Cape Town/,
      /Cape Coast/,
      /Cape Cod/,
    ]);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect.poll(() => mapPage.announcements()).toContain("3 results");

    const options = mapPage.searchOptions;
    const activeIs = async (index: number) => {
      const id = await options.nth(index).getAttribute("id");
      await expect(input).toHaveAttribute("aria-activedescendant", id ?? "");
      await expect(options.nth(index)).toHaveAttribute("aria-selected", "true");
      await expect(input).toBeFocused();
    };

    await page.keyboard.press("ArrowDown");
    await activeIs(0);
    await page.keyboard.press("ArrowDown");
    await activeIs(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await activeIs(0);
    await page.keyboard.press("ArrowUp");
    await activeIs(2);
    await page.keyboard.press("Home");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("Cape Town");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toBeFocused();
    await expect
      .poll(async () => (await mapPage.hashView())?.lat)
      .toBeCloseTo(SAMPLE_RESULTS[0]?.centre.lat ?? 0, 2);
    expect((await mapPage.hashView())?.zoom).toBe(14);

    // Filling the box with the label must not search for it again.
    await page.waitForTimeout(600);
    expect(await searchedQueries(page)).toEqual(["cape"]);
    await expect(mapPage.searchPanel).toBeHidden();
  });

  test("a result with bounds fits them, and a click keeps focus in the box", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.search("cape");
    await mapPage.searchOptions.filter({ hasText: "Cape Cod" }).click();
    await expect(mapPage.searchInput).toHaveValue("Cape Cod");
    await expect(mapPage.searchInput).toBeFocused();
    await expect
      .poll(async () => (await mapPage.hashView())?.lng ?? 0)
      .toBeLessThan(-69.9);
    const view = await mapPage.hashView();
    expect(view?.lng).toBeGreaterThan(-70.7);
    expect(view?.zoom).toBeGreaterThan(6);
    expect(view?.zoom).toBeLessThanOrEqual(16);
  });

  test("Escape closes the list, then clears the text, then reaches the page", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.search("cape");
    await expect(mapPage.searchOptions).toHaveCount(3);

    await page.keyboard.press("Escape");
    await expect(mapPage.searchInput).toHaveAttribute("aria-expanded", "false");
    await expect(mapPage.searchInput).toHaveValue("cape");
    await page.keyboard.press("Escape");
    await expect(mapPage.searchInput).toHaveValue("");
    await expect(mapPage.searchInput).toBeFocused();

    await mapPage.search("cape");
    await expect(mapPage.searchOptions).toHaveCount(3);
    await mapPage.searchClear.click();
    await expect(mapPage.searchInput).toHaveValue("");
    await expect(mapPage.searchInput).toBeFocused();
    await expect(mapPage.searchClear).toHaveCount(0);
  });

  test("shows a searching state while a slow search runs", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page, { delayMs: 2_000 });
    await mapPage.goto();
    await mapPage.search("cape");
    await expect(mapPage.searchPanel).toContainText("Searching...");
    await expect(mapPage.searchOptions).toHaveCount(3, { timeout: 5_000 });
    await expect(mapPage.searchPanel).not.toContainText("Searching...");
  });

  test("a newer query cancels an older one", async ({ page, mapPage }) => {
    await scriptSearch(page, {
      delayMs: 800,
      byQuery: { "cape t": SAMPLE_RESULTS.slice(0, 1) },
    });
    await mapPage.goto();
    await mapPage.search("cape");
    await page.waitForTimeout(400);
    await mapPage.search("cape t");
    await expect(mapPage.searchOptions).toHaveText([/Cape Town/]);
    await page.waitForTimeout(1_000);
    await expect(mapPage.searchOptions).toHaveCount(1);
  });

  test("says when nothing matched", async ({ page, mapPage }) => {
    await scriptSearch(page, { noMatch: ["zzzz"] });
    await mapPage.goto();
    await mapPage.search("zzzz");
    await expect(mapPage.searchPanel).toContainText(
      "Nothing matched that search.",
    );
    await expect(mapPage.searchOptions).toHaveCount(0);
    await expect.poll(() => mapPage.announcements()).toContain("No results");
    await page.keyboard.press("ArrowDown");
    await expect(mapPage.searchInput).not.toHaveAttribute(
      "aria-activedescendant",
      /.+/,
    );
  });

  test("offers Retry when search fails, and recovers", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page, { fail: true });
    await mapPage.goto();
    await mapPage.search("cape");
    await expect(mapPage.searchPanel).toContainText(
      "Search is unavailable right now. Please try again.",
    );
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Search did not work. Try again in a moment.");

    await updateSearchScript(page, { fail: false });
    await mapPage.searchRetry.click();
    await expect(mapPage.searchInput).toBeFocused();
    await expect(mapPage.searchOptions).toHaveCount(3);
    await expect(mapPage.searchRetry).toHaveCount(0);
  });

  test.describe("through the real Nominatim adapter", () => {
    test("finds places anywhere, with no coverage restriction", async ({
      mapPage,
    }) => {
      await mapPage.goto();
      await mapPage.search("Soweto");
      await expect(mapPage.searchOptions).toHaveCount(1);
      await expect(mapPage.searchOptions.first()).toContainText("Soweto");
      await mapPage.searchOptions.first().click();
      await expect
        .poll(async () => (await mapPage.hashView())?.lng ?? 0)
        .toBeGreaterThan(27.75);
    });

    test("tells a rate limit apart from other failures", async ({
      page,
      mapPage,
    }) => {
      await page.route(GEOCODER_SEARCH_PATTERN, (route) =>
        route.fulfill({ status: 429, body: "" }),
      );
      await mapPage.goto();
      await mapPage.search("Soweto");
      await expect(mapPage.searchRetry).toBeVisible();
      await expect
        .poll(() => mapPage.announcements())
        .toContain(
          "Too many searches in a short time. Wait a moment and try again.",
        );
    });

    test("reports being offline when the network is down", async ({
      page,
      context,
      mapPage,
    }) => {
      await mapPage.goto();
      await page.route(GEOCODER_SEARCH_PATTERN, (route) => route.abort());
      await context.setOffline(true);
      await mapPage.search("Soweto");
      await expect(mapPage.searchRetry).toBeVisible();
      await expect
        .poll(() => mapPage.announcements())
        .toContain(
          "You appear to be offline. Check your connection and try again.",
        );
      await context.setOffline(false);
    });
  });
});
