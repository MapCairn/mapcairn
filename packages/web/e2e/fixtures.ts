import { test as base, expect } from "@playwright/test";
import { MapPage } from "./pages/MapPage";
import { mockThirdPartyServices } from "./support/network";

/** The string `testSeam.ts` logs when it accepts scripted services. */
const SEAM_MARKER = "MAPCAIRN_TEST_SEAM_MARKER";

/** The options a spec sets with `test.use`. */
export interface MapCairnOptions {
  /**
   * Installs a controllable page clock before the app loads, so a test can
   * jump past the credits' five-second first showing with
   * `collapseCredits` instead of waiting it out. Off by default: a faked
   * clock is not the app's own, so it is for the tests that only need the
   * credits out of the way. `attribution.spec` proves the real timer.
   * Specs that need to step past another app timer (a long press, the view
   * settling, the scale bar's idle delay) install the clock themselves and
   * jump by the values in `support/timers.ts`.
   */
  readonly fastCredits: boolean;
  /**
   * Leaves the first-visit tour unanswered, so the welcome card is offered.
   * Off by default: every other spec starts as a returning visitor, so the
   * card never sits in its tab order or its screenshots.
   */
  readonly firstVisit: boolean;
}

/** The tour version the app ships (`TOUR_VERSION` in `src/app/tourVersion.ts`). */
export const TOUR_VERSION = 1;

/** The fixtures every spec gets. */
export interface MapCairnFixtures {
  /** The map page object. `mapPage.goto()` loads the app and waits for the map. */
  readonly mapPage: MapPage;
  /** Console messages from the page, in order. */
  readonly consoleMessages: string[];
}

/**
 * Records every message the app's announcer speaks, in order, on
 * `window.__mapcairnAnnouncements`. The announcer clears and rewrites its live
 * regions, so reading them at one moment can miss a message.
 */
function recordAnnouncements() {
  const spoken: string[] = [];
  window.__mapcairnAnnouncements = spoken;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const node =
        mutation.target instanceof Element
          ? mutation.target
          : mutation.target.parentElement;
      const region = node?.closest('[data-testid^="live-region-"]');
      const text = region?.textContent?.trim();
      if (text && spoken[spoken.length - 1] !== text) {
        spoken.push(text);
      }
    }
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}

/**
 * Playwright's `test`, extended so that every page:
 *
 * - has every third-party request stubbed (tiles, styles, Nominatim);
 * - records announcer messages and console output;
 * - fails `mapPage.waitForMap()` when a test scripted services through the
 *   seam but the build ignored them (for example, a production build).
 */
export const test = base.extend<MapCairnFixtures & MapCairnOptions>({
  fastCredits: [false, { option: true }],
  firstVisit: [false, { option: true }],
  consoleMessages: async ({ page }, use) => {
    const messages: string[] = [];
    page.on("console", (message) => {
      messages.push(`${message.type()}: ${message.text()}`);
    });
    await use(messages);
  },
  page: async ({ page, fastCredits, firstVisit }, use) => {
    if (fastCredits) {
      await page.clock.install();
    }
    if (!firstVisit) {
      await page.addInitScript((version: number) => {
        try {
          localStorage.setItem("mapcairn:tourSeen", JSON.stringify(version));
        } catch {
          // Blocked storage: the app will not offer the tour anyway.
        }
      }, TOUR_VERSION);
    }
    await mockThirdPartyServices(page);
    await page.addInitScript(recordAnnouncements);
    await use(page);
  },
  mapPage: async ({ page, consoleMessages }, use) => {
    const mapPage = new MapPage(page);
    const waitForMap = mapPage.waitForMap.bind(mapPage);
    mapPage.waitForMap = async () => {
      await waitForMap();
      const scripted = await page.evaluate(
        () => window.__MAPCAIRN_TEST_SERVICES__ !== undefined,
      );
      if (scripted) {
        expect(
          consoleMessages.some((message) => message.includes(SEAM_MARKER)),
          "the app should report that it took the scripted services",
        ).toBe(true);
      }
    };
    await use(mapPage);
  },
});

export { expect };
