// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Takes the product page's pictures, `src/product/captures/<subject>-<theme>.webp`,
 * from the running playground.
 *
 * @remarks
 * Install the browsers once (`npm run playwright:install -w @mapcairn/web`),
 * then run with `npm run capture:product -w @mapcairn/web` while the e2e build
 * is being served (`MAPCAIRN_E2E_PORT=4191 npm run start -w @mapcairn/web`; set
 * the same variable for this script). Pass `--only <subject>` to take one
 * subject. What each picture shows, its size, its basemaps, what the page is
 * made to show and its byte budget are one row each in
 * `src/product/captureSubjects.ts`; the command line, the encoder's steps and
 * the checks that need no browser are in `src/product/captureRun.ts`.
 *
 * A normal run contacts nobody: every request that does not go to the local
 * server is refused, and the basemap's style, tiles, glyphs and sprites are
 * answered from a recording kept in `packages/web/.captures`, which git
 * ignores, so megabytes of map data stay out of the repository. `--record`
 * fills or refreshes that recording. It is the one run that asks OpenFreeMap
 * for tiles, once for each picture and as an ordinary visitor's browser does,
 * with Chromium's own user agent, and a person runs it: it refuses to run when
 * `CI` is set. The playground is the one that asks OpenFreeMap, so its credits
 * are the ones the page shows beside each picture (`ATTRIBUTIONS.md`).
 * Streets, the OpenStreetMap tile layer, is never used here: its tile policy
 * rules out scripted capture.
 *
 * Each picture is taken at the size it is shown at, at twice the device
 * pixels, with motion off and the credits collapsed, then encoded as WebP by
 * Chromium's own encoder in a blank page, so no image library joins the
 * dependencies. The quality drops until the file fits its byte budget. Before
 * the shot the script reads the view the map reports and the length the line
 * reads, and stops if either differs from the table, so the words cannot
 * describe another picture.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from "@playwright/test";
import { MapPage } from "../e2e/pages/MapPage";
import { catalogueText } from "../e2e/support/language";
import { collapseCredits } from "../e2e/support/states";
import { TOUR_VERSION } from "../src/app/tourVersion";
import { projectToPixel } from "../src/product/captureProjection";
import {
  baseUrl,
  type CaptureOptions,
  checkReadout,
  checkRecordAllowed,
  checkView,
  chosenSubjects,
  LOCAL_HOST,
  qualitySteps,
  readOptions,
  replayHint,
} from "../src/product/captureRun";
import {
  CAPTURE_SCALE,
  CAPTURE_THEMES,
  type CaptureSubject,
  type CaptureTheme,
  captureAddress,
  captureFileName,
} from "../src/product/captureSubjects";

const OUTPUT_DIR = fileURLToPath(
  new URL("../src/product/captures", import.meta.url),
);
const CACHE_DIR = fileURLToPath(new URL("../.captures", import.meta.url));

/** The storage key the first-visit tour records its answer under (`e2e/fixtures.ts` sets the same). */
const TOUR_SEEN_KEY = "mapcairn:tourSeen";

/** Where the recording of OpenFreeMap's answers is replayed from: the basemap's whole host. */
const RECORDED_HOST = /^https:\/\/tiles\.openfreemap\.org\//;

/** The fixed "now" a capture's clock starts from, so nothing in the picture depends on the day. */
const CLOCK_START = new Date("2026-06-01T10:00:00Z");

/** Refuses a request that leaves the machine, so a replay contacts nobody; a recording lets the basemap's requests through to be recorded. */
async function refuseOutsideRequests(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.hostname !== LOCAL_HOST && url.protocol.startsWith("http"),
    (route) => route.abort(),
  );
}

/** Where one picture's recording of the basemap is kept. */
function recordingPath(subject: CaptureSubject, theme: CaptureTheme): string {
  return join(CACHE_DIR, `${subject.id}-${theme}.har.zip`);
}

/** Answers the basemap's requests from the recording, or records them while it runs. */
async function replayBasemap(
  context: BrowserContext,
  path: string,
  options: CaptureOptions,
): Promise<void> {
  if (!(options.record || existsSync(path))) {
    throw new Error(`There is no recording at ${path}. ${replayHint(path)}`);
  }
  await context.routeFromHAR(path, {
    url: RECORDED_HOST,
    notFound: "abort",
    update: options.record,
    updateMode: "minimal",
  });
}

/** Storage that has the first-visit tour answered, so its welcome card is not in the picture. */
function tourAnswered() {
  return {
    cookies: [],
    origins: [
      {
        origin: baseUrl(process.env),
        localStorage: [
          { name: TOUR_SEEN_KEY, value: JSON.stringify(TOUR_VERSION) },
        ],
      },
    ],
  };
}

/** A browser context shaped like the picture: its size, a phone's touch screen if it is one, motion off and the theme. */
async function openContext(
  browser: Browser,
  subject: CaptureSubject,
  theme: CaptureTheme,
  options: CaptureOptions,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: baseUrl(process.env),
    viewport: { width: subject.width, height: subject.height },
    deviceScaleFactor: CAPTURE_SCALE,
    colorScheme: theme,
    reducedMotion: "reduce",
    locale: "en-GB",
    serviceWorkers: "block",
    isMobile: subject.phone,
    hasTouch: subject.phone,
    storageState: tourAnswered(),
  });
  if (!options.record) {
    await refuseOutsideRequests(context);
  }
  await replayBasemap(context, recordingPath(subject, theme), options);
  return context;
}

/** Measures a line: taps its two ends, as a person would, and checks the length the picture reads. */
async function measureLine(
  mapPage: MapPage,
  subject: CaptureSubject,
): Promise<void> {
  const { arrangement } = subject;
  await mapPage.startMeasuring();
  const box = await mapPage.host.boundingBox();
  if (box === null) {
    throw new Error("The map has no box.");
  }
  const view = { ...subject.view, width: box.width, height: box.height };
  await mapPage.tapMap(
    ...arrangement.line.map((place): readonly [number, number] => {
      const { x, y } = projectToPixel(view, place.latitude, place.longitude);
      return [x, y];
    }),
  );
  checkReadout(subject, (await mapPage.measureReadout.textContent())?.trim());
}

/** Opens the playground over the view, measures the line, checks the view and takes the PNG. */
async function shoot(page: Page, subject: CaptureSubject, theme: CaptureTheme) {
  await page.clock.install({ time: CLOCK_START });
  const mapPage = new MapPage(page, catalogueText(null));
  await mapPage.goto(captureAddress(subject, theme));
  await collapseCredits(mapPage);
  await measureLine(mapPage, subject);
  await mapPage.waitForMap();
  checkView(subject, await mapPage.hashView());
  return page.screenshot({ type: "png" });
}

/** Takes one picture as a PNG; a failed replay says how to record again. */
async function takePicture(
  browser: Browser,
  subject: CaptureSubject,
  theme: CaptureTheme,
  options: CaptureOptions,
): Promise<Buffer> {
  const context = await openContext(browser, subject, theme, options);
  try {
    return await shoot(await context.newPage(), subject, theme);
  } catch (error) {
    if (options.record) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}\n${replayHint(recordingPath(subject, theme))}`, {
      cause: error,
    });
  } finally {
    await context.close();
  }
}

/** Encodes a PNG as WebP with Chromium's own encoder, in a blank page. */
async function encodeWebp(
  page: Page,
  png: Buffer,
  quality: number,
): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ data, level }) => {
      const blob = new Blob(
        [Uint8Array.from(atob(data), (character) => character.charCodeAt(0))],
        { type: "image/png" },
      );
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const encoded = await canvas.convertToBlob({
        type: "image/webp",
        quality: level,
      });
      const bytes = new Uint8Array(await encoded.arrayBuffer());
      let text = "";
      for (const byte of bytes) {
        text += String.fromCharCode(byte);
      }
      return btoa(text);
    },
    { data: png.toString("base64"), level: quality },
  );
  return Buffer.from(base64, "base64");
}

/** Encodes a PNG as WebP at the best quality that fits the budget, or fails, naming the size of the smallest try, if even the lowest does not. */
async function encodeWithinBudget(
  page: Page,
  png: Buffer,
  budget: number,
): Promise<Buffer> {
  let smallest = Number.POSITIVE_INFINITY;
  for (const quality of qualitySteps()) {
    const webp = await encodeWebp(page, png, quality);
    if (webp.length <= budget) {
      return webp;
    }
    smallest = Math.min(smallest, webp.length);
  }
  throw new Error(
    `The picture does not fit its ${budget} byte budget: the smallest try is ${smallest} bytes.`,
  );
}

/** Takes every chosen picture and writes it beside the page's code. */
async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  checkRecordAllowed(options, process.env);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  try {
    const encoder = await browser.newPage();
    for (const subject of chosenSubjects(options)) {
      for (const theme of CAPTURE_THEMES) {
        const png = await takePicture(browser, subject, theme, options);
        const webp = await encodeWithinBudget(
          encoder,
          png,
          subject.budgetBytes,
        );
        const file = captureFileName(subject.id, theme);
        writeFileSync(join(OUTPUT_DIR, file), webp);
        console.log(`${file}: ${webp.length} bytes`);
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
