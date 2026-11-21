// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PRODUCT_HEADLINE, ProductPage } from "./pages/ProductPage";
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

const SITE = "https://mapcairn.timothybrits.co.za";

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

  test("makes View on GitHub the first action, beside Try the playground and View on npm", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await expect(product.heroGitHub).toHaveAttribute(
      "href",
      "https://github.com/MapCairn/mapcairn",
    );
    const github = await product.heroGitHub.boundingBox();
    const playground = await product.heroPlayground.boundingBox();
    const npm = await product.heroNpm.boundingBox();
    await expect(product.heroNpm).toHaveAttribute(
      "href",
      "https://www.npmjs.com/package/@mapcairn/sdk",
    );
    expect(github?.height).toBeGreaterThanOrEqual(44);
    expect(playground?.height).toBe(github?.height);
    expect(npm?.height).toBe(github?.height);
  });

  test("links to the repository from the hero's button and the footer's Source code only", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    const repository = page.locator('a[href^="https://github.com/"]');
    await expect(repository).toHaveCount(2);
    await expect(product.header.locator('a[href^="https://"]')).toHaveCount(0);
    await expect(
      product.footer.getByRole("link", { name: "Source code" }),
    ).toHaveAttribute("href", "https://github.com/MapCairn/mapcairn");
  });

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

  for (const [name, lat, lng] of [
    ["Open the playground over Cape Town", -33.92, 18.42],
    ["Open the playground over the whole world", 20, 0],
  ] as const) {
    test(`follows "${name}" to a working map over that place`, async ({
      page,
      mapPage,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      await page.getByRole("link", { name }).click();
      await mapPage.waitForMap();
      const view = await mapPage.hashView();
      expect(view?.lat).toBeCloseTo(lat, 1);
      expect(view?.lng).toBeCloseTo(lng, 1);
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
        product.main.getByRole("button", { name: "Copied" }),
      ).toBeFocused();
      await expect(page.getByTestId("live-region-polite")).toHaveText(
        "Code copied",
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
        product.main.getByRole("button", { name: "Copied" }),
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
        product.main.getByRole("button", { name: "Copy failed" }),
      ).toBeFocused();
      await expect(page.getByTestId("live-region-assertive")).toHaveText(
        "Could not copy. Select the code and copy it manually.",
      );
      await expect.poll(() => copiedTexts(page)).toEqual([]);
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
      const resting = await interactionStyle(product.heroGitHub);
      expect(resting.boxShadow).toBe("none");
      expect(resting.transform).toBe("none");

      await product.heroGitHub.hover();
      // A transform settles a frame after the state changes, so poll for it.
      await expect
        .poll(
          async () => (await interactionStyle(product.heroGitHub)).transform,
        )
        .toBe("matrix(1, 0, 0, 1, 0, -1)");
      const hovered = await interactionStyle(product.heroGitHub);
      expect(hovered.boxShadow).not.toBe("none");
      // The colours stay the AA pair they were.
      expect(hovered.color).toBe(resting.color);
      expect(hovered.backgroundColor).toBe(resting.backgroundColor);

      await page.mouse.down();
      await expect
        .poll(
          async () => (await interactionStyle(product.heroGitHub)).transform,
        )
        .toBe("matrix(0.98, 0, 0, 0.98, 0, 0)");
      expect((await interactionStyle(product.heroGitHub)).boxShadow).toBe(
        "none",
      );
      await page.mouse.up();
    });

    test("the secondary action, the header link and the copy button take the accent tint under a pointer", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "Hover needs a pointer that can hover.");
      const product = new ProductPage(page);
      await product.goto();
      for (const target of [
        product.heroPlayground,
        product.heroNpm,
        product.headerPlayground,
        product.copyCode,
      ]) {
        const resting = await interactionStyle(target);
        await target.hover();
        const hovered = await interactionStyle(target);
        expect(hovered.backgroundColor).not.toBe(resting.backgroundColor);
        await page.mouse.move(0, 0);
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
        (await interactionStyle(product.heroGitHub)).textDecorationLine,
      ).toBe("none");
      await product.heroGitHub.hover();
      expect(
        (await interactionStyle(product.heroGitHub)).textDecorationLine,
      ).toBe("underline");
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
      const actions = [
        product.heroGitHub,
        product.heroPlayground,
        product.heroNpm,
        product.copyCode,
      ];
      const readable = async (action: Locator) => {
        const style = await interactionStyle(action);
        expect(style.backgroundColor).toBe(canvas);
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
        product.main.getByRole("button", { name: "Copied" }),
      ).toBeVisible();
      const tapped = await interactionStyle(product.copyCode);
      expect(tapped.backgroundColor).toBe(resting.backgroundColor);
      expect(tapped.boxShadow).toBe("none");
      expect(tapped.transform).toBe("none");
    });
  });

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`draws the art's marks where they belong at ${viewport.width}px in ${colorScheme}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        const product = new ProductPage(page);
        await product.goto();
        const art = page.getByTestId("survey-art");
        await art.scrollIntoViewIfNeeded();
        const marks = await art.evaluate((svg) => {
          /** A point in an element's own coordinates, on the screen. */
          const onScreen = (element: Element | null, x: number, y: number) => {
            const matrix = (element as SVGGraphicsElement).getScreenCTM();
            const point = new DOMPoint(x, y).matrixTransform(
              matrix ?? undefined,
            );
            return { x: point.x, y: point.y };
          };
          const tip = svg.querySelector('[data-anchor="pin-tip"]');
          const line = svg.querySelector<SVGLineElement>(
            '[data-anchor="measure-line"]',
          );
          const cross = svg.querySelector<SVGCircleElement>(
            '[data-anchor="crosshair"]',
          );
          const north = svg.querySelector<SVGPathElement>(
            '[data-anchor="north"]',
          );
          const quarters = [
            ...svg.querySelectorAll<SVGRectElement>(
              '[data-anchor="scale-quarter"]',
            ),
          ].map((rect) => rect.getBBox());
          const arms = [
            ...(cross?.parentElement?.querySelectorAll("line") ?? []),
          ];
          const crossCentre = {
            x: cross?.cx.baseVal.value ?? Number.NaN,
            y: cross?.cy.baseVal.value ?? Number.NaN,
          };
          const northBox = north?.getBBox();
          return {
            tip: onScreen(tip, 0, 0),
            lineStart: onScreen(
              line,
              line?.x1.baseVal.value ?? Number.NaN,
              line?.y1.baseVal.value ?? Number.NaN,
            ),
            armsMeetCentre: arms.every((arm) => {
              const { x1, y1, x2, y2 } = arm;
              return (
                (y1.baseVal.value === crossCentre.y &&
                  y2.baseVal.value === crossCentre.y) ||
                (x1.baseVal.value === crossCentre.x &&
                  x2.baseVal.value === crossCentre.x)
              );
            }),
            // A DOMPoint does not survive the trip out of the page, so copy its numbers.
            northTip: north
              ? {
                  x: north.getPointAtLength(0).x,
                  y: north.getPointAtLength(0).y,
                }
              : null,
            northBox: northBox
              ? { x: northBox.x, y: northBox.y, height: northBox.height }
              : null,
            quarterWidths: quarters.map((box) => box.width),
            quarterStarts: quarters.map((box) => box.x),
          };
        });
        // The pin's tip is the measured line's first point, to within a hundredth of a pixel.
        expect(Math.abs(marks.tip.x - marks.lineStart.x)).toBeLessThan(0.01);
        expect(Math.abs(marks.tip.y - marks.lineStart.y)).toBeLessThan(0.01);
        expect(marks.armsMeetCentre).toBe(true);
        // The filled half starts at the arrow's tip, its top-left corner: the
        // tip is straight above the shared edge, so it points up the grid.
        expect(marks.northTip).not.toBeNull();
        expect(marks.northBox).not.toBeNull();
        expect(marks.northTip?.x).toBeCloseTo(
          marks.northBox?.x ?? Number.NaN,
          3,
        );
        expect(marks.northTip?.y).toBeCloseTo(
          marks.northBox?.y ?? Number.NaN,
          3,
        );
        // The scale bar's four quarters are equal and follow one another.
        const [first] = marks.quarterWidths;
        for (const [i, width] of marks.quarterWidths.entries()) {
          expect(width).toBeCloseTo(first ?? 0, 6);
          if (i > 0) {
            expect(marks.quarterStarts[i]).toBeCloseTo(
              (marks.quarterStarts[i - 1] ?? 0) + (first ?? 0),
              6,
            );
          }
        }
        // On a narrow screen the art is cropped round the line, and the pin and the line are still in view.
        const frame = await page.getByTestId("survey-art-frame").boundingBox();
        expect(frame).not.toBeNull();
        if (frame) {
          expect(marks.tip.x).toBeGreaterThan(frame.x);
          expect(marks.tip.x).toBeLessThan(frame.x + frame.width);
          expect(marks.tip.y).toBeGreaterThan(frame.y);
          expect(marks.tip.y).toBeLessThan(frame.y + frame.height);
        }
      });
    }
  }

  test.describe("with motion on", () => {
    test.use({ reducedMotion: "no-preference" });

    test("lands the pin with its tip on the measured line once it has dropped", async ({
      page,
    }) => {
      const product = new ProductPage(page);
      await product.goto();
      const art = page.getByTestId("survey-art");
      await art.evaluate(() =>
        Promise.all(document.getAnimations().map((motion) => motion.finished)),
      );
      const offset = await art.evaluate((svg) => {
        const tip = svg.querySelector<SVGGraphicsElement>(
          '[data-anchor="pin-tip"]',
        );
        const line = svg.querySelector<SVGLineElement>(
          '[data-anchor="measure-line"]',
        );
        const at = (element: SVGGraphicsElement | null, x: number, y: number) =>
          new DOMPoint(x, y).matrixTransform(
            element?.getScreenCTM() ?? undefined,
          );
        const a = at(tip, 0, 0);
        const b = at(
          line,
          line?.x1.baseVal.value ?? Number.NaN,
          line?.y1.baseVal.value ?? Number.NaN,
        );
        return Math.hypot(a.x - b.x, a.y - b.y);
      });
      expect(offset).toBeLessThan(0.01);
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
    test(`leaves the same gap under the hero as between sections at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      const gaps = await page.evaluate(() => {
        const top = (element: Element | null | undefined) =>
          element?.getBoundingClientRect().top ?? Number.NaN;
        const bottom = (element: Element | null | undefined) =>
          element?.getBoundingClientRect().bottom ?? Number.NaN;
        const main = document.querySelector("main");
        const hero = main?.firstElementChild;
        const sections = [...document.querySelectorAll("main > section")];
        // The hero's content ends with whichever of its words and art is lower.
        const heroEnd = Math.max(
          ...[...(hero?.children ?? [])].map((child) => bottom(child)),
        );
        return {
          underHero: top(sections[0]?.querySelector("h2")) - heroEnd,
          betweenSections:
            top(sections[1]?.querySelector("h2")) -
            bottom(sections[0]?.lastElementChild),
        };
      });
      expect(gaps.betweenSections).toBeCloseTo(64, 0);
      expect(gaps.underHero).toBeCloseTo(gaps.betweenSections, 0);
    });
  }

  test("puts each subheading closer to what it heads than to what comes before it", async ({
    page,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    const subheadings = await page.evaluate(() =>
      [...document.querySelectorAll("main > section > h3")].map((heading) => {
        const box = heading.getBoundingClientRect();
        const before = heading.previousElementSibling?.getBoundingClientRect();
        const after = heading.nextElementSibling?.getBoundingClientRect();
        return {
          text: heading.textContent,
          before: box.top - (before?.bottom ?? Number.NaN),
          after: (after?.top ?? Number.NaN) - box.bottom,
        };
      }),
    );
    expect(subheadings.length).toBeGreaterThan(1);
    for (const { text, before, after } of subheadings) {
      expect(after, `${text}: gap after`).toBeGreaterThan(0);
      expect(after, `${text}: closer to what follows`).toBeLessThan(before);
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

test.describe("script preloads", () => {
  /** The document's text before and after its `</head>`. */
  async function splitAtHead(
    request: import("@playwright/test").APIRequestContext,
    path: string,
  ) {
    const html = await (await request.get(path)).text();
    const [head = "", body = ""] = html.split("</head>");
    return { head, body };
  }

  test("the product page lists them after its content, the map and privacy pages in the head", async ({
    request,
  }) => {
    const product = await splitAtHead(request, "/");
    expect(product.head).not.toContain('rel="modulepreload"');
    expect(product.body).toContain('rel="modulepreload"');

    for (const path of ["/map", "/privacy"]) {
      const page = await splitAtHead(request, path);
      expect(page.head, path).toContain('rel="modulepreload"');
      expect(page.body, path).not.toContain('rel="modulepreload"');
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
