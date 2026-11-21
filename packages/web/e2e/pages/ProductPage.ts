// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Locator, type Page } from "@playwright/test";

/** The product page's h1, which says what teams can build with MapCairn. */
export const PRODUCT_HEADLINE =
  "Build accessible, privacy-respecting map applications for the public";

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
  readonly heroGitHub: Locator;
  readonly heroPlayground: Locator;
  readonly heroNpm: Locator;
  readonly code: Locator;
  /** The embedding example's copy button, before it has copied. */
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
    this.heroGitHub = this.main.getByRole("link", { name: "View on GitHub" });
    this.heroPlayground = this.main.getByRole("link", {
      name: "Try the playground",
    });
    this.heroNpm = this.main.getByRole("link", { name: "View on npm" });
    this.code = page.getByRole("region", { name: "Embedding example" });
    this.copyCode = this.main.getByRole("button", {
      name: "Copy code",
      exact: true,
    });
    this.installGroup = this.main.getByRole("group", {
      name: "Package manager",
    });
  }

  /** The radio for one package manager. */
  installChoice(manager: string): Locator {
    return this.installGroup.getByRole("radio", { name: manager, exact: true });
  }

  /** The pill that holds one package manager's radio, which carries the chosen and hover looks. */
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

  /** The install block's copy button, named for the command it copies. */
  installCopy(command: string): Locator {
    return this.installGroup.getByRole("button", {
      name: `Copy code, ${command}`,
    });
  }

  /** Opens the product page, with an optional hash, and waits for its h1. */
  async goto(hash = ""): Promise<void> {
    await this.page.goto(`/${hash}`);
    await expect(this.headline).toBeVisible();
  }
}
