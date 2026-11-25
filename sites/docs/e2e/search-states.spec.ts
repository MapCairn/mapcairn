// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Page, test } from "@playwright/test";
import { open } from "./support";

const INDEX = "**/search-index.json";

/** The same phrase the dialog's code says for each state, written out so a change to either is seen. */
const HINT =
  "Enter opens the first result when there is one. Down arrow moves through the results. Escape closes. Ctrl or Cmd and K also open search.";
const ERROR_TEXT =
  "Search could not be loaded. Check your connection, then try again.";

async function openSearch(page: Page, path = "/") {
  await open(page, path);
  await page.getByRole("button", { name: "Search" }).click();
  const dialog = page.getByRole("dialog", { name: "Search the documentation" });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("searchbox", {
    name: "Search the documentation",
  });
  return { dialog, input };
}

test("Try again moves focus to the box, and an empty box announces that search is loading", async ({
  page,
}) => {
  let requests = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(INDEX, async (route) => {
    requests += 1;
    if (requests === 1) {
      await route.abort();
      return;
    }
    await gate;
    await route.continue();
  });

  const { dialog, input } = await openSearch(page);
  const message = dialog.locator(".search-dialog__message");
  await expect(message).toContainText(ERROR_TEXT);
  await expect(input).not.toHaveAttribute("aria-describedby");

  await dialog.getByRole("button", { name: "Try again" }).click();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText("Loading search");

  release();
  await expect(dialog.getByRole("status")).toHaveText("");
  await expect(dialog.getByRole("button", { name: "Try again" })).toBeHidden();
});

test("a box with a short line of keys, which the input points at, in every state but the error", async ({
  page,
}) => {
  const { dialog, input } = await openSearch(page);
  const hint = dialog.getByText(HINT, { exact: true });
  await expect(hint).toBeVisible();
  const hintId = await hint.getAttribute("id");
  expect(hintId).toBeTruthy();
  await expect(input).toHaveAttribute("aria-describedby", hintId ?? "");

  await input.fill("basemap");
  await expect(dialog.getByRole("link").first()).toBeVisible();
  await expect(hint).toBeVisible();

  await input.fill("zzzzqqq");
  await expect(hint).toBeVisible();
});

test("nothing found says one phrase, on screen and aloud", async ({ page }) => {
  const { dialog, input } = await openSearch(page);
  await input.fill("zzzzqqq");
  const phrase =
    "No results for “zzzzqqq”. Try a shorter word, or the name of an export.";
  await expect(dialog.locator(".search-dialog__message")).toHaveText(phrase);
  await expect(dialog.getByRole("status")).toHaveText(phrase);
});

test("partial matches are flagged on screen and aloud", async ({ page }) => {
  const { dialog, input } = await openSearch(page);
  await input.fill("basemap zzzzqqq");
  const note =
    "No section has all of those words. Showing sections with some of them.";
  await expect(
    dialog.locator(".search-dialog__message", { hasText: note }),
  ).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText(note);
});

test("a cut result list says so, and never announces a count that is less than what matched", async ({
  page,
}) => {
  const { dialog, input } = await openSearch(page);
  await input.fill("the");
  const cap = "Showing the first 8 results. Add a word to narrow them.";
  await expect(
    dialog.locator(".search-dialog__message", { hasText: cap }),
  ).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText(cap);
  await expect(dialog.getByRole("link")).toHaveCount(8);
});

test("choosing a result on the page being read moves focus to its heading", async ({
  page,
}) => {
  const { input } = await openSearch(page, "/tasks/choose-a-basemap/");
  await input.fill("What a basemap is");
  const first = page.getByRole("dialog").getByRole("link").first();
  await expect(first).toBeVisible();
  const target = await first.getAttribute("href");
  expect(target).toContain("/tasks/choose-a-basemap/#");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeHidden();

  const id = new URL(target ?? "", page.url()).hash.slice(1);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe(id);
  await expect(page.getByRole("button", { name: "Search" })).not.toBeFocused();
});
