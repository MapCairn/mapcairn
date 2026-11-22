// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "@playwright/test";
import { open } from "./support";

test("search opens with /, takes a query and opens a result with ArrowDown and Enter", async ({
  page,
}) => {
  await open(page, "/docs/");
  const dialog = page.getByRole("dialog", { name: "Search the documentation" });
  const input = dialog.getByRole("searchbox", {
    name: "Search the documentation",
  });

  await page.keyboard.press("/");
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();

  await input.fill("basemap");
  const results = dialog.getByRole("link");
  await expect(results.first()).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(results.first()).toBeFocused();
  const target = await results.first().getAttribute("href");
  expect(target).toMatch(/^\/docs\//);

  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  const opened = new URL(page.url());
  expect(opened.pathname + opened.hash).toBe(target);
});

test("Escape closes the search dialog and focus returns to the Search button", async ({
  page,
}) => {
  await open(page, "/docs/");
  const button = page.getByRole("button", { name: "Search" });
  await page.keyboard.press("/");
  const dialog = page.getByRole("dialog", { name: "Search the documentation" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});
