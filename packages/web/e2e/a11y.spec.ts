// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import {
  axeViolations,
  findLongMotion,
  findMissingFocusRings,
  inspectControls,
} from "./support/a11y";
import { inspectChromeLayout } from "./support/layout";
import {
  photonAnswer,
  SUGGESTED_PLACES,
  SUGGESTION_PATTERN,
} from "./support/network";
import { scriptSearch } from "./support/services";
import {
  CHROME_STATES,
  collapseCredits,
  enterState,
  leaveState,
  MATRIX_VIEWPORTS,
  viewportDetails,
  waitForStableLayout,
} from "./support/states";
import { SUGGEST_DEBOUNCE_MS, TIMER_SLACK_MS } from "./support/timers";

/*
 * Accessibility: axe with the WCAG 2.0, 2.1 and 2.2 A and AA tags plus best
 * practice, no rule disabled, over the same matrix as the collision test;
 * then the checks axe cannot make by itself. Every title carries @a11y, so
 * `npm run a11y` runs these and `npm run e2e` leaves them out.
 */

test.use({ reducedMotion: "reduce", fastCredits: true });

/** Runs axe and the control checks in every chrome state. */
async function auditStates(mapPage: MapPage, label: string): Promise<void> {
  for (const state of CHROME_STATES) {
    await test.step(`${label}, ${state}`, async () => {
      await enterState(mapPage, state);
      await waitForStableLayout(mapPage.page);
      expect(await axeViolations(mapPage.page)).toEqual([]);
      const controls = await inspectControls(mapPage.page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.positiveTabindex).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
      await leaveState(mapPage, state);
    });
  }
}

test.describe("axe and control checks @a11y", () => {
  test.setTimeout(120_000);

  for (const viewport of MATRIX_VIEWPORTS) {
    test(
      `passes at ${viewport.width}x${viewport.height} @a11y`,
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        await page.setViewportSize(viewport);
        await scriptSearch(page);
        await mapPage.goto();
        for (const colorScheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme });
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            colorScheme,
          );
          await auditStates(mapPage, colorScheme);
        }
      },
    );
  }

  for (const path of ["/privacy", "/this-route-does-not-exist"]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`${path} passes in ${colorScheme} @a11y`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await axeViolations(page)).toEqual([]);
        const controls = await inspectControls(page);
        expect(controls.unnamed).toEqual([]);
        expect(controls.tooSmall).toEqual([]);
      });
    }
  }
});

test.describe("search suggestions @a11y", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      test(`the open suggestion list passes axe in ${colorScheme} at ${viewport.width}px @a11y`, async ({
        page,
        mapPage,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await page.route(SUGGESTION_PATTERN, (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(photonAnswer(SUGGESTED_PLACES)),
          }),
        );
        await mapPage.goto();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          colorScheme,
        );
        await mapPage.searchInput.fill("cape");
        await page.clock.runFor(SUGGEST_DEBOUNCE_MS + TIMER_SLACK_MS);
        const options = page
          .getByRole("listbox", { name: "Suggestions" })
          .getByRole("option");
        await expect(options).toHaveCount(3);
        await page.keyboard.press("ArrowDown");
        await expect(options.first()).toHaveAttribute("aria-selected", "true");
        await waitForStableLayout(page);
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  }
});

test.describe("focus @a11y", () => {
  test("every control shows a focus ring @a11y", async ({ page, mapPage }) => {
    // Four surfaces are walked on one page, each a full tab cycle.
    test.setTimeout(90_000);
    await scriptSearch(page);
    await mapPage.goto();
    let result = await findMissingFocusRings(page);
    expect(result.visited).toBeGreaterThan(6);
    expect(result.missing).toEqual([]);

    await mapPage.openMapOptions();
    result = await findMissingFocusRings(page, 120);
    // The walk starts in the open sheet, then goes round the chrome. Measured:
    // 34 stops on a phone and 36 with a mouse (which has the zoom buttons),
    // the sheet's Basemap, Pin, Layers, Shapes and Save image controls
    // included. Settings and Help moved to their own sheet.
    expect(result.visited).toBeGreaterThanOrEqual(34);
    expect(result.missing).toEqual([]);

    // Each walk wraps round to the search box, and focusing it opens search,
    // which closes the open surface (one at a time). So every surface starts
    // from a freshly loaded page.
    await mapPage.goto();
    await mapPage.openSettings();
    result = await findMissingFocusRings(page, 120);
    // Measured: 17 stops on a phone and 19 with a mouse. Six are in the sheet:
    // Close, the theme and units groups, the two switches and the privacy
    // link. Help has no controls.
    expect(result.visited).toBeGreaterThanOrEqual(17);
    expect(result.missing).toEqual([]);

    await mapPage.goto();
    await mapPage.startMeasuring();
    result = await findMissingFocusRings(page);
    expect(result.missing).toEqual([]);

    await mapPage.goto();
    await collapseCredits(mapPage);
    await mapPage.creditsButton.click();
    result = await findMissingFocusRings(page);
    expect(result.missing).toEqual([]);
  });

  test("the map region shows its focus ring @a11y", async ({ mapPage }) => {
    await mapPage.goto();
    await mapPage.skipLink.focus();
    await mapPage.page.keyboard.press("Enter");
    await expect(mapPage.region).toBeFocused();
    // MapView draws the region's ring on ::after, above the engine canvas.
    const ring = await mapPage.region.evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        outline:
          style.outlineStyle !== "none" &&
          Number.parseFloat(style.outlineWidth) >= 2,
        shadow: style.boxShadow !== "none",
      };
    });
    expect(ring.outline || ring.shadow).toBe(true);
  });
});

test.describe("preferences @a11y", () => {
  test("reduced motion turns every transition and animation off @a11y", async ({
    page,
    mapPage,
  }) => {
    await scriptSearch(page);
    await mapPage.goto();
    for (const state of CHROME_STATES) {
      await enterState(mapPage, state);
      expect(await findLongMotion(page), state).toEqual([]);
      await leaveState(mapPage, state);
    }
  });

  for (const media of [
    { forcedColors: "active" },
    { contrast: "more" },
  ] as const) {
    const name = "forcedColors" in media ? "forced colours" : "more contrast";
    test(`${name} keeps the layout clear in every state @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia(media);
      await scriptSearch(page);
      await mapPage.goto();
      for (const state of CHROME_STATES) {
        await enterState(mapPage, state);
        await waitForStableLayout(page);
        const report = await inspectChromeLayout(page);
        const context = JSON.stringify(report.boxes);
        expect(report.overlaps, `${state} ${context}`).toEqual([]);
        expect(report.outside, `${state} ${context}`).toEqual([]);
        expect(report.obscured, `${state} ${context}`).toEqual([]);
        await leaveState(mapPage, state);
      }
      if (name === "more contrast") {
        expect(await axeViolations(page)).toEqual([]);
      }
    });
  }

  for (const width of [320, 1280]) {
    test(`text at 200% at ${width}px wide never scrolls the page sideways @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 720 });
      await scriptSearch(page);
      await mapPage.goto();
      // CSSOM, which the strict style CSP allows, unlike a style element.
      await page.evaluate(() =>
        document.documentElement.style.setProperty("font-size", "200%"),
      );
      for (const state of CHROME_STATES) {
        await enterState(mapPage, state);
        await waitForStableLayout(page);
        const overflow = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          scrollX: window.scrollX,
        }));
        expect(overflow.scroll, state).toBeLessThanOrEqual(overflow.client);
        expect(overflow.scrollX, state).toBe(0);
        await leaveState(mapPage, state);
      }
    });
  }
});
