// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The living style guide at `/design`, which exists only in development and
 * e2e builds. Located by role and accessible name, and by `data-testid` for
 * the font gate and the contrast table.
 */
export class DesignPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly skipLink: Locator;
  readonly main: Locator;
  readonly nav: Locator;
  /** The page theme control: a radio group named "Theme". */
  readonly themeControl: Locator;
  /** The element that carries `data-font-loaded`. */
  readonly fontGate: Locator;
  readonly contrastTable: Locator;
  readonly components: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 });
    this.skipLink = page.getByRole("link", { name: "Skip to content" });
    this.main = page.getByTestId("design-guide");
    this.nav = page.getByRole("navigation", { name: "On this page" });
    this.themeControl = page.getByRole("radiogroup", { name: "Theme" });
    this.fontGate = page.getByTestId("font-gate");
    this.contrastTable = page.getByTestId("contrast-table");
    this.components = page.getByRole("region", { name: "Components" });
  }

  /**
   * Loads the page and waits until it has hydrated (the theme control is a
   * browser-only demo) and the font gate has a result.
   */
  async goto(): Promise<void> {
    const response = await this.page.goto("/design");
    expect(response?.status()).toBe(200);
    await expect(this.themeControl).toBeVisible();
    await expect(this.fontGate).not.toHaveAttribute(
      "data-font-loaded",
      "pending",
    );
  }

  /** The scrolling container the whole page lives in (the document is fixed). */
  scroller(): Locator {
    return this.main.locator("xpath=..");
  }
}
