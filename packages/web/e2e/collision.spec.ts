import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  CHROME_STATES,
  enterState,
  leaveState,
  MATRIX_VIEWPORTS,
  viewportDetails,
  waitForCreditsCollapsed,
  waitForStableLayout,
} from "./support/states";

// Reduced motion so the sheet and the slots land at once; the layout itself
// is the same with motion on.
test.use({ reducedMotion: "reduce" });

// Each test walks every chrome state in two themes on one page, so it gets more time.
test.setTimeout(120_000);

/**
 * Walks every chrome state and checks the layout in each one. With
 * `zoomForcedOn`, the zoom group must be on screen at rest and, in every
 * state, either on screen or scrolled inside the end stack, never gone.
 */
async function walkStates(
  mapPage: MapPage,
  label: string,
  zoomForcedOn: boolean,
): Promise<void> {
  for (const state of CHROME_STATES) {
    await test.step(`${label}, ${state}`, async () => {
      await enterState(mapPage, state);
      await waitForStableLayout(mapPage.page);
      const report = await inspectChromeLayout(mapPage.page);
      const context = JSON.stringify(report.boxes);
      expect(report.overlaps, context).toEqual([]);
      expect(report.outside, context).toEqual([]);
      expect(report.obscured, context).toEqual([]);
      if (zoomForcedOn) {
        await expect(mapPage.zoomControls).toBeAttached();
        expect(
          report.zoomButtonsChecked + report.zoomButtonsScrolledAway,
          context,
        ).toBe(2);
        if (state === "rest") {
          expect(report.zoomButtonsChecked, context).toBe(2);
        }
      }
      await leaveState(mapPage, state);
    });
  }
}

/*
 * The credits popover must be usable on every screen, the short landscape
 * phone above all, where the end stack leaves little room above the button:
 * every credit link is shown in full, nothing scrolls, and the open popover
 * still collides with nothing. With the zoom buttons switched on, the end
 * stack is at its tallest.
 */
for (const viewport of MATRIX_VIEWPORTS) {
  test(
    `the credits show every link without scrolling at ${viewport.width}x${viewport.height}`,
    viewportDetails(viewport),
    async ({ page, mapPage }) => {
      await page.setViewportSize(viewport);
      for (const zoomButtons of ["default", "on"] as const) {
        await test.step(`zoom buttons ${zoomButtons}`, async () => {
          if (zoomButtons === "on") {
            await page.addInitScript(() => {
              localStorage.setItem("karta:zoomButtons", "true");
            });
          }
          await mapPage.goto();
          await waitForCreditsCollapsed(mapPage);
          await mapPage.creditsButton.click();
          await expect(mapPage.creditsRegion).toBeVisible();
          await waitForStableLayout(page);
          const fit = await mapPage.creditsRegion.evaluate((region) => {
            const box = region.getBoundingClientRect();
            const links = [...region.querySelectorAll("a[href]")];
            return {
              scrolls: region.scrollHeight > region.clientHeight + 1,
              links: links.length,
              clipped: links
                .filter((link) => {
                  const own = link.getBoundingClientRect();
                  return (
                    own.top < box.top - 0.5 ||
                    own.bottom > box.bottom + 0.5 ||
                    own.left < box.left - 0.5 ||
                    own.right > box.right + 0.5
                  );
                })
                .map((link) => link.textContent),
            };
          });
          expect(fit.links).toBeGreaterThan(0);
          expect(fit.clipped).toEqual([]);
          expect(fit.scrolls).toBe(false);
          const report = await inspectChromeLayout(page);
          const context = JSON.stringify(report.boxes);
          expect(report.overlaps, context).toEqual([]);
          expect(report.outside, context).toEqual([]);
          expect(report.obscured, context).toEqual([]);
        });
      }
    },
  );
}

/*
 * The layout collision test (DESIGN.md, "Layout and slots"). For every
 * viewport, theme and chrome state, no two floating elements overlap,
 * none leaves the viewport (apart from the bottom sheet's documented
 * translation below the fold) and every control, the zoom buttons above all,
 * is the element under its own centre, so the credits never cover them.
 *
 * Each run also repeats the states with "Show zoom buttons" switched on,
 * because an explicit "on" never yields to a short screen: that is when the
 * end stack is tallest and most likely to collide, on touch devices too.
 */
for (const viewport of MATRIX_VIEWPORTS) {
  test(
    `chrome never collides at ${viewport.width}x${viewport.height}`,
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
        await walkStates(mapPage, colorScheme, false);
      }

      await page.evaluate(() =>
        localStorage.setItem("karta:zoomButtons", "true"),
      );
      await page.reload();
      await mapPage.waitForMap();
      await walkStates(mapPage, "zoom buttons on", true);
    },
  );
}
