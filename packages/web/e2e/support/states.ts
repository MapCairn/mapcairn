// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, type Page } from "@playwright/test";
import type { MapPage } from "../pages/MapPage";

/** The chrome states the collision and accessibility matrices walk through. */
export const CHROME_STATES = [
  "rest",
  "sheet open",
  "settings open",
  "search open",
  "measure active",
  "directions open",
  "draw active",
  "pin card",
  "attribution open",
] as const;

/** One of {@link CHROME_STATES}. */
export type ChromeState = (typeof CHROME_STATES)[number];

/**
 * The tag for a matrix test at a desktop-sized viewport. The touch projects
 * leave these out in `playwright.config.ts`: a phone emulated at 1920 pixels
 * wide is not a device anyone has, and the desktop project covers the size.
 */
export const DESKTOP_VIEWPORT_TAG = "@desktop-viewport";

/** The matrix test details for a viewport: wide ones get {@link DESKTOP_VIEWPORT_TAG}. */
export function viewportDetails(viewport: { readonly width: number }): {
  readonly tag: string[];
} {
  return { tag: viewport.width >= 1280 ? [DESKTOP_VIEWPORT_TAG] : [] };
}

/** The viewports of the matrices: phones in both orientations, a tablet and two desktops. */
export const MATRIX_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

/**
 * How long the credits may take to collapse after they show by themselves on
 * first load: the app's five seconds, plus their fade and some slack.
 */
export const CREDITS_COLLAPSE_TIMEOUT_MS = 10_000;

/** How long {@link collapseCredits} lets one jump of the clock take effect before it jumps again. */
const CREDITS_FADE_CHECK_MS = 1_000;

/**
 * Waits for the credits' first showing to start. They begin collapsed, before
 * the map exists, so a collapsed button would otherwise pass a check for
 * "collapsed" too early.
 */
async function waitForCreditsIntro(mapPage: MapPage): Promise<void> {
  await expect(
    mapPage.page.locator('[data-chrome="attribution"]'),
  ).toHaveAttribute("data-intro-started", "true", {
    timeout: CREDITS_COLLAPSE_TIMEOUT_MS,
  });
}

/** Expects the button to say the credits are collapsed and the popover to be hidden. */
async function expectCreditsCollapsed(
  mapPage: MapPage,
  timeout: number,
): Promise<void> {
  await expect(mapPage.creditsButton).toHaveAttribute(
    "aria-expanded",
    "false",
    { timeout },
  );
  await expect(mapPage.creditsRegion).toBeHidden({ timeout });
}

/**
 * Waits until the credits, which show by themselves once the map has started
 * (the OpenStreetMap attribution guidelines), have collapsed on their own
 * timer: the button says it is collapsed and the popover is hidden. Waits on
 * those signals, never a fixed sleep, and so takes the app's real five
 * seconds. Only the test of that timer needs this; the rest use
 * {@link collapseCredits}.
 */
export async function waitForCreditsCollapsed(mapPage: MapPage): Promise<void> {
  await waitForCreditsIntro(mapPage);
  await expectCreditsCollapsed(mapPage, CREDITS_COLLAPSE_TIMEOUT_MS);
}

/**
 * Collapses the credits after their first showing without waiting out the
 * app's real timer: jumps the page's clock forward, so the app's own timer
 * and fade run as they would after five seconds. The test must set the
 * `fastCredits` option, which installs that clock before the page loads.
 */
export async function collapseCredits(mapPage: MapPage): Promise<void> {
  await waitForCreditsIntro(mapPage);
  // The app sets its timer just after the first showing appears, and the fade
  // that follows is a second timer, so jump again until the credits are away.
  await expect(async () => {
    await mapPage.page.clock.fastForward(CREDITS_COLLAPSE_TIMEOUT_MS);
    await expectCreditsCollapsed(mapPage, CREDITS_FADE_CHECK_MS);
  }).toPass({ timeout: CREDITS_COLLAPSE_TIMEOUT_MS });
}

/**
 * Brings the chrome into a state from rest. The page must have scripted
 * search (see `scriptSearch`), so "search open" has results to show.
 */
export async function enterState(
  mapPage: MapPage,
  state: ChromeState,
): Promise<void> {
  switch (state) {
    case "rest":
      // At rest the credits are collapsed, once their first showing is over.
      await collapseCredits(mapPage);
      return;
    case "sheet open":
      await mapPage.openMapOptions();
      return;
    case "settings open":
      await mapPage.openSettings();
      return;
    case "search open":
      await mapPage.search("cape");
      await expect(mapPage.searchOptions).toHaveCount(3);
      await expect(mapPage.searchPanel).toBeVisible();
      return;
    case "measure active":
      await mapPage.startMeasuring();
      await mapPage.measureAddPoint.click();
      await mapPage.focusMap();
      await mapPage.page.keyboard.press("ArrowRight");
      await mapPage.measureAddPoint.click();
      await expect(mapPage.measureUndo).toBeEnabled();
      return;
    case "directions open": {
      const addStop = mapPage.page.getByRole("button", {
        name: "Add stop at map centre",
      });
      await mapPage.directionsButton.click();
      await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
      await expect(
        mapPage.sheet.getByRole("heading", { name: "Directions", level: 2 }),
      ).toBeFocused();
      await addStop.click();
      await mapPage.focusMap();
      await mapPage.page.keyboard.press("ArrowRight");
      await addStop.click();
      await expect(
        mapPage.page.getByRole("button", { name: "Remove stop B" }),
      ).toBeVisible();
      return;
    }
    case "draw active":
      await mapPage.startDrawing();
      await mapPage.drawAddPoint.click();
      await mapPage.focusMap();
      await mapPage.page.keyboard.press("ArrowRight");
      await mapPage.drawAddPoint.click();
      // The number grows each time the state is walked, so it is not pinned.
      await expect(mapPage.drawStatus).toHaveText(/^Polygon \d+, 2 points$/);
      return;
    case "pin card":
      await mapPage.focusMap();
      await mapPage.page.keyboard.press("p");
      await expect(mapPage.pinCard).toBeVisible();
      await expect(mapPage.pinHeading).toBeFocused();
      return;
    case "attribution open":
      await mapPage.creditsButton.click();
      await expect(mapPage.creditsRegion).toBeVisible();
      return;
  }
}

/** Returns the chrome to rest from a state that {@link enterState} produced. */
export async function leaveState(
  mapPage: MapPage,
  state: ChromeState,
): Promise<void> {
  switch (state) {
    case "rest":
      return;
    case "sheet open":
    case "settings open":
      await mapPage.sheetClose.click();
      break;
    case "search open":
      await mapPage.searchClear.click();
      await mapPage.focusMap();
      await expect(mapPage.searchPanel).toBeHidden();
      return;
    case "measure active":
      await mapPage.measureDone.click();
      await expect(mapPage.measureToolbar).toHaveCount(0);
      return;
    case "directions open":
      await mapPage.page
        .getByRole("button", { name: "Clear directions" })
        .click();
      await mapPage.sheetClose.click();
      break;
    case "draw active":
      await mapPage.drawRemove.click();
      await mapPage.drawPrimary.click();
      await expect(mapPage.drawToolbar).toHaveCount(0);
      return;
    case "pin card":
      await mapPage.pinClearButton.click();
      break;
    case "attribution open":
      await mapPage.page.keyboard.press("Escape");
      await expect(mapPage.creditsRegion).toBeHidden();
      return;
  }
  await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
}

/**
 * The first-visit tour cards in the order a person meets them: the welcome
 * card, each step and the ending. See {@link advanceTourTo}.
 */
export const TOUR_STATES = [
  "welcome",
  "step 1",
  "step 2",
  "step 3",
  "ending",
] as const;

/** One of {@link TOUR_STATES}. */
export type TourState = (typeof TOUR_STATES)[number];

/** The button of the card before each state, which moves the tour on to it. */
const TOUR_BUTTON_TO_REACH: Record<Exclude<TourState, "welcome">, string> = {
  "step 1": "Take the tour",
  "step 2": "Next",
  "step 3": "Next",
  ending: "Finish",
};

/**
 * Moves the tour forward to the card for `state`, pressing the button of the
 * card before it. The tour only runs forward, so call this with each state of
 * {@link TOUR_STATES} in turn, from the welcome card of a first visit (the
 * `firstVisit` option); "welcome" itself changes nothing.
 */
export async function advanceTourTo(
  mapPage: MapPage,
  state: TourState,
): Promise<void> {
  const card = mapPage.page.getByTestId("tour-card");
  if (state !== "welcome") {
    await card
      .getByRole("button", { name: TOUR_BUTTON_TO_REACH[state], exact: true })
      .click();
  }
  await expect(card).toBeVisible();
}

/**
 * Waits until no `[data-chrome]` box moves between two reads a frame apart
 * (with reduced motion the sheet and slots move without animation, but the
 * layout still settles over a few ResizeObserver rounds).
 */
export async function waitForStableLayout(page: Page): Promise<void> {
  const read = () =>
    page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return [...document.querySelectorAll("[data-chrome]")]
        .map((element) => {
          const box = element.getBoundingClientRect();
          return `${box.x},${box.y},${box.width},${box.height}`;
        })
        .join("|");
    });
  let previous = await read();
  await expect
    .poll(
      async () => {
        const next = await read();
        const settled = next === previous;
        previous = next;
        return settled;
      },
      { intervals: [50, 100, 100, 200], timeout: 5_000 },
    )
    .toBe(true);
}
