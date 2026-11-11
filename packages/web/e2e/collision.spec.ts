import type { Locator } from "@playwright/test";
import { endStackMinHeightForZoom } from "../../map/src/chrome/EndStack/endStackHeight";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  advanceTourTo,
  CHROME_STATES,
  collapseCredits,
  enterState,
  leaveState,
  MATRIX_VIEWPORTS,
  TOUR_STATES,
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
              localStorage.setItem("mapcairn:zoomButtons", "true");
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
        localStorage.setItem("mapcairn:zoomButtons", "true"),
      );
      await page.reload();
      await mapPage.waitForMap();
      await walkStates(mapPage, "zoom buttons on", true);
    },
  );
}

/** How the tour card should be on screen in a state, for {@link expectTourLayout}. */
type TourPresence =
  /** Shown. */
  | "shown"
  /** Gone: the sheet is full and modal. Everything else is behind the sheet, so only the card is checked. */
  | "hidden"
  /** Shown, or gone because the screen leaves it no room beside the sheet. */
  | "shown if there is room";

/**
 * The one matrix viewport where the welcome card cannot sit above an open
 * sheet: it is 277 px tall, and the scale bar that rides above the sheet
 * leaves 154 px under the search pill at half and 274 px at peek. The card
 * gives way there (`data-crowded`) and comes back when the sheet comes down,
 * and it must not give way anywhere else.
 */
const NO_ROOM_BESIDE_SHEET = { width: 320, height: 568 } as const;

/**
 * Checks the floating elements in the state the page is in now: nothing
 * overlaps, nothing leaves the viewport, no control is covered, and the tour
 * card is among the shown elements as `presence` says.
 */
async function expectTourLayout(
  mapPage: MapPage,
  context: string,
  presence: TourPresence,
): Promise<void> {
  await waitForStableLayout(mapPage.page);
  const report = await inspectChromeLayout(mapPage.page);
  const details = `${context}: ${JSON.stringify(report.boxes)}`;
  const tourShown = report.boxes.some((box) => box.name === "tour");
  if (presence === "hidden") {
    expect(tourShown, details).toBe(false);
    expect(
      report.overlaps.filter((overlap) => overlap.includes("tour")),
      details,
    ).toEqual([]);
    return;
  }
  expect(report.overlaps, details).toEqual([]);
  expect(report.outside, details).toEqual([]);
  expect(report.obscured, details).toEqual([]);
  if (presence === "shown") {
    expect(tourShown, details).toBe(true);
  }
}

/**
 * Walks the sheet conditions under the tour card that is showing: no sheet,
 * Map options, Settings and, where the sheet is a bottom sheet, the full
 * detent (the card hides, because the sheet is modal and covers the map), the
 * peek detent and the half detent. The side panel has no detents, so those
 * three are left out.
 *
 * @param roomBesideSheet - False for a screen too small for the card
 *   above an open sheet, where the card may be gone while the sheet is open.
 */
async function walkSheetConditions(
  mapPage: MapPage,
  card: Locator,
  label: string,
  roomBesideSheet: boolean,
): Promise<void> {
  const withSheet: TourPresence = roomBesideSheet
    ? "shown"
    : "shown if there is room";
  await expectTourLayout(mapPage, `${label}, no sheet`, "shown");

  for (const open of [
    () => mapPage.openMapOptions(),
    () => mapPage.openSettings(),
  ]) {
    await open();
    await expectTourLayout(mapPage, `${label}, sheet open`, withSheet);
    await mapPage.sheetClose.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(card).toBeVisible();
  }

  await mapPage.openMapOptions();
  if ((await mapPage.detent()) !== null) {
    await mapPage.sheetHandle.focus();
    await mapPage.page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await expect(card).toBeHidden();
    await expectTourLayout(mapPage, `${label}, sheet at full`, "hidden");
    await mapPage.page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "peek");
    await expectTourLayout(mapPage, `${label}, sheet at peek`, withSheet);
    await mapPage.page.keyboard.press(" ");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "half");
    await expectTourLayout(mapPage, `${label}, sheet at half`, withSheet);
  }
  await mapPage.sheetClose.click();
  await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
  await expect(card).toBeVisible();
}

/*
 * The first-visit tour card in the layout collision test. For every viewport
 * and theme, each card (the welcome card, the three steps and the ending)
 * shares the screen with no other floating element, in the sheet and the side
 * panel layouts and with the sheet closed, open on Map options or Settings,
 * and at each detent. The credits' own first showing is collapsed first: the
 * plan accepts their overlap with the card on a short landscape phone for
 * those five seconds.
 */
test.describe("tour card", () => {
  test.use({ firstVisit: true });

  for (const viewport of MATRIX_VIEWPORTS) {
    test(
      `the tour card never collides at ${viewport.width}x${viewport.height}`,
      viewportDetails(viewport),
      async ({ page, mapPage }) => {
        await page.setViewportSize(viewport);
        const card = page.getByTestId("tour-card");
        const roomBesideSheet = !(
          viewport.width === NO_ROOM_BESIDE_SHEET.width &&
          viewport.height === NO_ROOM_BESIDE_SHEET.height
        );

        for (const colorScheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme });
          // A new first visit: the walk before stored that the tour was answered.
          await page.addInitScript(() => {
            localStorage.removeItem("mapcairn:tourSeen");
          });
          await mapPage.goto();
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            colorScheme,
          );
          await expect(card).toBeVisible();
          await collapseCredits(mapPage);

          for (const state of TOUR_STATES) {
            await advanceTourTo(mapPage, state);
            await walkSheetConditions(
              mapPage,
              card,
              `${colorScheme}, ${state}`,
              roomBesideSheet,
            );
          }
          await card.getByRole("button", { name: "Close" }).click();
          await expect(card).toHaveCount(0);
        }
      },
    );
  }
});
