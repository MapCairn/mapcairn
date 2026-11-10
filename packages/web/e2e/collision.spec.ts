import { endStackMinHeightForZoom } from "../../map/src/chrome/EndStack/endStackHeight";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { inspectChromeLayout } from "./support/layout";
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

// Reduced motion so the sheet and the slots land at once; the layout itself
// is the same with motion on.
test.use({ reducedMotion: "reduce", fastCredits: true });

// Each test walks every chrome state in two themes on one page, so it gets more time.
test.setTimeout(120_000);

/**
 * Checks the end stack at rest with "Show zoom buttons" switched on, the
 * stack at its tallest (every button, the zoom group, no compass).
 *
 * The stack's content height must be what `endStackMinHeightForZoom` says,
 * plus the stack's own padding, so the number the app decides with is the one
 * the browser lays out. Then either everything fits and both zoom buttons are
 * on screen and not covered, or the stack scrolls (DESIGN.md, "Layout and
 * slots"): both zoom buttons are then on screen or scrolled away inside it,
 * and scrolling to the end brings both of them and the Settings button fully
 * into the stack's visible box.
 */
async function checkEndStackAtRest(
  mapPage: MapPage,
  report: Awaited<ReturnType<typeof inspectChromeLayout>>,
  context: string,
): Promise<void> {
  const stack = mapPage.page.getByTestId("end-stack");
  const measured = await stack.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      padding:
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom),
    };
  });
  const contentHeight = measured.scrollHeight - measured.padding;
  expect(
    Math.abs(contentHeight - endStackMinHeightForZoom(false, true, true)),
    `content ${contentHeight}px against endStackMinHeightForZoom`,
  ).toBeLessThanOrEqual(1);

  expect(
    report.zoomButtonsChecked + report.zoomButtonsScrolledAway,
    context,
  ).toBe(2);
  if (measured.scrollHeight <= measured.clientHeight + 1) {
    expect(report.zoomButtonsChecked, context).toBe(2);
    return;
  }

  await stack.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
  });
  const stackBox = await stack.boundingBox();
  if (!stackBox) {
    throw new Error("The end stack has no box.");
  }
  for (const button of [
    mapPage.zoomInButton,
    mapPage.zoomOutButton,
    mapPage.settingsButton,
  ]) {
    const box = await button.boundingBox();
    if (!box) {
      throw new Error("A control has no box after scrolling the end stack.");
    }
    expect(
      box.y,
      "top of a control in the scrolled stack",
    ).toBeGreaterThanOrEqual(stackBox.y - 1);
    expect(
      box.y + box.height,
      "bottom of a control in the scrolled stack",
    ).toBeLessThanOrEqual(stackBox.y + stackBox.height + 1);
  }
  await stack.evaluate((element) => {
    element.scrollTo({ top: 0 });
  });
}

/**
 * Walks every chrome state and checks the layout in each one. With
 * `zoomForcedOn`, the end stack is checked at rest (see
 * {@link checkEndStackAtRest}) and, in every state, the zoom group is either
 * on screen or scrolled inside the end stack, never gone.
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
        if (state === "rest") {
          await checkEndStackAtRest(mapPage, report, context);
        } else {
          expect(
            report.zoomButtonsChecked + report.zoomButtonsScrolledAway,
            context,
          ).toBe(2);
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
          await collapseCredits(mapPage);
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
