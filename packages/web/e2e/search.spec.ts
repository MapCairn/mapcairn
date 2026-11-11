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
    // Typing alone sends nothing (Nominatim forbids autocomplete). Absence
    // has no event to wait for, so wait well past any debounce first.
    await expect(mapPage.searchSubmit).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.waitForTimeout(600);
    expect(await searchedQueries(page)).toEqual([]);
    await expect(input).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
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
    await expect(mapPage.searchPanel).toContainText("Searching...");
    await mapPage.search("cape t");
    await expect(mapPage.searchOptions).toHaveText([/Cape Town/]);
    expect(await searchedQueries(page)).toEqual(["cape", "cape t"]);
    await page.waitForTimeout(1_000);
    await expect(mapPage.searchOptions).toHaveCount(1);
  });

  test("the Search button searches, and Enter on the same text only reopens the list", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await expect(mapPage.searchSubmit).toHaveAttribute("aria-disabled", "true");
    await mapPage.searchInput.fill("cape");
    await mapPage.searchSubmit.click();
    await expect(mapPage.searchOptions).toHaveCount(3);
    await expect(mapPage.searchInput).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(mapPage.searchInput).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(mapPage.searchInput).toHaveAttribute("aria-expanded", "true");
    expect(await searchedQueries(page)).toEqual(["cape"]);
  });

  test("the Search button is reachable from the box with Tab", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.searchInput.fill("cape");
    // The Clear button comes first, then Search.
    await page.keyboard.press("Tab");
    await expect(mapPage.searchClear).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mapPage.searchSubmit).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(mapPage.searchOptions).toHaveCount(3);
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

  test("a coordinate pair is its own result, picked like any other", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.search("-26.2041, 28.0473");
    await expect(mapPage.searchOptions).toHaveText([
      "Coordinates 26.20410° S, 28.04730° E",
    ]);
    await expect(mapPage.searchPanel).not.toContainText("Searching");
    await expect
      .poll(() => mapPage.announcements())
      .toContain("1 result, Coordinates 26.20410° S, 28.04730° E");

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(mapPage.searchInput).toHaveValue(
      "Coordinates 26.20410° S, 28.04730° E",
    );
    await expect(mapPage.searchInput).toBeFocused();
    await expect
      .poll(async () => (await mapPage.hashView())?.lat)
      .toBeCloseTo(-26.2041, 3);
    const view = await mapPage.hashView();
    expect(view?.lng).toBeCloseTo(28.0473, 3);
    expect(view?.zoom).toBe(14);
    expect(await searchedQueries(page)).toEqual([]);
  });

  test("degrees, minutes and seconds name the same place", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.search(`26°12'14.8"S 28°02'50.3"E`);
    await expect(mapPage.searchOptions).toHaveText([
      "Coordinates 26.20411° S, 28.04731° E",
    ]);
    await mapPage.searchOptions.first().click();
    await expect
      .poll(async () => (await mapPage.hashView())?.lng)
      .toBeCloseTo(28.0473, 3);
    expect(await searchedQueries(page)).toEqual([]);
  });

  test("text that only looks like numbers is searched as a place", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    await mapPage.search("2196");
    await expect(mapPage.searchOptions).toHaveCount(3);
    await mapPage.search("02-123");
    await mapPage.search("12 34");
    await mapPage.search("95, 200");
    await expect
      .poll(() => searchedQueries(page))
      .toEqual(["2196", "02-123", "12 34", "95, 200"]);
  });

  test.describe("through the real Nominatim adapter", () => {
    test("a coordinate pair sends no request to the geocoder", async ({
      page,
      mapPage,
    }) => {
      const requests: string[] = [];
      page.on("request", (request) => {
        if (GEOCODER_SEARCH_PATTERN.test(request.url())) {
          requests.push(request.url());
        }
      });
      await mapPage.goto();
      await mapPage.search("-26.2041, 28.0473");
      await expect(mapPage.searchOptions).toHaveCount(1);
      await mapPage.searchOptions.first().click();
      await expect
        .poll(async () => (await mapPage.hashView())?.lat)
        .toBeCloseTo(-26.2041, 3);
      await mapPage.search("Soweto");
      await expect(mapPage.searchOptions).toHaveCount(1);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain("Soweto");
    });

    test("finds places anywhere, with no coverage restriction, favouring the visible map", async ({
      page,
      mapPage,
    }) => {
      // Open on a known view: the address is only written when the map moves.
      await mapPage.goto("#map=6/-26.2/28");
      const view = { lat: -26.2, lng: 28 };
      const request = page.waitForRequest(GEOCODER_SEARCH_PATTERN);
      await mapPage.search("Soweto");
      // The visible map is sent as a viewbox bias: west,north,east,south.
      const viewbox = new URL((await request).url()).searchParams.get(
        "viewbox",
      );
      const [west, north, east, south] = (viewbox ?? "").split(",").map(Number);
      expect(west).toBeLessThan(view.lng);
      expect(east).toBeGreaterThan(view.lng);
      expect(south).toBeLessThan(view.lat);
      expect(north).toBeGreaterThan(view.lat);
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
