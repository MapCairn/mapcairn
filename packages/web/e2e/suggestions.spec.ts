import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  photonAnswer,
  SUGGESTED_PLACES,
  SUGGESTION_PATTERN,
} from "./support/network";
import { scriptSearch, searchedQueries } from "./support/services";
import { SUGGEST_DEBOUNCE_MS, TIMER_SLACK_MS } from "./support/timers";

const UNAVAILABLE = "Suggestions are unavailable. Press Enter to search.";

/** Answers every Photon request with the suggested places, and records the queries. */
async function scriptSuggestions(page: Page): Promise<string[]> {
  const queries: string[] = [];
  await page.route(SUGGESTION_PATTERN, (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(photonAnswer(SUGGESTED_PLACES)),
    });
  });
  return queries;
}

/** Jumps the page clock past the debounce, so the request for what was typed goes out. */
async function pauseTyping(page: Page): Promise<void> {
  await page.clock.runFor(SUGGEST_DEBOUNCE_MS + TIMER_SLACK_MS);
}

test.describe("search suggestions", () => {
  test.use({ reducedMotion: "reduce" });

  test("suggests places once typing pauses, in a combobox whose list never takes focus", async ({
    page,
    mapPage,
  }) => {
    const queries = await scriptSuggestions(page);
    await scriptSearch(page);
    await page.clock.install();
    await mapPage.goto();
    const input = mapPage.searchInput;
    await input.focus();
    await input.pressSequentially("cape");
    await pauseTyping(page);

    const options = page
      .getByRole("listbox", { name: "Suggestions" })
      .getByRole("option");
    await expect(options).toHaveText([
      /Cape Point.*Western Cape, South Africa/,
      /Cape Agulhas.*Western Cape, South Africa/,
      /Capetown Road.*South Africa/,
    ]);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    await expect(input).toBeFocused();
    // The four keystrokes were one pause, so one request, for all the text.
    expect(queries).toEqual(["cape"]);
    await expect.poll(() => mapPage.announcements()).toContain("3 suggestions");
    // Typing asks Photon, never the geocoder.
    expect(await searchedQueries(page)).toEqual([]);
  });

  test("sends the text, the limit and the language, and no position", async ({
    page,
    mapPage,
  }) => {
    await page.clock.install();
    const requests: URL[] = [];
    await page.route(SUGGESTION_PATTERN, (route) => {
      requests.push(new URL(route.request().url()));
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(photonAnswer([])),
      });
    });
    await mapPage.goto();
    await mapPage.searchInput.fill("table mountain");
    await pauseTyping(page);
    await expect.poll(() => requests.length).toBe(1);
    expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toEqual({
      q: "table mountain",
      limit: "5",
      lang: "en",
    });
  });

  test("asks nothing for fewer than three characters", async ({
    page,
    mapPage,
  }) => {
    const queries = await scriptSuggestions(page);
    await page.clock.install();
    await mapPage.goto();
    await mapPage.searchInput.fill("ca");
    await pauseTyping(page);
    await expect(mapPage.searchInput).toHaveAttribute("aria-expanded", "false");
    expect(queries).toEqual([]);
    await mapPage.searchInput.fill("cap");
    await pauseTyping(page);
    await expect.poll(() => queries).toEqual(["cap"]);
  });

  test("picks a suggestion with the keyboard and goes straight to its place", async ({
    page,
    mapPage,
  }) => {
    await scriptSuggestions(page);
    await scriptSearch(page);
    await page.clock.install();
    await mapPage.goto();
    const input = mapPage.searchInput;
    await input.fill("cape");
    await pauseTyping(page);
    const options = page
      .getByRole("listbox", { name: "Suggestions" })
      .getByRole("option");
    await expect(options).toHaveCount(3);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const second = options.nth(1);
    await expect(input).toHaveAttribute(
      "aria-activedescendant",
      (await second.getAttribute("id")) ?? "",
    );
    await expect(second).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(input).toHaveValue("Cape Agulhas");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toBeFocused();
    await expect
      .poll(async () => (await mapPage.hashView())?.lat)
      .toBeCloseTo(SUGGESTED_PLACES[1]?.lat ?? 0, 2);
    // No second lookup: the geocoder was never asked, and the box does not suggest its own label.
    await pauseTyping(page);
    expect(await searchedQueries(page)).toEqual([]);
    await expect(input).toHaveAttribute("aria-expanded", "false");
  });

  test("picks a suggestion with a tap", async ({ page, mapPage }) => {
    await scriptSuggestions(page);
    await scriptSearch(page);
    await page.clock.install();
    await mapPage.goto();
    await mapPage.searchInput.fill("cape");
    await pauseTyping(page);
    await page
      .getByRole("listbox", { name: "Suggestions" })
      .getByRole("option", { name: /Cape Point/ })
      .click();
    await expect(mapPage.searchInput).toHaveValue("Cape Point");
    await expect(mapPage.searchInput).toBeFocused();
    await expect
      .poll(async () => (await mapPage.hashView())?.lat)
      .toBeCloseTo(SUGGESTED_PLACES[0]?.lat ?? 0, 2);
    expect(await searchedQueries(page)).toEqual([]);
  });

  test("Enter with no suggestion highlighted still searches through the geocoder", async ({
    page,
    mapPage,
  }) => {
    await scriptSuggestions(page);
    await scriptSearch(page);
    await page.clock.install();
    await mapPage.goto();
    await mapPage.searchInput.fill("cape");
    await pauseTyping(page);
    await expect(
      page.getByRole("listbox", { name: "Suggestions" }).getByRole("option"),
    ).toHaveCount(3);

    await page.keyboard.press("Enter");
    await expect(mapPage.searchOptions).toHaveText([
      /Cape Town/,
      /Cape Coast/,
      /Cape Cod/,
    ]);
    expect(await searchedQueries(page)).toEqual(["cape"]);
  });

  test("Escape closes the suggestions and the next character opens them again", async ({
    page,
    mapPage,
  }) => {
    await scriptSuggestions(page);
    await page.clock.install();
    await mapPage.goto();
    const input = mapPage.searchInput;
    await input.fill("cape");
    await pauseTyping(page);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).toHaveValue("cape");
    await page.keyboard.type("t");
    await pauseTyping(page);
    await expect(input).toHaveAttribute("aria-expanded", "true");
  });

  test("when Photon fails, nothing shows, one message says so, and Enter still works", async ({
    page,
    mapPage,
  }) => {
    let requests = 0;
    await page.route(SUGGESTION_PATTERN, (route) => {
      requests += 1;
      return route.fulfill({ status: 503, body: "unavailable" });
    });
    await scriptSearch(page);
    await page.clock.install();
    await mapPage.goto();
    const input = mapPage.searchInput;

    for (const [index, text] of ["cape", "cape t", "cape to"].entries()) {
      await input.fill(text);
      await pauseTyping(page);
      await expect.poll(() => requests).toBe(index + 1);
    }
    await expect.poll(() => mapPage.announcements()).toContain(UNAVAILABLE);
    await expect(input).toHaveAttribute("aria-expanded", "false");

    // It has stopped asking, and does not say so a second time.
    await input.fill("cape tow");
    await pauseTyping(page);
    await page.keyboard.press("Enter");
    await expect(mapPage.searchOptions).toHaveCount(3);
    expect(requests).toBe(3);
    const spoken = await mapPage.announcements();
    expect(spoken.filter((message) => message === UNAVAILABLE)).toHaveLength(1);
    expect(await searchedQueries(page)).toEqual(["cape tow"]);
  });

  test("when Photon is unreachable, Enter still searches and nothing is announced about it", async ({
    page,
    mapPage,
  }) => {
    await page.route(SUGGESTION_PATTERN, (route) => route.abort());
    await scriptSearch(page);
    await page.clock.install();
    await mapPage.goto();
    await mapPage.searchInput.fill("cape");
    await pauseTyping(page);
    await mapPage.searchInput.press("Enter");
    await expect(mapPage.searchOptions).toHaveCount(3);
    expect(await mapPage.announcements()).not.toContain(UNAVAILABLE);
  });
});
