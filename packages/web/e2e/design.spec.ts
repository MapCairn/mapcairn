import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { DesignPage } from "./pages/DesignPage";
import {
  axeViolations,
  findLongMotion,
  findMissingFocusRings,
  inspectControls,
} from "./support/a11y";
import { viewportDetails } from "./support/states";

/*
 * The living style guide at /design. It exists only in development and e2e
 * builds; that a production build has no such route is proven by the build
 * itself (`npm run build` runs scripts/verifyNoTestSeam.mjs, which fails if
 * the page's marker is in the bundle) and by `src/designGuideRoutes.test.ts`,
 * which loads the route table in production mode. Serving a second,
 * production build on another port just to request /design would double the
 * suite's build time for the same proof.
 *
 * Titles tagged @a11y run under `npm run a11y`; the rest under `npm run e2e`.
 */

/** Records Content-Security-Policy violations on `window.__cspViolations`. */
async function recordCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cspViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });
}

function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
  );
}

/**
 * Everything that makes the page wider than the viewport: the document, the
 * page's own scroller, and any element whose box crosses either edge. The
 * nav links are exempt: they scroll sideways inside their own bar by design.
 */
function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) {
      problems.push(`document ${root.scrollWidth} > ${root.clientWidth}`);
    }
    const scroller = document.querySelector(
      '[data-testid="design-guide"]',
    )?.parentElement;
    if (scroller && scroller.scrollWidth > scroller.clientWidth) {
      problems.push(
        `scroller ${scroller.scrollWidth} > ${scroller.clientWidth}`,
      );
    }
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (element.closest("nav ul") && element.tagName !== "UL") {
        continue;
      }
      const box = element.getBoundingClientRect();
      // Empty boxes, and the 1px clipped boxes of visually hidden text (its
      // -1px margin puts them a pixel past the edge), take up no room.
      if (box.width <= 1 || box.height <= 1) {
        continue;
      }
      if (box.right > width + 0.5 || box.left < -0.5) {
        problems.push(
          `${element.tagName.toLowerCase()}.${element.className.toString().split(" ")[0]} spans ${Math.round(box.left)} to ${Math.round(box.right)} of ${width}`,
        );
      }
    }
    return problems;
  });
}

test.describe("design guide", () => {
  test("server-renders with no style attributes and the strict CSP", async ({
    request,
  }) => {
    const response = await request.get("/design");
    expect(response.status()).toBe(200);
    const policy = response.headers()["content-security-policy"];
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain("unsafe-inline");
    const html = await response.text();
    expect(html).toContain('lang="en-GB"');
    expect(html).toContain("MAPCAIRN_DESIGN_GUIDE_MARKER");
    expect(html).not.toMatch(/<[^>]*\sstyle=/);
  });

  test("loads with no console errors and no CSP violations", async ({
    page,
    consoleMessages,
  }) => {
    await recordCspViolations(page);
    const design = new DesignPage(page);
    await design.goto();
    await expect(page).toHaveTitle("Design system | MapCairn");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(design.heading).toHaveCount(1);
    await expect(design.heading).toHaveText("Design system");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(design.nav).toBeVisible();
    await expect(page.getByRole("banner")).toHaveCount(1);
    expect(
      consoleMessages.filter((message) => message.startsWith("error:")),
    ).toEqual([]);
    expect(await cspViolations(page)).toEqual([]);
  });

  test("proves IBM Plex Sans is the font rendering", async ({ page }) => {
    const design = new DesignPage(page);
    await design.goto();
    await expect(design.fontGate).toHaveAttribute("data-font-loaded", "true");
    await expect(design.fontGate).toHaveText("IBM Plex Sans loaded");
  });

  test("the font gate fails when the font cannot download", async ({
    page,
  }) => {
    await page.route("**/*.woff2", (route) => route.abort());
    const design = new DesignPage(page);
    await design.goto();
    await expect(design.fontGate).toHaveAttribute("data-font-loaded", "false");
    await expect(design.fontGate).toContainText("IBM Plex Sans did not load");
  });

  test("the contrast table shows no failing pair", async ({ page }) => {
    const design = new DesignPage(page);
    await design.goto();
    const rows = design.contrastTable.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(10);
    await expect(design.contrastTable).not.toContainText("Fail");
    await expect(design.contrastTable.getByText("Pass")).toHaveCount(count * 2);
  });

  test("never scrolls sideways at 320px wide", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const design = new DesignPage(page);
    await design.goto();
    expect(await horizontalOverflow(page)).toEqual([]);
  });

  test("the theme control sets and remembers the theme through the theme service", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const design = new DesignPage(page);
    await design.goto();
    await design.themeControl.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(design.themeControl).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(
      design.themeControl.getByRole("radio", { name: "Dark" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("a nav link brings its section into view below the sticky nav", async ({
    page,
  }) => {
    const design = new DesignPage(page);
    await design.goto();
    await design.nav.getByRole("link", { name: "Components" }).click();
    const heading = page.getByRole("heading", { level: 2, name: "Components" });
    await expect(heading).toBeInViewport();
    const navBox = await design.nav.boundingBox();
    const headingBox = await heading.boundingBox();
    expect(headingBox?.y ?? 0).toBeGreaterThanOrEqual(
      (navBox?.y ?? 0) + (navBox?.height ?? 0),
    );
  });

  test("the keyboard reaches every interactive demo", async ({ page }) => {
    const design = new DesignPage(page);
    await design.goto();
    // Natively disabled controls (the disabled Radix switch, slider and
    // segmented control) are out of the Tab order by design, so they are left
    // out; aria-disabled buttons stay focusable and are included. A segmented
    // control is one tab stop, which is its roving tabindex.
    const stops = await page.evaluate(() => {
      const main = document.querySelector('[data-testid="design-guide"]');
      const controls = [
        ...(main?.querySelectorAll<HTMLElement>(
          "a[href], button, input, select, textarea, [tabindex]",
        ) ?? []),
      ].filter(
        (element) =>
          element.tabIndex >= 0 &&
          !(element as HTMLButtonElement).disabled &&
          element.checkVisibility(),
      );
      return controls.map((element, index) => {
        element.dataset.e2eStop = String(index);
        return `${index} ${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 30)}`;
      });
    });
    expect(stops.length).toBeGreaterThan(25);

    // A segmented control's group is a tab stop that hands focus straight to
    // its checked item, so focus inside a stop counts as reaching it.
    const reached = new Set<string>();
    for (let press = 0; press < stops.length + 40; press += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const found: string[] = [];
        for (
          let node = document.activeElement as HTMLElement | null;
          node;
          node = node.parentElement
        ) {
          if (node.dataset.e2eStop !== undefined) {
            found.push(node.dataset.e2eStop);
          }
        }
        return found;
      });
      for (const stop of focused) {
        reached.add(stop);
      }
      if (reached.size === stops.length) {
        break;
      }
    }
    expect(
      stops.filter((stop) => !reached.has(stop.split(" ")[0] ?? "")),
    ).toEqual([]);
  });

  test("the skip link is the first tab stop and moves focus to the content", async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName === "webkit",
      "WebKit leaves links out of the Tab order by default",
    );
    const design = new DesignPage(page);
    await design.goto();
    await page.keyboard.press("Tab");
    await expect(design.skipLink).toBeFocused();
    await expect(design.skipLink).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(design.main).toBeFocused();
  });
});

test.describe("design guide accessibility @a11y", () => {
  test.use({ reducedMotion: "reduce" });
  // The guide renders every token and primitive, about 1,500 elements. One
  // load takes 2 to 3 s and one full axe scan 3 to 4 s on an idle machine,
  // so a test that loads and scans twice ran 16 to 24 s and passed the 30 s
  // default only narrowly with two workers. Narrowing the scan would leave
  // parts of the page unchecked, so these tests get triple the time instead.
  test.slow();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(
        `passes axe and the control checks in the ${colorScheme} theme at ${viewport.width}x${viewport.height} @a11y`,
        viewportDetails(viewport),
        async ({ page }) => {
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          const design = new DesignPage(page);
          await design.goto();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            colorScheme,
          );
          expect(await axeViolations(page)).toEqual([]);
          const controls = await inspectControls(page);
          expect(controls.unnamed).toEqual([]);
          expect(controls.positiveTabindex).toEqual([]);
          expect(controls.tooSmall).toEqual([]);
          expect(controls.under44).toEqual([]);
        },
      );
    }
  }

  test("every control shows a focus ring @a11y", async ({ page }) => {
    const design = new DesignPage(page);
    await design.goto();
    const result = await findMissingFocusRings(page, 160);
    expect(result.visited).toBeGreaterThan(30);
    expect(result.missing).toEqual([]);
  });

  test("reduced motion turns every transition and animation off @a11y", async ({
    page,
  }) => {
    const design = new DesignPage(page);
    await design.goto();
    expect(await findLongMotion(page)).toEqual([]);
  });

  test("forced colours keep the page readable and in bounds @a11y", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.setViewportSize({ width: 320, height: 568 });
    const design = new DesignPage(page);
    await design.goto();
    expect(await axeViolations(page)).toEqual([]);
    expect(await horizontalOverflow(page)).toEqual([]);
    const result = await findMissingFocusRings(page, 160);
    expect(result.missing).toEqual([]);
  });

  test("more contrast passes axe @a11y", async ({ page }) => {
    await page.emulateMedia({ contrast: "more" });
    const design = new DesignPage(page);
    await design.goto();
    expect(await axeViolations(page)).toEqual([]);
  });
});
