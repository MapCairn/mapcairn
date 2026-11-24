// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { DesignPage } from "./pages/DesignPage";

/*
 * The metric-matched fallback face ships with the SDK's stylesheet
 * (@mapcairn/theme's tokens.css), and the host declares none of its own. The
 * page is /design, which exists in e2e builds: it renders real interface text
 * and has a font gate. These specs prove that the face reaches the page, and
 * that the text box moves little when Plex replaces the fallback, which is the
 * layout shift the face exists to prevent.
 */

/** The family the SDK's font stack names second, after IBM Plex Sans Variable. */
const FALLBACK_FAMILY = "IBM Plex Sans Fallback";

/**
 * How far the box of a line of text may move, as a share of its width or
 * height, when the font swaps. Without the face the system font differs from
 * Plex by far more than this.
 */
const MAX_SHIFT = 0.04;

interface TextBox {
  readonly width: number;
  readonly height: number;
}

/** The width and height of the text inside an element, from a range over it. */
function textBox(locator: Locator): Promise<TextBox> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const { width, height } = range.getBoundingClientRect();
    return { width, height };
  });
}

/** How many faces of the fallback family the browser could load from this system. */
function loadFallbackFaces(page: Page): Promise<number> {
  return page.evaluate(
    (family) =>
      document.fonts.load(`16px "${family}"`).then((faces) => faces.length),
    FALLBACK_FAMILY,
  );
}

/** The share by which `after` differs from `before`. */
function shift(before: number, after: number): number {
  return Math.abs(after - before) / before;
}

test.describe("the metric-matched fallback font face", () => {
  test("is declared by the page's stylesheets, from the SDK", async ({
    page,
  }) => {
    await new DesignPage(page).goto();
    const declared = await page.evaluate(
      (family) =>
        [...document.fonts].some(
          (face) => face.family.replaceAll('"', "") === family,
        ),
      FALLBACK_FAMILY,
    );
    expect(declared).toBe(true);
  });

  test("keeps a heading's text box within a few percent when Plex loads", async ({
    page,
  }) => {
    await page.route("**/*.woff2", (route) => route.abort());
    const design = new DesignPage(page);
    await design.goto();
    await expect(design.fontGate).toHaveAttribute("data-font-loaded", "false");
    test.skip(
      (await loadFallbackFaces(page)) === 0,
      "Neither Arial nor Liberation Sans is installed here.",
    );
    const fallbackBox = await textBox(design.heading);

    await page.unroute("**/*.woff2");
    await page.reload();
    await expect(design.fontGate).toHaveAttribute("data-font-loaded", "true");
    const plexBox = await textBox(design.heading);

    expect(shift(plexBox.width, fallbackBox.width)).toBeLessThan(MAX_SHIFT);
    expect(shift(plexBox.height, fallbackBox.height)).toBeLessThan(MAX_SHIFT);
  });
});
