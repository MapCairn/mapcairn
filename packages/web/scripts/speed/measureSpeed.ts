// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Compares the speed of two builds of the playground with the processor
 * throttled: first render, and the time to open the sheet and turn on a layer.
 * It follows the "Ground rules" of the performance guide: one machine, the two
 * builds interleaved, medians with the range.
 *
 *   npm run measure:speed -w @mapcairn/web -- --base <address> --change <address>
 *
 * @remarks Serve each build first, from its own checkout, on a port of its own:
 * `MAPCAIRN_E2E_PORT=<port> npm run start -w @mapcairn/web`. The script knows
 * nothing about how either was built, so the same command compares any two
 * commits. Basemap styles and tiles are answered by the browser tests' mocks
 * and every other request to another host is refused, so no figure depends on
 * a network. Each run has a new browser context with
 * an empty cache, as on a first visit. The pages are found by role, name and
 * `data-testid`, which the move of the interface to Lit keeps.
 */
import {
  type Browser,
  type CDPSession,
  chromium,
  devices,
  type Page,
} from "@playwright/test";
import { mockThirdPartyServices } from "../../e2e/support/network";
import {
  type Build,
  type MeasureOptions,
  measureOptions,
  runOrder,
  type Sample,
  summaryTable,
} from "./summary";

/** How long one step may take on a throttled processor. */
const STEP_TIMEOUT_MS = 60_000;

const BITS_PER_KILOBIT = 1000;
const BITS_PER_BYTE = 8;

/** The version of the tour the app ships, stored so no welcome card is drawn. */
const TOUR_VERSION = 1;

const FIRST_PAINT = "First contentful paint";
const INTERFACE = "Interface drawn";
const MAP_SETTLED = "Map settled";
const OPEN_SHEET = "Open the sheet";
const LAYER_ON = "Turn on a layer";
const OPEN_SETTINGS = "Open Settings";

const MEASURES = [
  FIRST_PAINT,
  INTERFACE,
  MAP_SETTLED,
  OPEN_SHEET,
  LAYER_ON,
  OPEN_SETTINGS,
];

/** The end stack's buttons, by the names they have in English, and the sheet. */
const SETTINGS_BUTTON =
  '[data-testid="end-stack"] button[aria-label="Settings"]';
const MAP_OPTIONS_BUTTON =
  '[data-testid="end-stack"] button[aria-label="Map options"]';
const SHEET = '[data-testid="map-options-sheet"]';

/** Notes, from before the page's own script runs, when the chrome appeared. */
function noteWhenDrawn(settings: string) {
  const seen = window as unknown as {
    __drawn?: number;
    __settled?: number;
  };
  const observer = new MutationObserver(() => {
    if (document.querySelector(settings)) {
      seen.__drawn ??= performance.now();
    }
    if (document.querySelector('[data-map-host][aria-busy="false"]')) {
      seen.__settled ??= performance.now();
      observer.disconnect();
    }
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
  });
}

/**
 * The time from a click until what it should draw is in the page and a frame
 * has followed, measured in the page so no protocol round trip is counted.
 */
function timeFromClick(
  page: Page,
  click: string,
  drawn: { selector: string; count: number },
): Promise<number> {
  return page.evaluate(
    async ({ from, until, timeout }) => {
      const target = document.querySelector<HTMLElement>(from);
      if (target === null) {
        throw new Error(`Nothing to click at ${from}`);
      }
      // No named function in here: the TypeScript runner wraps one in a
      // helper the page does not have.
      const start = performance.now();
      target.click();
      while (document.querySelectorAll(until.selector).length < until.count) {
        if (performance.now() - start > timeout) {
          throw new Error(`${until.selector} did not appear`);
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - start;
    },
    { from: click, until: drawn, timeout: STEP_TIMEOUT_MS },
  );
}

/** Holds the page to the processor, and the link if one is asked for. */
async function slowDown(
  session: CDPSession,
  { throttle, network }: MeasureOptions,
): Promise<void> {
  await session.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  if (network !== undefined) {
    const bytesPerSecond = (network.kbps * BITS_PER_KILOBIT) / BITS_PER_BYTE;
    await session.send("Network.enable");
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: network.latencyMs,
      downloadThroughput: bytesPerSecond,
      uploadThroughput: bytesPerSecond,
    });
  }
}

/** What the figures were taken with, for the line above the table. */
function conditions({ throttle, network, rounds }: MeasureOptions): string {
  const link =
    network === undefined
      ? "the network not slowed"
      : `a ${network.kbps} kbit/s link with ${network.latencyMs} ms added to each request`;
  return `Pixel 7 viewport, processor ${throttle} times slower, ${link}, ${rounds} rounds, interleaved`;
}

async function measureOnce(
  browser: Browser,
  address: string,
  options: MeasureOptions,
): Promise<Sample> {
  // The tour is stored as seen, so no welcome card is drawn over the chrome.
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(address).origin,
          localStorage: [
            { name: "mapcairn:tourSeen", value: JSON.stringify(TOUR_VERSION) },
          ],
        },
      ],
    },
  });
  try {
    const page = await context.newPage();
    // Registered first, so the mocks below answer before it: nothing else
    // leaves the machine, such as the layer's request to its provider.
    const own = new URL(address).host;
    await page.route(
      (url) => url.host !== own,
      (route) => route.abort(),
    );
    await mockThirdPartyServices(page);
    await page.addInitScript(noteWhenDrawn, SETTINGS_BUTTON);
    await slowDown(await context.newCDPSession(page), options);
    await page.goto(new URL("/map", address).href, {
      timeout: STEP_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => (window as unknown as { __settled?: number }).__settled,
      undefined,
      { timeout: STEP_TIMEOUT_MS },
    );
    const loaded = await page.evaluate(() => {
      const seen = window as unknown as {
        __drawn: number;
        __settled: number;
      };
      return {
        paint:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ?? Number.NaN,
        drawn: seen.__drawn,
        settled: seen.__settled,
      };
    });
    // The page goes quiet before the first click is timed.
    await page.waitForLoadState("networkidle", { timeout: STEP_TIMEOUT_MS });
    const openSheet = await timeFromClick(page, MAP_OPTIONS_BUTTON, {
      selector: `${SHEET} [role="switch"]`,
      count: 1,
    });
    const layerOn = await timeFromClick(
      page,
      `${SHEET} [data-testid^="layer-"] [role="switch"]`,
      { selector: '[data-testid^="layer-status-"]', count: 1 },
    );
    // Settings holds the segmented controls, the first part drawn by Lit.
    const openSettings = await timeFromClick(page, SETTINGS_BUTTON, {
      selector: `${SHEET} [role="radiogroup"] [aria-checked="true"]`,
      count: 3,
    });
    return {
      [FIRST_PAINT]: loaded.paint,
      [INTERFACE]: loaded.drawn,
      [MAP_SETTLED]: loaded.settled,
      [OPEN_SHEET]: openSheet,
      [LAYER_ON]: layerOn,
      [OPEN_SETTINGS]: openSettings,
    };
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const options = measureOptions(process.argv.slice(2));
  const samples: Record<Build, Sample[]> = { base: [], change: [] };
  const browser = await chromium.launch();
  try {
    // One unmeasured visit to each, so neither server's first answer counts.
    for (const build of ["base", "change"] as const) {
      await measureOnce(browser, options[build], options);
    }
    for (const build of runOrder(options.rounds)) {
      samples[build].push(await measureOnce(browser, options[build], options));
    }
    console.log(`Chromium ${browser.version()}, ${conditions(options)}.\n`);
    console.log(summaryTable(MEASURES, samples));
  } finally {
    await browser.close();
  }
}

await main();
