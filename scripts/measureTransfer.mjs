/**
 * Measures how many bytes Karta transfers over the network, for plan 0002
 * (`docs/plans/0002-data-saving-and-first-paint.md`, "Measured").
 *
 * @remarks
 * Build and serve the production bundle first, then run the script against it:
 *
 *     npm run build
 *     npm run preview -w @karta/web -- --port 4173
 *     node scripts/measureTransfer.mjs http://localhost:4173
 *
 * Add `--save-data` to store the Save data choice before the first load, to
 * measure the same four cases with the mode on.
 *
 * The base URL defaults to http://localhost:4173. Nothing is mocked: the map
 * loads its styles, sprites, glyphs and tiles from the real providers, so the
 * numbers move with their data and their CDNs. Run it more than once and read
 * the spread, not one number.
 *
 * It drives headless Chromium at 390 by 844 CSS px (device pixel ratio 3,
 * touch, mobile), with the page throttled to Lighthouse's slow 4G profile
 * (150 ms round trip, 1.6 Mbit/s down, 750 kbit/s up), through four cases in
 * one browser context, so the HTTP cache carries over as it would for a
 * returning visitor:
 *
 * 1. cold: the first view of the default basemap (Liberty, whole world) with
 *    an empty cache;
 * 2. warm: the same page loaded again;
 * 3. switch: choosing Positron in the basemap picker;
 * 4. minute: about a minute of keyboard panning and zooming over a city.
 *
 * Bytes are what crossed the wire for each finished request, as Playwright
 * reports it (`request.sizes()`: the encoded body plus the response headers;
 * zero for a cache hit), summed by group. Playwright sees the requests that
 * MapLibre's web worker makes for tiles and glyphs, but the throttling is set
 * on the page through the DevTools protocol and may not slow the worker's
 * requests, so treat this as a byte count, not a timing. A case ends when no
 * request has finished for three seconds.
 *
 * A local `wrangler dev` sends the app's files uncompressed to a browser on
 * plain http, while Cloudflare serves them with Brotli over https. Each app
 * text file (HTML, JavaScript, CSS, JSON, SVG) that arrives uncompressed is
 * therefore also compressed here with Brotli at its highest quality, and
 * `appBrotliKB` reports that estimate of what production sends; images and
 * fonts count as they arrived.
 *
 * It needs the network, adds no dependency (Playwright is already installed
 * for the end-to-end tests) and sends Chromium's own user agent and the page's
 * Referer, as the OpenStreetMap tile usage policy asks.
 */
import { brotliCompressSync, constants } from "node:zlib";
import { chromium } from "@playwright/test";

const SAVE_DATA = process.argv.includes("--save-data");
const BASE_URL =
  process.argv.slice(2).find((argument) => !argument.startsWith("--")) ??
  "http://localhost:4173";
const APP_ORIGIN = new URL(BASE_URL).origin;
const QUIET_MS = 3000;
const CASE_TIMEOUT_MS = 180_000;

/** Content types Cloudflare compresses; images and fonts are sent as they are. */
const COMPRESSIBLE =
  /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg)/;

/** Lighthouse's simulated slow 4G mobile network. */
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1638.4 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

/** Puts a request URL in one of the groups the report adds up. */
function groupOf(url) {
  const { origin, pathname } = new URL(url);
  if (origin === APP_ORIGIN) {
    return "app";
  }
  if (origin === "https://tile.openstreetmap.org") {
    return "rasterTiles";
  }
  if (origin !== "https://tiles.openfreemap.org") {
    return "other";
  }
  if (pathname.startsWith("/fonts/")) {
    return "glyphs";
  }
  if (pathname.startsWith("/natural_earth/")) {
    return "reliefTiles";
  }
  if (pathname.endsWith(".pbf")) {
    return "vectorTiles";
  }
  return "styleAndSprites";
}

/**
 * Records every finished request on a page, so a case can read the bytes
 * since it started and wait for the network to go quiet.
 */
async function recordNetwork(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", SLOW_4G);
  const finished = [];
  let lastActivity = Date.now();
  let pending = 0;
  page.on("request", () => {
    lastActivity = Date.now();
  });
  page.on("requestfinished", async (request) => {
    lastActivity = Date.now();
    const url = request.url();
    if (!url.startsWith("http")) {
      return;
    }
    pending += 1;
    try {
      const sizes = await request.sizes();
      const bytes = Math.max(
        0,
        sizes.responseBodySize + sizes.responseHeadersSize,
      );
      const entry = { url, bytes, brotli: bytes };
      const response = await request.response();
      const encoding = (await response?.headerValue("content-encoding")) ?? "";
      const type = (await response?.headerValue("content-type")) ?? "";
      if (
        groupOf(url) === "app" &&
        bytes > 0 &&
        encoding === "" &&
        COMPRESSIBLE.test(type)
      ) {
        const body = await response.body();
        entry.brotli =
          brotliCompressSync(body, {
            params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
          }).length + sizes.responseHeadersSize;
      }
      finished.push(entry);
    } finally {
      pending -= 1;
      lastActivity = Date.now();
    }
  });
  return {
    mark: () => finished.length,
    since: (mark) => finished.slice(mark),
    async quiet() {
      const start = Date.now();
      while (pending > 0 || Date.now() - lastActivity < QUIET_MS) {
        if (Date.now() - start > CASE_TIMEOUT_MS) {
          throw new Error("The network did not go quiet.");
        }
        await page.waitForTimeout(250);
      }
    },
  };
}

function kb(bytes) {
  return Math.round(bytes / 102.4) / 10;
}

/** Adds up a case's requests by group. */
function summarise(name, requests) {
  const groups = {};
  let total = 0;
  let appBrotli = 0;
  for (const { url, bytes, brotli } of requests) {
    const group = groupOf(url);
    groups[group] ??= { requests: 0, fromCache: 0, bytes: 0 };
    groups[group].requests += 1;
    groups[group].fromCache += bytes === 0 ? 1 : 0;
    groups[group].bytes += bytes;
    total += bytes;
    if (group === "app") {
      appBrotli += brotli;
    }
  }
  const appBytes = groups.app?.bytes ?? 0;
  return {
    case: name,
    totalKB: kb(total),
    totalWithAppBrotliKB: kb(total - appBytes + appBrotli),
    appBrotliKB: kb(appBrotli),
    groups: Object.fromEntries(
      Object.entries(groups).map(([group, g]) => [
        group,
        { requests: g.requests, fromCache: g.fromCache, kB: kb(g.bytes) },
      ]),
    ),
  };
}

/** Waits until the app has mounted the map and the network is quiet. */
async function waitForMap(page, network) {
  await page.locator("[data-map-host][data-zoom]").waitFor({
    timeout: CASE_TIMEOUT_MS,
  });
  await network.quiet();
}

/** About a minute of keyboard panning and zooming, the same every run. */
async function panAndZoom(page) {
  await page.getByRole("region", { name: "Map", exact: true }).focus();
  const steps = [
    "+",
    "ArrowRight",
    "ArrowRight",
    "ArrowDown",
    "+",
    "ArrowLeft",
    "ArrowLeft",
    "ArrowLeft",
    "ArrowUp",
    "+",
    "ArrowRight",
    "ArrowDown",
    "ArrowDown",
    "-",
    "ArrowLeft",
    "ArrowUp",
    "ArrowUp",
    "-",
    "-",
    "ArrowRight",
    "ArrowRight",
    "+",
    "ArrowDown",
    "ArrowLeft",
    "+",
    "ArrowUp",
    "ArrowRight",
    "-",
    "ArrowDown",
    "-",
  ];
  for (const key of steps) {
    await page.keyboard.press(key);
    await page.waitForTimeout(2000);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  // The stored choice is in place before the first load, as after the person
  // had switched Save data on in an earlier visit.
  storageState: SAVE_DATA
    ? {
        cookies: [],
        origins: [
          {
            origin: APP_ORIGIN,
            localStorage: [{ name: "karta:saveData", value: "true" }],
          },
        ],
      }
    : undefined,
});
const page = await context.newPage();
const network = await recordNetwork(page);
const results = [];

let mark = network.mark();
await page.goto(`${BASE_URL}/`);
await waitForMap(page, network);
results.push(
  summarise("cold first view (Liberty, world)", network.since(mark)),
);

mark = network.mark();
await page.goto("about:blank");
await page.goto(`${BASE_URL}/`);
await waitForMap(page, network);
results.push(summarise("warm repeat view", network.since(mark)));

mark = network.mark();
await page.getByRole("button", { name: "Map options" }).click();
// The radio is visually hidden inside its tile; tap the tile, as a person would.
await page.getByTestId("basemap-option-positron").click();
await network.quiet();
results.push(summarise("switch to Positron (world)", network.since(mark)));

// The minute starts on the default basemap over a city, once it has loaded.
await page.goto("about:blank");
await page.goto(`${BASE_URL}/#map=11.00/-26.20000/28.04000&basemap=liberty`);
await waitForMap(page, network);
mark = network.mark();
const started = Date.now();
await panAndZoom(page);
await network.quiet();
results.push({
  ...summarise(
    "a minute of panning and zooming (Liberty, Johannesburg, zoom 11 to 14)",
    network.since(mark),
  ),
  seconds: Math.round((Date.now() - started) / 1000),
});

await browser.close();
console.log(
  JSON.stringify({ baseUrl: BASE_URL, saveData: SAVE_DATA, results }, null, 2),
);
