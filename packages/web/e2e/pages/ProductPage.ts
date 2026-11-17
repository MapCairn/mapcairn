// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Locator, type Page } from "@playwright/test";

/** The product page's h1, which says what MapCairn is. */
export const PRODUCT_HEADLINE =
  "An open-source SDK for accessible, privacy-respecting map applications";

/**
 * The product page at `/`, located by role and accessible name. It is English
 * only, so its names are written here rather than read from a catalogue.
 */
export class ProductPage {
  readonly headline: Locator;
  readonly header: Locator;
  readonly main: Locator;
  readonly footer: Locator;
  readonly skipLink: Locator;
  readonly headerPlayground: Locator;
  readonly headerGitHub: Locator;
  readonly heroGitHub: Locator;
  readonly heroPlayground: Locator;
  readonly code: Locator;
  readonly closing: Locator;

  constructor(readonly page: Page) {
    this.headline = page.getByRole("heading", {
      level: 1,
      name: PRODUCT_HEADLINE,
    });
    this.header = page.getByRole("banner");
    this.main = page.getByRole("main");
    this.footer = page.getByRole("contentinfo");
    this.skipLink = page.getByRole("link", { name: "Skip to content" });
    this.headerPlayground = this.header.getByRole("link", {
      name: "Playground",
    });
    this.headerGitHub = this.header.getByRole("link", { name: "GitHub" });
    this.heroGitHub = this.main
      .getByRole("link", { name: "View on GitHub" })
      .first();
    this.heroPlayground = this.main
      .getByRole("link", { name: "Try the playground" })
      .first();
    this.code = page.getByRole("region", { name: "Embedding example" });
    this.closing = page.getByRole("region", {
      name: "Follow the project and help",
    });
  }

  /** Opens the product page, with an optional hash, and waits for its h1. */
  async goto(hash = ""): Promise<void> {
    await this.page.goto(`/${hash}`);
    await expect(this.headline).toBeVisible();
  }
}
