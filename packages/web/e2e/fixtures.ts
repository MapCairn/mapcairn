// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { test as base, expect } from "@playwright/test";
import { MapPage } from "./pages/MapPage";
import {
  type CatalogueText,
  catalogueText,
  offerSampleLanguages,
  SAMPLE_LANGUAGES,
  storedLanguage,
  storeLanguageBeforeLoad,
} from "./support/language";
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
  /**
   * The reading direction of the page. `"rtl"` sets `dir="rtl"` on `<html>`
   * before the app loads, so the layout runs mirrored in the app's own
   * English: a pseudo-locale, not a shipped language. The `rtl-*` projects
   * in `playwright.config.ts` set it; a spec does not need to.
   */
  readonly direction: "ltr" | "rtl";
  /**
   * The language stored as the person's choice before the app loads, or
   * null to leave the choice to the browser (English, in Playwright). The
   * `af-*` projects in `playwright.config.ts` set it to `"af"`, so the
   * layout and accessibility specs run in Afrikaans; the page object then
   * finds the chrome by its Afrikaans names. A tag in `SAMPLE_LANGUAGES`
   * (`en-XA`, `en-XB`, `ar`) is a sample language the page is offered through
   * the test seam, and not a language the site ships.
   */
  readonly language: string | null;
}

/** The tour version the app ships (`TOUR_VERSION` in `src/app/tourVersion.ts`). */
export const TOUR_VERSION = 1;

/** The fixtures every spec gets. */
export interface MapCairnFixtures {
  /** The map page object. `mapPage.goto()` loads the app and waits for the map. */
  readonly mapPage: MapPage;
  /** Console messages from the page, in order. */
  readonly consoleMessages: string[];
  /** The text of the language the page speaks, by message key. */
  readonly messages: CatalogueText;
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
 * Sets `dir="rtl"` on `<html>` as soon as the element exists, which is
 * after an init script first runs, and keeps it there if the page rewrites
 * the attribute.
 */
function setRightToLeft() {
  const apply = () => {
    if (document.documentElement.getAttribute("dir") !== "rtl") {
      document.documentElement.setAttribute("dir", "rtl");
    }
  };
  new MutationObserver(apply).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["dir"],
  });
  if (document.documentElement) {
    apply();
  }
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
  direction: ["ltr", { option: true }],
  language: [null, { option: true }],
  messages: async ({ language }, use) => {
    await use(catalogueText(language));
  },
  consoleMessages: async ({ page }, use) => {
    const messages: string[] = [];
    page.on("console", (message) => {
      messages.push(`${message.type()}: ${message.text()}`);
    });
    await use(messages);
  },
  page: async ({ page, fastCredits, firstVisit, direction, language }, use) => {
    if (direction === "rtl") {
      await page.addInitScript(setRightToLeft);
    }
    const sample = SAMPLE_LANGUAGES[language ?? ""];
    if (sample !== undefined) {
      await page.addInitScript(offerSampleLanguages, [sample]);
    }
    if (language !== null) {
      await page.addInitScript(
        storeLanguageBeforeLoad,
        storedLanguage(language),
      );
    }
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
  mapPage: async ({ page, consoleMessages, messages }, use) => {
    const mapPage = new MapPage(page, messages);
    const waitForMap = mapPage.waitForMap.bind(mapPage);
    mapPage.waitForMap = async () => {
      await waitForMap();
      const scripted = await page.evaluate(
        () =>
          window.__MAPCAIRN_TEST_SERVICES__ !== undefined ||
          window.__MAPCAIRN_TEST_CATALOGUE__ !== undefined,
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
