// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "@playwright/test";
import {
  AUDIT_WIDTHS,
  AUDITED_PAGES,
  axeViolations,
  open,
  prepare,
  THEMES,
} from "./support";

for (const theme of THEMES) {
  for (const width of AUDIT_WIDTHS) {
    for (const audited of AUDITED_PAGES) {
      test(`@a11y ${audited.name} has no axe violations, ${theme}, ${width} px`, async ({
        page,
      }) => {
        await prepare(page, theme, width);
        await open(page, audited.path);
        await expect(page.locator("main")).toBeVisible();
        expect(await axeViolations(page)).toEqual([]);
      });
    }

    test(`@a11y the search dialog has no axe violations, ${theme}, ${width} px`, async ({
      page,
    }) => {
      await prepare(page, theme, width);
      await open(page, "/docs/");
      await page.getByRole("button", { name: "Search" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Search the documentation",
      });
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("searchbox", { name: "Search the documentation" })
        .fill("basemap");
      await expect(dialog.getByRole("link").first()).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  }
}
