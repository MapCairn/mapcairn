import { expect, type Page } from "@playwright/test";
import type { MapPage } from "../pages/MapPage";

/** The chrome states the collision and accessibility matrices walk through. */
export const CHROME_STATES = [
  "rest",
  "sheet open",
  "search open",
  "measure active",
  "directions open",
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

/**
 * Waits until the credits, which show by themselves once the map has started
 * (the OpenStreetMap attribution guidelines), have collapsed: the button says
 * it is collapsed and the popover is hidden. Waits on those signals, never a
 * fixed sleep.
 */
export async function waitForCreditsCollapsed(mapPage: MapPage): Promise<void> {
  // The credits start collapsed, before the map exists: wait for the first
  // showing to start, or a collapsed button would pass this check too early.
  await expect(
    mapPage.page.locator('[data-chrome="attribution"]'),
  ).toHaveAttribute("data-intro-started", "true", {
    timeout: CREDITS_COLLAPSE_TIMEOUT_MS,
  });
  await expect(mapPage.creditsButton).toHaveAttribute(
    "aria-expanded",
    "false",
    { timeout: CREDITS_COLLAPSE_TIMEOUT_MS },
  );
  await expect(mapPage.creditsRegion).toBeHidden({
    timeout: CREDITS_COLLAPSE_TIMEOUT_MS,
  });
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
      await waitForCreditsCollapsed(mapPage);
      return;
    case "sheet open":
      await mapPage.openMapOptions();
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
