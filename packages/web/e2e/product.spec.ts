// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

  test("makes View on GitHub the first action, beside Try the playground", async ({
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
    expect(github?.height).toBeGreaterThanOrEqual(44);
    expect(playground?.height).toBe(github?.height);
    await expect(
      product.closing.getByRole("link", { name: "View on GitHub" }),
    ).toBeVisible();
  });

  for (const viewport of VIEWPORTS) {
    test(`keeps Playground and GitHub in the header at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const product = new ProductPage(page);
      await product.goto();
      await expect(product.headerPlayground).toBeInViewport();
      await expect(product.headerGitHub).toBeInViewport();
    });
  }

  for (const [where, find] of [
    ["the header", (p: ProductPage) => p.headerPlayground],
    ["the hero", (p: ProductPage) => p.heroPlayground],
    [
      "the closing actions",
      (p: ProductPage) =>
        p.closing.getByRole("link", { name: "Try the playground" }),
    ],
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

  test("opens the playground over Cape Town", async ({ page, mapPage }) => {
    const product = new ProductPage(page);
    await product.goto();
    await page
      .getByRole("link", { name: "Open the playground over Cape Town" })
      .click();
    await mapPage.waitForMap();
    const view = await mapPage.hashView();
    expect(view?.lat).toBeCloseTo(-33.92, 1);
    expect(view?.lng).toBeCloseTo(18.42, 1);
  });

  test("opens the playground on the Dark basemap", async ({
    page,
    mapPage,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await page
      .getByRole("link", { name: "Open the playground on the Dark basemap" })
      .click();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: /^Dark/ }),
    ).toBeChecked();
  });

  test("opens the playground with the earthquakes layer on", async ({
    page,
    mapPage,
  }) => {
    const product = new ProductPage(page);
    await product.goto();
    await page
      .getByRole("link", {
        name: "Open the playground with the past day's earthquakes turned on",
      })
      .click();
    await mapPage.waitForMap();
    await expect(page).toHaveURL(/layers=earthquakes/);
    await mapPage.openMapOptions();
    await expect(
      page.getByRole("switch", { name: /^Earthquakes/ }),
    ).toBeChecked();
  });

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
            northTip: north ? north.getPointAtLength(0) : null,
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

/** A hash as a literal piece of a regular expression. */
function literally(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
