// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import { ProductPage } from "./pages/ProductPage";

/*
 * The type scale is script-aware: text in a language whose script breaks
 * under tracking or a tight line gets zero tracking and a line height of at
 * least 1.5, while Latin text keeps the base scale. The `lang` attribute goes on the heading itself for the privacy page, because the app owns `<html lang>` there. The product page's h1 is
 * the display step and the privacy page's h1 the title step.
 */

/** The computed letter spacing in px and line height as a multiple of the font size. */
async function typeOf(
  locator: Locator,
): Promise<{ tracking: number; leading: number }> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize);
    const tracking =
      style.letterSpacing === "normal"
        ? 0
        : Number.parseFloat(style.letterSpacing);
    return { tracking, leading: Number.parseFloat(style.lineHeight) / size };
  });
}

const NON_LATIN = ["ar", "he", "hi", "th", "ja", "zh-Hans"] as const;

test.describe("script-aware type", () => {
  test.use({ reducedMotion: "reduce" });

  test("keeps the Latin display and title steps tight", async ({ page }) => {
    const product = new ProductPage(page);
    await product.goto();
    const display = await typeOf(product.headline);
    expect(display.tracking).toBeLessThan(0);
    expect(display.leading).toBeCloseTo(1.1, 2);

    await page.goto("/privacy");
    const title = await typeOf(page.getByRole("heading", { level: 1 }));
    expect(title.tracking).toBeLessThan(0);
    expect(title.leading).toBeCloseTo(1.25, 2);
  });

  for (const language of NON_LATIN) {
    test(`${language} text gets zero tracking and a line height of 1.5 or more`, async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      await page.evaluate(
        (lang) => document.documentElement.setAttribute("lang", lang),
        language,
      );
      const display = await typeOf(product.headline);
      expect(display.tracking).toBeGreaterThanOrEqual(0);
      expect(display.leading).toBeGreaterThanOrEqual(1.5);

      await page.goto("/privacy");
      const heading = page.getByRole("heading", { level: 1 });
      await heading.evaluate(
        (element, lang) => element.setAttribute("lang", lang),
        language,
      );
      const title = await typeOf(heading);
      expect(title.tracking).toBeGreaterThanOrEqual(0);
      expect(title.leading).toBeGreaterThanOrEqual(1.5);
    });
  }

  test("a lang attribute on one element changes only that element", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await product.headline.evaluate((element) =>
      element.setAttribute("lang", "th"),
    );
    const heading = await typeOf(product.headline);
    expect(heading.tracking).toBeGreaterThanOrEqual(0);
    expect(heading.leading).toBeGreaterThanOrEqual(1.5);
    const body = await typeOf(product.main.getByRole("paragraph").first());
    expect(body.leading).toBeLessThan(1.5);
  });
});
