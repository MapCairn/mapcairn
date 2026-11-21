// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Locator, type Page } from "@playwright/test";

/** The product page's h1, which says what MapCairn makes and what it is built on. */
export const PRODUCT_HEADLINE =
  "Accessible map interfaces for React and MapLibre";

/** The name of the embedding excerpt's code region and of its copy button. */
export const EXCERPT = "src/main.tsx, an excerpt";

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
  readonly headerDocs: Locator;
  readonly headerGitHub: Locator;
  /** The hero's View on GitHub, a quiet text link. */
  readonly heroGitHub: Locator;
  /** The hero's Try the playground, the page's one filled button. */
  readonly heroPlayground: Locator;
  /** The excerpt of the embedding example. */
  readonly code: Locator;
  /** The excerpt's copy button, before it has copied. */
  readonly copyCode: Locator;
  /** The install block's radio group of package managers. */
  readonly installGroup: Locator;

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
    this.headerDocs = this.header.getByRole("link", { name: "Docs" });
    this.headerGitHub = this.header.getByRole("link", { name: "GitHub" });
    this.heroGitHub = this.main.getByRole("link", { name: "View on GitHub" });
    this.heroPlayground = this.main.getByRole("link", {
      name: "Try the playground",
    });
    this.code = page.getByRole("region", { name: EXCERPT });
    this.copyCode = this.main.getByRole("button", {
      name: `Copy code, ${EXCERPT}`,
    });
    this.installGroup = this.main.getByRole("group", {
      name: "Package manager",
    });
  }

  /** The radio for one package manager. */
  installChoice(manager: string): Locator {
    return this.installGroup.getByRole("radio", { name: manager, exact: true });
  }

  /** The tab that holds one package manager's radio, which carries the chosen and hover looks. */
  installPill(manager: string): Locator {
    return this.installGroup.locator("label", { hasText: manager }).filter({
      has: this.page.getByRole("radio", { name: manager, exact: true }),
    });
  }

  /** The install command of one package manager, shown only while that manager is chosen. */
  installCommand(manager: string): Locator {
    return this.installGroup.getByRole("region", {
      name: `Install command for ${manager}`,
    });
  }

  /** The install block's copy button, named for the manager's command it copies. */
  installCopy(manager: string): Locator {
    return this.installGroup.getByRole("button", {
      name: `Copy code, ${manager} install command`,
    });
  }

  /** Opens the product page, with an optional hash, and waits for its h1. */
  async goto(hash = ""): Promise<void> {
    await this.page.goto(`/${hash}`);
    await expect(this.headline).toBeVisible();
  }
}
