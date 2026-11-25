// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { DOCS_URL } from "../src/constants/siteConfig";
import { expect, test } from "./fixtures";
import { EXCERPT, PRODUCT_HEADLINE, ProductPage } from "./pages/ProductPage";
import {
  axeViolations,
  findLongMotion,
  findMissingFocusRings,
  inspectControls,
} from "./support/a11y";

/*
 * The product page at `/`: no map code, no third-party request, the old map
 * links sent on to `/map`, the head that crawlers read, the ways to the
 * playground and back, and the accessibility checks in both themes.
 */

const SITE = "https://mapcairn.com";

/** Phone first, then desktop: the sizes the page is checked at. */
const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 1440, height: 900 },
] as const;

test.describe("the product page", () => {
  test.use({ reducedMotion: "reduce" });

  test("loads no map code and asks nothing of another site", async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    const product = new ProductPage(page);
    await product.goto();
    await expect(page.getByTestId("survey-art")).toBeVisible();

    const origin = new URL(page.url()).origin;
    expect(
      requests.filter((url) => new URL(url).origin !== origin),
      "requests to another origin",
    ).toEqual([]);
    expect(
      requests.filter((url) => /maplibre/i.test(url)),
      "map engine requests",
    ).toEqual([]);
    // The app layout (the services, every adapter and layer definition) and
    // the map route are their own chunks and stylesheets; none of them loads.
    // The browser holds only the routes it has found so far, so read the
    // build's own manifest, which `npm run start` served.
    const appFiles = appLayoutFiles();
    expect(appFiles.length).toBeGreaterThan(2);
    const paths = requests.map((url) => new URL(url).pathname);
    for (const file of appFiles) {
      expect(paths, file).not.toContain(file);
    }
    await expect(page.getByTestId("map-host")).toHaveCount(0);
    await expect(page.locator('link[rel="preconnect"]')).toHaveCount(0);
  });

  test("stays put for a plain address and for its own anchors", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await expect(page).toHaveURL(/\/$/);
    await product.goto("#questions");
    await expect(page).toHaveURL(/\/#questions$/);
    await expect(product.headline).toBeVisible();
  });

  for (const hash of [
    "#map=11.00/-33.92000/18.42000",
    "#basemap=dark",
    "#layers=earthquakes",
  ]) {
    test(`sends an old map link with ${hash.split("=")[0]} on to /map, hash and all`, async ({
      page,
      mapPage,
    }) => {
      await page.goto(`/${hash}`);
      await expect(page).toHaveURL(new RegExp(`/map${literally(hash)}$`));
      await mapPage.waitForMap();
      await expect(new ProductPage(page).headline).toHaveCount(0);
    });
  }

  test("keeps the view from an old map link", async ({ page, mapPage }) => {
    await page.goto("/#map=11.00/-33.92000/18.42000");
    await mapPage.waitForMap();
    const view = await mapPage.hashView();
    expect(view?.lat).toBeCloseTo(-33.92, 1);
    expect(view?.lng).toBeCloseTo(18.42, 1);
  });

  test("tells crawlers and link previews what it is", async ({ page }) => {
    const product = new ProductPage(page);
    await product.goto();
    await expect(page).toHaveTitle(
      "MapCairn | Open-source SDK for accessible map applications",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${SITE}/`,
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `${SITE}/`,
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      `${SITE}/og-sdk.png`,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(
      page.locator('link[rel="alternate"][type="text/markdown"]'),
    ).toHaveAttribute("href", "/index.md");
    await expect(page.locator("link[hreflang]")).toHaveCount(0);

    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(blocks).toHaveLength(1);
    const types = (
      JSON.parse(blocks[0] ?? "") as { "@graph": { "@type": string }[] }
    )["@graph"].map((entry) => entry["@type"]);
    expect(types).toEqual(["WebSite", "SoftwareSourceCode", "FAQPage"]);
  });

  test.describe("after Afrikaans was chosen in the playground", () => {
    test.use({ language: "af" });

    test("stays in English", async ({ page }) => {
      const product = new ProductPage(page);
      await product.goto();
      await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
      await expect(page.getByTestId("product-page")).toHaveAttribute(
        "lang",
        "en-GB",
      );
      await expect(product.heroGitHub).toBeVisible();
    });
  });

  for (const viewport of VIEWPORTS) {
    test(`fills one control only, Try the playground, at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      await expect(product.heroPlayground).toHaveAttribute("href", "/map");
      expect(
        (await product.heroPlayground.boundingBox())?.height,
      ).toBeGreaterThanOrEqual(48);
      const filled = await page.evaluate(() => {
        const ground = getComputedStyle(
          document.querySelector("[data-testid=product-page]") as Element,
        ).backgroundColor;
        return [...document.querySelectorAll("a, button, label")]
          .filter((element) => {
            const fill = getComputedStyle(element).backgroundColor;
            return fill !== "rgba(0, 0, 0, 0)" && fill !== ground;
          })
          .map((element) => element.textContent?.trim());
      });
      expect(filled).toEqual(["Try the playground"]);
    });
  }

  for (const [width, beside] of [
    [390, false],
    [1280, true],
  ] as const) {
    test(`sets the install command ${beside ? "beside" : "under"} the hero's words at ${width}px, with one filled button`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const product = new ProductPage(page);
      await product.goto();
      const words = await product.headline.boundingBox();
      const install = await product.installGroup.boundingBox();
      if (beside) {
        expect(install?.x ?? 0).toBeGreaterThan(
          (words?.x ?? 0) + (words?.width ?? 0),
        );
        // Beside the words the command still fits its column on one line.
        const lines = await product.installCommand("npm").evaluate((pre) => {
          const range = document.createRange();
          range.selectNodeContents(pre);
          return new Set(
            [...range.getClientRects()].map((rect) => Math.round(rect.top)),
          ).size;
        });
        expect(lines).toBe(1);
      } else {
        expect(install?.y ?? 0).toBeGreaterThan(
          (words?.y ?? 0) + (words?.height ?? 0),
        );
      }
    });
  }

  test("offers the repository in the hero as an underlined text link of 44 px", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await expect(product.heroGitHub).toHaveAttribute(
      "href",
      "https://github.com/MapCairn/mapcairn",
    );
    expect(
      (await product.heroGitHub.boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await interactionStyle(product.heroGitHub)).textDecorationLine,
    ).toContain("underline");
  });

  test("offers the package on npm beside the repository, as an underlined text link of 44 px", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await expect(product.heroNpm).toHaveAttribute(
      "href",
      "https://www.npmjs.com/package/@mapcairn/sdk",
    );
    expect(
      (await product.heroNpm.boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await interactionStyle(product.heroNpm)).textDecorationLine,
    ).toContain("underline");
  });

  for (const [width, height] of [
    [390, 844],
    [820, 1180],
    [1440, 900],
  ] as const) {
    test(`shows the playground button, the install command and View on GitHub in the first screen at ${width}px, with the whole command readable and no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const product = new ProductPage(page);
      await product.goto();
      await expect(product.installCommand("npm")).toBeInViewport();
      await expect(product.heroGitHub).toBeInViewport();
      await expect(product.heroPlayground).toBeInViewport();
      const fit = await product.installCommand("npm").evaluate((pre) => ({
        wraps: getComputedStyle(pre).whiteSpace,
        clipped: pre.scrollWidth > pre.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(fit.wraps).toBe("pre-wrap");
      expect(fit.clipped).toBe(false);
      expect(fit.page).toBeLessThanOrEqual(width);
    });
  }

  test("links to the repository from the header, the hero's text link and the footer's Source code only", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    const repository = page.locator(
      'a[href="https://github.com/MapCairn/mapcairn"]',
    );
    await expect(repository).toHaveCount(3);
    await expect(product.headerGitHub).toHaveAttribute(
      "href",
      "https://github.com/MapCairn/mapcairn",
    );
    await expect(product.headerDocs).toHaveAttribute("href", DOCS_URL);
    await expect(product.header.locator('a[href^="https://"]')).toHaveCount(2);
    await expect(
      product.footer.getByRole("link", { name: "Source code" }),
    ).toHaveAttribute("href", "https://github.com/MapCairn/mapcairn");
  });

  test("links the documentation, release notes, licence guide, security policy and Discussions from the footer", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    for (const [name, href] of [
      ["Release notes", "/releases"],
      ["Security", "/blob/main/.github/SECURITY.md"],
      ["Discussions", "/discussions"],
    ] as const) {
      const link = product.footer.getByRole("link", { name });
      await expect(link).toHaveAttribute(
        "href",
        `https://github.com/MapCairn/mapcairn${href}`,
      );
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    const documentation = product.footer.getByRole("link", {
      name: "Documentation",
    });
    await expect(documentation).toHaveAttribute("href", DOCS_URL);
    expect((await documentation.boundingBox())?.height).toBeGreaterThanOrEqual(
      44,
    );
    const licence = product.footer.getByRole("link", { name: "Licence guide" });
    await expect(licence).toHaveAttribute("href", `${DOCS_URL}guides/licence/`);
    expect((await licence.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  for (const viewport of VIEWPORTS) {
    test(`sets no text of the page below 13px at ${viewport.width}px, the relief strip's labels included`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      const small = await page.evaluate(() => {
        const found: string[] = [];
        for (const element of document.querySelectorAll(
          "header *, main *, footer *",
        )) {
          const hasText = [...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
          if (!hasText) {
            continue;
          }
          const size = Number.parseFloat(getComputedStyle(element).fontSize);
          if (size < 13) {
            found.push(`${element.tagName} ${size}px`);
          }
        }
        return found;
      });
      expect(small).toEqual([]);
    });
  }

  for (const [width, columns] of [
    [320, 1],
    [390, 1],
    [1440, 2],
  ] as const) {
    test(`lays what you get out in ${columns} column${columns > 1 ? "s" : ""} at ${width}px, with nothing clipped`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const product = new ProductPage(page);
      await product.goto();
      const layout = await page
        .getByRole("region", { name: "What you get" })
        .evaluate((region) => {
          const items = [...region.querySelectorAll("li")].map((item) =>
            item.getBoundingClientRect(),
          );
          return {
            lefts: [...new Set(items.map((box) => Math.round(box.left)))],
            right: Math.max(...items.map((box) => box.right)),
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
      expect(layout.lefts).toHaveLength(columns);
      expect(layout.right).toBeLessThanOrEqual(width);
      expect(layout.scrollWidth).toBeLessThanOrEqual(width);
    });
  }

  test("shows what you get open, as four benefits, each with its heading and text", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    const you = page.getByRole("region", { name: "What you get" });
    await expect(you.locator("details")).toHaveCount(0);
    const items = you.getByRole("listitem");
    await expect(items).toHaveCount(4);
    for (const item of await items.all()) {
      await expect(item.locator("p")).toBeVisible();
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`draws no rule between sections at ${viewport.width}px: space alone sets them apart`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      const rules = await page.evaluate(() =>
        [...document.querySelectorAll("main > section")].map((section) => {
          const before = getComputedStyle(section, "::before");
          const own = getComputedStyle(section);
          return {
            image: before.backgroundImage,
            content: before.content,
            border: own.borderBlockStartStyle,
          };
        }),
      );
      for (const rule of rules) {
        expect(rule.image).toBe("none");
        expect(rule.content).toBe("none");
        expect(rule.border).toBe("none");
      }
    });
  }

  for (const width of [320, 390, 1440]) {
    test(`keeps the header at the top while the page scrolls at ${width}px, slim, with every link whole`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      const product = new ProductPage(page);
      await product.goto();
      await page.evaluate(() => window.scrollTo(0, 2000));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(2000);
      const header = await product.header.boundingBox();
      expect(header?.y).toBe(0);
      expect(header?.height ?? 0).toBeLessThanOrEqual(64);
      for (const link of [
        product.headerPlayground,
        product.headerDocs,
        product.headerGitHub,
      ]) {
        await expect(link).toBeInViewport({ ratio: 1 });
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  }

  for (const width of [320, 360, 390, 430, 1440]) {
    test(`keeps every header link a 44 px target with 8 px to its neighbour at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      const product = new ProductPage(page);
      await product.goto();
      const boxes = [];
      for (const link of [
        product.headerPlayground,
        product.headerDocs,
        product.headerGitHub,
      ]) {
        const box = await link.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        boxes.push(box);
      }
      for (const [index, box] of boxes.entries()) {
        const next = boxes[index + 1];
        if (box && next) {
          expect(next.x - (box.x + box.width)).toBeGreaterThanOrEqual(8);
        }
      }
    });
  }

  for (const [hash, name] of [
    ["#questions", "Questions"],
    ["#licence", "Licence and cost"],
    ["#readiness", "How ready it is"],
  ] as const) {
    test(`lands ${hash} just below the header, not under it and not far below it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 700 });
      const product = new ProductPage(page);
      await product.goto(hash);
      const heading = page.getByRole("heading", { level: 2, name });
      const header = (await product.header.boundingBox())?.height ?? 0;
      await expect
        .poll(async () => (await heading.boundingBox())?.y ?? 0)
        .toBeGreaterThanOrEqual(header);
      // One offset, the scroll padding: the header and a step of air, not twice that.
      expect((await heading.boundingBox())?.y ?? 0).toBeLessThanOrEqual(
        header + 24,
      );
    });
  }

  test("follows the licence badge and the release line to their sections", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await product.main.getByRole("link", { name: "AGPL-3.0-only" }).click();
    await expect(page).toHaveURL(/#licence$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Licence and cost" }),
    ).toBeInViewport();
    await product.main.getByRole("link", { name: "How ready it is" }).click();
    await expect(page).toHaveURL(/#readiness$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "How ready it is" }),
    ).toBeInViewport();
  });

  for (const width of [320, 1280]) {
    test(`keeps every control the keyboard reaches clear of the sticky header with text at 200% at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 700 });
      const product = new ProductPage(page);
      await product.goto();
      await page.evaluate(() =>
        document.documentElement.style.setProperty("font-size", "200%"),
      );
      const hidden: string[] = [];
      for (let step = 0; step < 40; step += 1) {
        await page.keyboard.press("Tab");
        const where = await page.evaluate(() => {
          const focused = document.activeElement as HTMLElement | null;
          const header = document.querySelector("header");
          // The skip link shows itself over the top of the page by design; the
          // header's own links are in the header. Only the page's content counts.
          const content = focused?.closest("main, footer");
          if (!focused || !header || !content) {
            return null;
          }
          const box = focused.getBoundingClientRect();
          return {
            name: `${focused.tagName} ${focused.textContent?.trim().slice(0, 30)}`,
            top: box.top,
            headerBottom: header.getBoundingClientRect().bottom,
          };
        });
        if (where !== null && where.top < where.headerBottom - 1) {
          hidden.push(where.name);
        }
      }
      expect(hidden).toEqual([]);
      // The header stays one row tall, so its own links are reachable too.
      const header = (await product.header.boundingBox())?.height ?? 0;
      const link = (await product.headerPlayground.boundingBox())?.height ?? 0;
      expect(header).toBeLessThan(link * 1.5);
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`keeps Playground in the header at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      await expect(product.headerPlayground).toBeInViewport();
    });
  }

  for (const [where, find] of [
    ["the header", (p: ProductPage) => p.headerPlayground],
    ["the hero", (p: ProductPage) => p.heroPlayground],
    [
      "the footer",
      (p: ProductPage) =>
        p.footer.getByRole("link", { name: "Try the playground" }),
    ],
  ] as const) {
    test(`leads from ${where} to a working playground`, async ({
      page,
      mapPage,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      await find(product).click();
      await expect(page).toHaveURL(/\/map$/);
      await mapPage.waitForMap();
    });
  }

  test("lets the keyboard reach and scroll the code example", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const product = new ProductPage(page);
    await product.goto();
    await product.code.focus();
    await expect(product.code).toBeFocused();
    const scrolls = await product.code.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    expect(scrolls).toBe(true);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => product.code.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
  });

  test.describe("copying the embedding example", () => {
    test("copies the code shown, says Copied and then offers to copy again", async ({
      page,
    }) => {
      await recordClipboard(page, { ok: true });
      const product = new ProductPage(page);
      await product.goto();
      await expect.poll(() => copiedTexts(page)).toEqual([]);
      await product.copyCode.click();
      await expect(
        product.main.getByRole("button", { name: `Copied, ${EXCERPT}` }),
      ).toBeFocused();
      await expect(page.getByTestId("live-region-polite")).toHaveText(
        `Code copied, ${EXCERPT}`,
      );
      const shown = await product.code.textContent();
      await expect.poll(() => copiedTexts(page)).toEqual([shown]);
      await expect(product.copyCode).toBeVisible({ timeout: 10_000 });
    });

    test("copies from the keyboard", async ({ page }) => {
      await recordClipboard(page, { ok: true });
      const product = new ProductPage(page);
      await product.goto();
      await product.copyCode.focus();
      await page.keyboard.press("Enter");
      await expect(
        product.main.getByRole("button", { name: `Copied, ${EXCERPT}` }),
      ).toBeFocused();
      await expect.poll(async () => (await copiedTexts(page)).length).toBe(1);
    });

    test("says when the browser refuses, and how to copy by hand", async ({
      page,
    }) => {
      await recordClipboard(page, { ok: false });
      const product = new ProductPage(page);
      await product.goto();
      await product.copyCode.click();
      await expect(
        product.main.getByRole("button", { name: `Copy failed, ${EXCERPT}` }),
      ).toBeFocused();
      await expect(page.getByTestId("live-region-assertive")).toHaveText(
        `Could not copy ${EXCERPT}. Select the code and copy it manually.`,
      );
      await expect.poll(() => copiedTexts(page)).toEqual([]);
    });

    test("sits in the corner of its code box as a 44 px icon button, named in words", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      const product = new ProductPage(page);
      await product.goto();
      const button = await product.copyCode.boundingBox();
      const box = await product.code.evaluate((code) =>
        (code.parentElement as Element).getBoundingClientRect().toJSON(),
      );
      expect(button?.width).toBeGreaterThanOrEqual(44);
      expect(button?.height).toBeGreaterThanOrEqual(44);
      expect(await product.copyCode.textContent()).toBe("");
      // Inside the box's one-pixel edge, at its top end corner.
      const inset = box.right - ((button?.x ?? 0) + (button?.width ?? 0));
      expect(inset).toBeGreaterThanOrEqual(0);
      expect(inset).toBeLessThanOrEqual(2);
      expect((button?.y ?? 0) - box.top).toBeGreaterThanOrEqual(0);
      expect((button?.y ?? 0) - box.top).toBeLessThanOrEqual(2);
    });
  });

  test.describe("the install commands", () => {
    const COMMANDS = {
      npm: "npm install @mapcairn/sdk react react-dom maplibre-gl",
      pnpm: "pnpm add @mapcairn/sdk react react-dom maplibre-gl",
      yarn: "yarn add @mapcairn/sdk react react-dom maplibre-gl",
      bun: "bun add @mapcairn/sdk react react-dom maplibre-gl",
    } as const;
    const MANAGERS = Object.keys(COMMANDS) as (keyof typeof COMMANDS)[];

    test("show the npm command first, and one command at a time as each manager is chosen", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      await expect(product.installChoice("npm")).toBeChecked();
      for (const chosen of MANAGERS) {
        await product.installChoice(chosen).click();
        await expect(product.installChoice(chosen)).toBeChecked();
        for (const manager of MANAGERS) {
          const command = product.installCommand(manager);
          if (manager === chosen) {
            await expect(command).toBeVisible();
            await expect(command).toHaveText(COMMANDS[manager]);
          } else {
            await expect(command).toBeHidden();
          }
        }
      }
    });

    test("put the copy button in the command's corner once the page runs, inside the command's box and clear of its words", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      const product = new ProductPage(page);
      await product.goto();
      const command = product.installCommand("npm");
      const button = await product.installCopy("npm").boundingBox();
      const box = await command.boundingBox();
      expect(button?.width).toBeGreaterThanOrEqual(44);
      expect(button?.y ?? 0).toBeGreaterThanOrEqual(box?.y ?? 0);
      expect((button?.x ?? 0) + (button?.width ?? 0)).toBeLessThanOrEqual(
        (box?.x ?? 0) + (box?.width ?? 0),
      );
      const words = await command.evaluate((pre) => {
        const range = document.createRange();
        range.selectNodeContents(pre);
        return Math.max(
          ...[...range.getClientRects()].map((rect) => rect.right),
        );
      });
      expect(words).toBeLessThanOrEqual(button?.x ?? 0);
    });

    test("say what the SDK needs under the block", async ({ page }) => {
      const product = new ProductPage(page);
      await product.goto();
      await expect(
        product.main.getByText(
          "It adds the SDK and its three peers. Needs React 19, maplibre-gl 6.18 or later and a bundler that handles CSS imports (tried with Vite).",
        ),
      ).toBeVisible();
    });

    test("are chosen with the arrow keys, which follow the reading direction", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      await product.installChoice("npm").focus();
      await page.keyboard.press("ArrowRight");
      await expect(product.installChoice("pnpm")).toBeChecked();
      await expect(product.installChoice("pnpm")).toBeFocused();
      await expect(product.installCommand("pnpm")).toBeVisible();
      await page.keyboard.press("ArrowLeft");
      await expect(product.installChoice("npm")).toBeChecked();
      // The page is left to right by decision; a right-to-left group reverses the keys.
      await product.installGroup.evaluate((group) => {
        group.setAttribute("dir", "rtl");
      });
      await product.installChoice("npm").focus();
      await page.keyboard.press("ArrowLeft");
      await expect(product.installChoice("pnpm")).toBeChecked();
      await page.keyboard.press("ArrowRight");
      await expect(product.installChoice("npm")).toBeChecked();
    });

    test("take one tab stop, then the command and the copy button, with a target of at least 44 px for each manager", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      const product = new ProductPage(page);
      await product.goto();
      for (const manager of MANAGERS) {
        const box = await product.installChoice(manager).boundingBox();
        expect(box?.width ?? 0, manager).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, manager).toBeGreaterThanOrEqual(44);
      }
      const copy = await product.installCopy("npm").boundingBox();
      expect(copy?.height ?? 0).toBeGreaterThanOrEqual(44);
      await product.installChoice("pnpm").click();
      await product.installChoice("pnpm").focus();
      await page.keyboard.press("Tab");
      await expect(product.installCommand("pnpm")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(product.installCopy("pnpm")).toBeFocused();
    });

    test("copy the chosen manager's command, say Copied and announce it", async ({
      page,
    }) => {
      await recordClipboard(page, { ok: true });
      const product = new ProductPage(page);
      await product.goto();
      await product.installChoice("bun").click();
      await product.installCopy("bun").click();
      await expect(
        product.installGroup.getByRole("button", {
          name: "Copied, bun install command",
        }),
      ).toBeFocused();
      await expect(page.getByTestId("live-region-polite")).toHaveText(
        "Code copied, bun install command",
      );
      await expect.poll(() => copiedTexts(page)).toEqual([COMMANDS.bun]);
      // The embedding example's own button is a different button.
      await expect(product.copyCode).toBeVisible();
    });

    test("say when the browser refuses, and leave the command selectable", async ({
      page,
    }) => {
      await recordClipboard(page, { ok: false });
      const product = new ProductPage(page);
      await product.goto();
      await product.installCopy("npm").click();
      await expect(page.getByTestId("live-region-assertive")).toHaveText(
        "Could not copy npm install command. Select the code and copy it manually.",
      );
      const selectable = await product
        .installCommand("npm")
        .evaluate((element) => getComputedStyle(element).userSelect);
      expect(selectable).not.toBe("none");
      await expect.poll(() => copiedTexts(page)).toEqual([]);
    });

    test("mark the chosen manager with an underline as well as the text colour, and only that one", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      for (const chosen of MANAGERS) {
        await product.installChoice(chosen).click();
        await page.mouse.move(0, 0);
        for (const manager of MANAGERS) {
          const { textDecorationLine } = await interactionStyle(
            product.installPill(manager),
          );
          expect(textDecorationLine, `${manager} while ${chosen}`).toBe(
            manager === chosen ? "underline" : "none",
          );
        }
      }
    });

    test("keep the chosen manager's underline in forced colours, and only on that one", async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      const product = new ProductPage(page);
      await product.goto();
      expect(
        (await interactionStyle(product.installPill("npm"))).textDecorationLine,
      ).toBe("underline");
      expect(
        (await interactionStyle(product.installPill("pnpm")))
          .textDecorationLine,
      ).toBe("none");
    });

    test("answer a press with the pressed look", async ({ page }) => {
      const product = new ProductPage(page);
      await product.goto();
      const pill = product.installPill("yarn");
      const resting = await interactionStyle(pill);
      await pill.hover();
      await page.mouse.down();
      const pressed = await interactionStyle(pill);
      await page.mouse.up();
      expect(pressed.transform).not.toBe(resting.transform);
      expect(pressed.backgroundColor).not.toBe(resting.backgroundColor);
    });

    test("hide the other commands only where the browser can tell which manager is chosen", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      // Without `:has()` the rule that hides must not apply, so every command shows.
      const hidesOutsideSupports = await product
        .installCommand("npm")
        .evaluate((element) => {
          const classes = [...element.classList];
          const hides = (rule: CSSStyleRule) =>
            rule.style.display === "none" &&
            classes.some((name) => rule.selectorText === `.${name}`);
          const outside = [...document.styleSheets]
            .flatMap((sheet) => [...sheet.cssRules])
            .filter(
              (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
            );
          const inside = [...document.styleSheets]
            .flatMap((sheet) => [...sheet.cssRules])
            .filter(
              (rule): rule is CSSSupportsRule =>
                rule instanceof CSSSupportsRule,
            )
            .flatMap((rule) => [...rule.cssRules])
            .filter(
              (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule,
            );
          return {
            outside: outside.some(hides),
            inside: inside.some(hides),
          };
        });
      expect(hidesOutsideSupports).toEqual({ outside: false, inside: true });
    });

    test("copy the manager chosen before the page's script ran", async ({
      page,
    }) => {
      await recordClipboard(page, { ok: true });
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/*.js", async (route) => {
        await held;
        await route.continue();
      });
      const product = new ProductPage(page);
      await page.goto("/", { waitUntil: "commit" });
      await expect(product.headline).toBeVisible();
      await product.installChoice("pnpm").click();
      await expect(product.installCommand("pnpm")).toBeVisible();
      release();
      const button = product.installCopy("pnpm");
      await button.click();
      await expect.poll(() => copiedTexts(page)).toEqual([COMMANDS.pnpm]);
      await expect(product.installChoice("pnpm")).toBeChecked();
    });

    test("remember nothing in the browser", async ({ page }) => {
      const product = new ProductPage(page);
      await product.goto();
      const stored = () =>
        page.evaluate(() => [
          ...Object.entries(localStorage),
          ...Object.entries(sessionStorage),
        ]);
      const before = await stored();
      const cookies = await page.context().cookies();
      await product.installChoice("yarn").click();
      expect(await stored()).toEqual(before);
      expect(await page.context().cookies()).toEqual(cookies);
    });
  });

  test.describe("the install commands without a script", () => {
    test.use({ javaScriptEnabled: false });

    test("show the npm command, let the radios choose another and offer no dead copy button", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await page.goto("/");
      await expect(product.installCommand("npm")).toHaveText(
        "npm install @mapcairn/sdk react react-dom maplibre-gl",
      );
      await expect(product.installCommand("pnpm")).toBeHidden();
      await product.installChoice("pnpm").click();
      await expect(product.installCommand("pnpm")).toHaveText(
        "pnpm add @mapcairn/sdk react react-dom maplibre-gl",
      );
      await expect(product.installCommand("npm")).toBeHidden();
      await expect(product.installGroup.getByRole("button")).toHaveCount(0);
    });
  });

  test.describe("buttons and links answer the pointer", () => {
    test("an action rises under a pointer and shrinks a little when pressed", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "Hover needs a pointer that can hover.");
      const product = new ProductPage(page);
      await product.goto();
      const resting = await interactionStyle(product.heroPlayground);
      expect(resting.boxShadow).toBe("none");
      expect(resting.transform).toBe("none");

      await product.heroPlayground.hover();
      // A transform settles a frame after the state changes, so poll for it.
      await expect
        .poll(
          async () =>
            (await interactionStyle(product.heroPlayground)).transform,
        )
        .toBe("matrix(1, 0, 0, 1, 0, -1)");
      const hovered = await interactionStyle(product.heroPlayground);
      expect(hovered.boxShadow).not.toBe("none");
      // The colours stay the AA pair they were.
      expect(hovered.color).toBe(resting.color);
      expect(hovered.backgroundColor).toBe(resting.backgroundColor);

      await page.mouse.down();
      await expect
        .poll(
          async () =>
            (await interactionStyle(product.heroPlayground)).transform,
        )
        .toBe("matrix(0.98, 0, 0, 0.98, 0, 0)");
      expect((await interactionStyle(product.heroPlayground)).boxShadow).toBe(
        "none",
      );
      await page.mouse.up();
    });

    test("the hero's text link, the header links, the copy button and the install tabs take the accent tint under a pointer", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "Hover needs a pointer that can hover.");
      const product = new ProductPage(page);
      await product.goto();
      for (const target of [
        product.heroGitHub,
        product.headerPlayground,
        product.headerGitHub,
        product.copyCode,
        product.installPill("pnpm"),
      ]) {
        const resting = await interactionStyle(target);
        await target.hover();
        const hovered = await interactionStyle(target);
        expect(hovered.backgroundColor).not.toBe(resting.backgroundColor);
        await page.mouse.move(0, 0);
      }
    });

    test("in forced colours the hero's text link and the header's links stay visible and underlined", async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      const product = new ProductPage(page);
      await product.goto();
      for (const link of [
        product.heroGitHub,
        product.headerPlayground,
        product.headerDocs,
        product.headerGitHub,
      ]) {
        await expect(link).toBeVisible();
        const style = await interactionStyle(link);
        expect(style.textDecorationLine).toContain("underline");
        expect(style.color).not.toBe(style.backgroundColor);
      }
    });

    test("a link's underline thickens under a pointer", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "Hover needs a pointer that can hover.");
      const product = new ProductPage(page);
      await product.goto();
      const link = product.footer.getByRole("link", { name: "Source code" });
      expect((await interactionStyle(link)).textDecorationThickness).toBe(
        "1px",
      );
      await link.hover();
      expect((await interactionStyle(link)).textDecorationThickness).toBe(
        "2px",
      );
    });

    test("in forced colours a hovered action is underlined, since its shadow is gone", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "Hover needs a pointer that can hover.");
      await page.emulateMedia({ forcedColors: "active" });
      const product = new ProductPage(page);
      await product.goto();
      expect(
        (await interactionStyle(product.heroPlayground)).textDecorationLine,
      ).toBe("none");
      await product.heroPlayground.hover();
      expect(
        (await interactionStyle(product.heroPlayground)).textDecorationLine,
      ).toBe("underline");
      const pill = product.installPill("pnpm");
      expect((await interactionStyle(pill)).textDecorationLine).toBe("none");
      await pill.hover();
      expect((await interactionStyle(pill)).textDecorationLine).toBe(
        "underline",
      );
    });

    // Forced colours paint a Canvas backplate behind text, so an action
    // that fills itself with another system colour hides its own label.
    test("in forced colours every action's label sits on Canvas, at rest, hovered and pressed", async ({
      page,
      isMobile,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      const product = new ProductPage(page);
      await product.goto();
      const canvas = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "Canvas";
        probe.style.forcedColorAdjust = "none";
        document.body.append(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
      });
      // The filled button becomes an outlined link on Canvas. The copy button
      // has no fill of its own, so its icon sits on its code box, which is Canvas.
      const actions = [product.heroPlayground, product.copyCode];
      const readable = async (action: Locator) => {
        const style = await interactionStyle(action);
        if (action === product.copyCode) {
          const clear = /,\s*0\)$/.test(style.backgroundColor);
          expect(clear || style.backgroundColor === canvas).toBe(true);
        } else {
          expect(style.backgroundColor).toBe(canvas);
        }
        expect(style.color).not.toBe(canvas);
      };
      for (const action of actions) {
        await readable(action);
        if (isMobile) {
          continue;
        }
        await action.hover();
        await readable(action);
        await page.mouse.down();
        await readable(action);
        await page.mouse.move(0, 0);
        await page.mouse.up();
      }
    });

    test("a tap leaves no hover behind on a touch screen", async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "Only a touch screen has no hover.");
      await recordClipboard(page, { ok: true });
      const product = new ProductPage(page);
      await product.goto();
      const resting = await interactionStyle(product.copyCode);
      await product.copyCode.tap();
      await expect(
        product.main.getByRole("button", { name: `Copied, ${EXCERPT}` }),
      ).toBeVisible();
      const tapped = await interactionStyle(product.copyCode);
      expect(tapped.backgroundColor).toBe(resting.backgroundColor);
      expect(tapped.boxShadow).toBe("none");
      expect(tapped.transform).toBe("none");
    });
  });

  test.describe("the picture of the playground", () => {
    /** The two sizes of the picture, by subject: its CSS size, which the file is twice, and the widths it is drawn at. */
    const PLATES = [
      { id: "hero", width: 400, height: 520, shownAt: [360, 390] },
      {
        id: "heroWide",
        width: 1152,
        height: 640,
        shownAt: [820, 1280, 1440, 1600],
      },
    ] as const;

    /** Scrolls down the page a screen at a time, so every lazy picture that is drawn is fetched, and waits for each to finish. */
    async function scrollThroughPage(page: Page): Promise<void> {
      await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      });
      await page.waitForFunction(() =>
        [...document.images]
          .filter((image) => image.checkVisibility())
          .every((image) => image.complete),
      );
    }

    for (const width of [390, 820, 1440]) {
      for (const colorScheme of ["light", "dark"] as const) {
        test(`fetches one picture, the ${colorScheme} theme's at this size, at ${width}px, shifts nothing, asks no other site and never scrolls sideways`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 900 });
          await page.emulateMedia({ colorScheme });
          const requests: string[] = [];
          page.on("request", (request) => requests.push(request.url()));
          await page.addInitScript(() => {
            const shifts: number[] = [];
            Object.assign(window, { __layoutShifts: shifts });
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const shift = entry as PerformanceEntry & {
                  value: number;
                  hadRecentInput: boolean;
                };
                if (!shift.hadRecentInput) {
                  shifts.push(shift.value);
                }
              }
            }).observe({ type: "layout-shift", buffered: true });
          });
          const product = new ProductPage(page);
          await product.goto();
          await scrollThroughPage(page);

          const pictures = requests
            .map((url) => new URL(url).pathname)
            .filter((path) => /\.webp$/.test(path));
          const size = width < 768 ? "hero" : "heroWide";
          expect(pictures).toHaveLength(1);
          expect(pictures[0]).toMatch(
            new RegExp(`/${size}-${colorScheme}[^/]*\\.webp$`),
          );
          const origin = new URL(page.url()).origin;
          expect(
            requests.filter((url) => new URL(url).origin !== origin),
            "requests to another origin",
          ).toEqual([]);
          const shifted = await page.evaluate(() =>
            (
              (window as unknown as { __layoutShifts: number[] })
                .__layoutShifts ?? []
            ).reduce((sum, value) => sum + value, 0),
          );
          expect(shifted).toBe(0);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
        });
      }
    }

    for (const { id, width: capture, height, shownAt } of PLATES) {
      for (const width of shownAt) {
        test(`draws the ${id} picture whole and no larger than it was taken at ${width}px${id === "hero" ? ", edge to edge" : ""}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: 900 });
          const product = new ProductPage(page);
          await product.goto();
          const frame = page.getByTestId(`plate-${id}`);
          await frame.scrollIntoViewIfNeeded();
          const image = frame.getByRole("img");
          await expect(image).toBeVisible();
          const shown = await image.boundingBox();
          expect(shown?.width).toBeLessThanOrEqual(capture);
          expect((shown?.width ?? 0) / (shown?.height ?? 1)).toBeCloseTo(
            capture / height,
            1,
          );
          if (id === "hero" && width <= capture) {
            expect(shown?.x).toBe(0);
            expect(shown?.width).toBe(width);
          }
          await expect
            .poll(() =>
              image.evaluate(
                (element: HTMLImageElement) => element.naturalWidth,
              ),
            )
            .toBe(capture * 2);
        });
      }
    }

    test("is the largest picture on the page, wider than the text, at its own 1152px from 1280px", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const product = new ProductPage(page);
      await product.goto();
      const image = page.getByTestId("plate-heroWide").getByRole("img");
      await image.scrollIntoViewIfNeeded();
      const shown = (await image.boundingBox())?.width ?? 0;
      expect(shown).toBe(1152);
      const text = await page
        .getByRole("region", { name: "Embed a map" })
        .locator("p")
        .first()
        .boundingBox();
      expect(shown).toBeGreaterThan((text?.width ?? 0) * 1.5);
      // The hero's contour motif is the faint ground behind the words, not a picture.
      const others = await page.evaluate(() =>
        [...document.querySelectorAll("main svg, main img")]
          .filter((element) => element.checkVisibility())
          .filter((element) => !element.closest("[data-testid=hero-motif]"))
          .map(
            (element) =>
              element.getBoundingClientRect().width *
              element.getBoundingClientRect().height,
          ),
      );
      const largest = Math.max(...others);
      const picture = await image.evaluate(
        (element) =>
          element.getBoundingClientRect().width *
          element.getBoundingClientRect().height,
      );
      expect(picture).toBe(largest);
    });

    test("follows a theme chosen on the page, whatever the system prefers", async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: "light" });
      const product = new ProductPage(page);
      await product.goto();
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "dark";
      });
      const demo = page.getByTestId("demo");
      await demo.scrollIntoViewIfNeeded();
      await expect(demo.getByRole("img")).toHaveCount(1);
      await expect(demo.getByRole("img")).toHaveAttribute(
        "src",
        /-dark[^/]*\.webp$/,
      );
    });

    test("credits the map under the picture with links to the credited pages", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      const credits = page.getByTestId("demo").getByText("Map credits:");
      await expect(credits).toContainText("OpenStreetMap contributors");
      await expect(credits).toContainText("OpenFreeMap");
      await expect(
        credits.getByRole("link", { name: "© OpenStreetMap contributors" }),
      ).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    });

    test("loads nothing of the map: the picture is a capture, and the playground is one link away", async ({
      page,
    }) => {
      const requests: string[] = [];
      page.on("request", (request) => requests.push(request.url()));
      const product = new ProductPage(page);
      await product.goto();
      await page.getByTestId("demo").scrollIntoViewIfNeeded();
      expect(
        requests.filter((url) => /maplibre|\.pbf|tiles|style\.json/i.test(url)),
        "map requests",
      ).toEqual([]);
      await expect(page.getByTestId("map-host")).toHaveCount(0);
    });

    test.describe("without a script", () => {
      test.use({ javaScriptEnabled: false });

      test("still shows the picture, whole, with its credits, and never scrolls sideways", async ({
        page,
      }) => {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto("/");
        const demo = page.getByTestId("demo");
        const image = demo.locator("img:visible");
        await expect(image).toHaveCount(1);
        await image.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            image.evaluate(
              (element: HTMLImageElement) =>
                element.complete && element.naturalWidth > 0,
            ),
          )
          .toBe(true);
        await expect(demo.getByText("Map credits:")).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(390);
      });
    });
  });

  for (const [name, path, key] of [
    ["the product page", "/", "PageDown"],
    ["the product page", "/", "Space"],
    ["the product page", "/", "ArrowDown"],
    ["the privacy page", "/privacy", "PageDown"],
  ] as const) {
    test(`scrolls ${name} with ${key} straight after it loads`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 600 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const before = await page.evaluate(() => window.scrollY);
      await page.keyboard.press(key);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(before);
    });
  }

  for (const [name, path] of [
    ["the product page", "/"],
    ["the privacy page", "/privacy"],
  ] as const) {
    test(`scrolls ${name} with the mouse wheel`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 600 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.mouse.move(720, 300);
      await page.mouse.wheel(0, 400);
      await expect
        .poll(() => page.evaluate(() => window.scrollY))
        .toBeGreaterThan(0);
    });
  }

  test("puts two of the largest spacing steps between sections on a wide screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const gaps = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("main > section")];
      return sections.slice(1).map((next, index) => {
        const last = sections[index]?.lastElementChild;
        const heading = next.querySelector("h2");
        return (
          (heading?.getBoundingClientRect().top ?? Number.NaN) -
          (last?.getBoundingClientRect().bottom ?? Number.NaN)
        );
      });
    });
    expect(gaps.length).toBeGreaterThan(2);
    for (const gap of gaps) {
      // tokens.space.xl is 32 px.
      expect(gap).toBeCloseTo(64, 0);
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`puts the picture of the playground straight under the hero, wider than the hero's words, at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      const layout = await page.evaluate(() => {
        const main = document.querySelector("main") as Element;
        const hero = main.children[0]?.getBoundingClientRect();
        const demo = main.children[1];
        const frame = [...(demo?.children ?? [])]
          .find((child) => getComputedStyle(child).display !== "none")
          ?.getBoundingClientRect();
        const words = document
          .querySelector("h1")
          ?.parentElement?.getBoundingClientRect();
        return {
          isFigure: demo?.tagName,
          gap: (frame?.top ?? 0) - (hero?.bottom ?? 0),
          frameWidth: frame?.width ?? 0,
          wordsWidth: words?.width ?? 0,
        };
      });
      expect(layout.isFigure).toBe("FIGURE");
      expect(layout.gap).toBeGreaterThanOrEqual(0);
      expect(layout.gap).toBeLessThanOrEqual(1);
      expect(layout.frameWidth).toBeGreaterThan(layout.wordsWidth);
    });
  }

  test("puts each group's heading closer to what it heads than the groups are to each other", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll("main section h3")].map((heading) => {
        const box = heading.getBoundingClientRect();
        const after = heading.nextElementSibling?.getBoundingClientRect();
        return {
          text: heading.textContent,
          after: (after?.top ?? Number.NaN) - box.bottom,
        };
      }),
    );
    expect(headings.length).toBeGreaterThan(4);
    for (const { text, after } of headings) {
      expect(after, `${text}: gap after`).toBeGreaterThan(0);
      // tokens.space.xs is 8 px; groups and benefits are tokens.space.xl, 32 px, apart.
      expect(after, `${text}: close to what it heads`).toBeLessThanOrEqual(8);
    }
  });

  test("skips to the main content from the first Tab", async ({ page }) => {
    const product = new ProductPage(page);
    await product.goto();
    await page.keyboard.press("Tab");
    await expect(product.skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(product.main).toBeFocused();
  });

  test("serves its Markdown twin and the files for crawlers and models", async ({
    request,
  }) => {
    for (const [path, type] of [
      ["/index.md", "text/markdown"],
      ["/llms.txt", "text/plain"],
      ["/llms-full.txt", "text/plain"],
      ["/robots.txt", "text/plain"],
      ["/sitemap.xml", "application/xml"],
    ] as const) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain(type);
    }
    const markdown = await (await request.get("/index.md")).text();
    expect(markdown.startsWith(`# ${PRODUCT_HEADLINE}`)).toBe(true);
    expect((await request.get("/no-such-page")).status()).toBe(404);
  });
});

test.describe("scripts", () => {
  /** The page's markup as the server sends it. */
  async function markup(
    request: import("@playwright/test").APIRequestContext,
    path: string,
  ) {
    return (await request.get(path)).text();
  }

  test("the product page loads no script file and lists no preloads, the map and privacy pages keep theirs", async ({
    request,
  }) => {
    const product = await markup(request, "/");
    expect(product).not.toMatch(/<script\b[^>]*\ssrc=/);
    expect(product).not.toContain('rel="modulepreload"');
    expect(product).not.toContain("__reactRouterContext");

    for (const path of ["/map", "/privacy"]) {
      const page = await markup(request, path);
      expect(page, path).toContain('rel="modulepreload"');
      expect(page, path).toContain("__reactRouterContext");
    }
  });
});

test.describe("the product page @a11y", () => {
  test.use({ reducedMotion: "reduce" });

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes axe in ${colorScheme} at ${viewport.width}px @a11y`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        const product = new ProductPage(page);
        await product.goto();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          colorScheme,
        );
        // Open every answer, so axe reads all of the page.
        for (const summary of await page.locator("summary").all()) {
          await summary.click();
        }
        expect(await axeViolations(page)).toEqual([]);
        const controls = await inspectControls(page);
        expect(controls.unnamed).toEqual([]);
        expect(controls.positiveTabindex).toEqual([]);
        expect(controls.tooSmall).toEqual([]);
      });
    }
  }

  for (const width of [320, 1280]) {
    test(`text at 200% at ${width}px wide never scrolls the page sideways @a11y`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 720 });
      const product = new ProductPage(page);
      await product.goto();
      // CSSOM, which the strict style CSP allows, unlike a style element.
      await page.evaluate(() =>
        document.documentElement.style.setProperty("font-size", "200%"),
      );
      const overflow = await page
        .getByTestId("product-page")
        .evaluate((element) => ({
          page: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          scroller: element.scrollWidth,
          scrollerClient: element.clientWidth,
        }));
      expect(overflow.page).toBeLessThanOrEqual(overflow.client);
      expect(overflow.scroller).toBeLessThanOrEqual(overflow.scrollerClient);
    });
  }

  test("every control shows a focus ring @a11y", async ({ page }) => {
    const product = new ProductPage(page);
    await product.goto();
    const result = await findMissingFocusRings(page, 80);
    expect(result.visited).toBeGreaterThan(20);
    expect(result.missing).toEqual([]);
  });

  test("reduced motion turns the art's motion off @a11y", async ({ page }) => {
    const product = new ProductPage(page);
    await product.goto();
    expect(await findLongMotion(page)).toEqual([]);
  });

  test.describe("with motion allowed", () => {
    test.use({ reducedMotion: "no-preference" });

    test("the relief strip does not move: no animation runs on the page @a11y", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      const running = await page.evaluate(() =>
        document.getAnimations().map((motion) => motion.playState),
      );
      expect(running).toEqual([]);
    });
  });
});

/**
 * The app layout's and the map route's own chunks and stylesheets (not those the
 * product page shares with them), from the
 * build's route manifest: the files that hold the services, every adapter and
 * layer definition, and the map.
 */
function appLayoutFiles(): string[] {
  // `cf build` writes the client assets under `.cloudflare/output`, in a
  // folder named for the Build Output version, so find the manifest by name.
  const output = fileURLToPath(
    new URL("../.cloudflare/output", import.meta.url),
  );
  const manifestFile = readdirSync(output, { recursive: true })
    .map(String)
    .find((path) => /(^|[\\/])assets[\\/]manifest-[^\\/]+\.js$/.test(path));
  const source = readFileSync(join(output, manifestFile ?? ""), "utf8");
  const manifest = JSON.parse(
    source.slice(source.indexOf("=") + 1).replace(/;\s*$/, ""),
  ) as { routes: Record<string, { module: string; css?: string[] }> };
  const files = (ids: readonly string[]) =>
    ids.flatMap((id) => [
      manifest.routes[id]?.module ?? "",
      ...(manifest.routes[id]?.css ?? []),
    ]);
  // A stylesheet the product page shares (the tokens) is not the app's own.
  const shared = new Set(files(["root", "routes/product"]));
  return files(["routes/app", "routes/map"]).filter(
    (file) => !shared.has(file),
  );
}

/** A hash as a literal piece of a regular expression. */
function literally(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Where the recording clipboard keeps what it was asked to copy. */
const COPIED_KEY = "__productCopies";

/**
 * Replaces the browser's clipboard on the product page before it loads (the
 * page has no test seam): it records each copy, or refuses as a browser does
 * without permission, with the legacy fallback refused too.
 */
async function recordClipboard(
  page: Page,
  { ok }: { readonly ok: boolean },
): Promise<void> {
  await page.addInitScript(
    ({ ok: succeed, key }) => {
      const copies: string[] = [];
      Object.defineProperty(window, key, { value: copies });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (!succeed) {
              throw new DOMException("Refused", "NotAllowedError");
            }
            copies.push(text);
          },
        },
      });
      if (!succeed) {
        document.execCommand = () => false;
      }
    },
    { ok, key: COPIED_KEY },
  );
}

/** Everything the recording clipboard copied. */
function copiedTexts(page: Page): Promise<string[]> {
  return page.evaluate(
    (key) => [...((window as unknown as Record<string, string[]>)[key] ?? [])],
    COPIED_KEY,
  );
}

/** The computed styles a hover or press changes. */
function interactionStyle(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      transform: style.transform,
      textDecorationLine: style.textDecorationLine,
      textDecorationThickness: style.textDecorationThickness,
    };
  });
}
