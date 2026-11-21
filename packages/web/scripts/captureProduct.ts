// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Takes the product page's pictures, `src/product/captures/<subject>-<theme>.webp`,
 * from the running playground.
 *
 * @remarks
 * Run with `npm run capture:product -w @mapcairn/web` while the e2e build is
 * being served (`MAPCAIRN_E2E_PORT=4190 npm run start -w @mapcairn/web`; set the
 * same variable for this script). Pass `--only <subject>` to take one subject.
 * What each picture shows, its size and its basemaps are in
 * `src/product/captureSubjects.ts`.
 *
 * A normal run contacts nobody: every request that does not go to the local
 * server is refused, and the basemap's style, tiles, glyphs and sprites are
 * answered from a recording kept in `packages/web/.captures`, which git
 * ignores, so megabytes of map data stay out of the repository. `--record`
 * fills or refreshes that recording. It is the one run that asks OpenFreeMap
 * for tiles, once for each picture and as an ordinary visitor's browser does,
 * with Chromium's own user agent, and a person runs it, never CI. The
 * playground is the one that asks OpenFreeMap, so its credits are the ones the
 * page shows beside each picture (`ATTRIBUTIONS.md`). Streets, the OpenStreetMap
 * tile layer, is never used here: its tile policy rules out scripted capture.
 *
 * Each picture is taken at the size it is shown at, at twice the device
 * pixels, with motion off and the credits collapsed, then encoded as WebP by
 * Chromium's own encoder in a blank page, so no image library joins the
 * dependencies. The quality drops until the file fits its byte budget.
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
import {
  CAPTURE_SCALE,
  CAPTURE_SUBJECTS,
  CAPTURE_THEMES,
  type CaptureSubject,
  type CaptureTheme,
  captureAddress,
  captureBudgetBytes,
  captureFileName,
  HERO_LINE,
  HERO_READOUT,
} from "../src/product/captureSubjects";
import { type PlateView, projectToPixel } from "../src/product/plateGeometry";

const OUTPUT_DIR = fileURLToPath(
  new URL("../src/product/captures", import.meta.url),
);
const CACHE_DIR = fileURLToPath(new URL("../.captures", import.meta.url));

/** The storage key the first-visit tour records its answer under (`e2e/fixtures.ts` sets the same). */
const TOUR_SEEN_KEY = "mapcairn:tourSeen";

/** The first quality the encoder tries, and how far it steps down while the file is over its budget. */
const START_QUALITY = 0.82;
const QUALITY_STEP = 0.06;
const LOWEST_QUALITY = 0.4;

/** Where the recording of OpenFreeMap's answers is replayed from: the basemap's whole host. */
const RECORDED_HOST = /^https:\/\/tiles\.openfreemap\.org\//;

/** The fixed "now" a capture's clock starts from, so nothing in the picture depends on the day. */
const CLOCK_START = new Date("2026-06-01T10:00:00Z");

/** What a run was asked to do. */
interface Options {
  readonly record: boolean;
  readonly only: string | null;
}

/** Reads the command line: `--record` and `--only <subject>`. */
function readOptions(args: readonly string[]): Options {
  const only = args.indexOf("--only");
  return {
    record: args.includes("--record"),
    only: only === -1 ? null : (args[only + 1] ?? null),
  };
}

/** The address the e2e build is served on. */
function baseUrl(): string {
  return `http://localhost:${process.env.MAPCAIRN_E2E_PORT || "4173"}`;
}

/** Refuses a request that leaves the machine, so a replay contacts nobody; a recording lets the basemap's requests through to be recorded. */
async function refuseOutsideRequests(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.hostname !== "localhost" && url.protocol.startsWith("http"),
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
  options: Options,
): Promise<void> {
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
        origin: baseUrl(),
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
  options: Options,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: baseUrl(),
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

/** The view a subject's capture shows, with the size of the map the page measured. */
function plateView(subject: CaptureSubject, box: PlateBox): PlateView {
  return { ...subject.view, width: box.width, height: box.height };
}

/** The size of the map host on the page. */
interface PlateBox {
  readonly width: number;
  readonly height: number;
}

/** Measures the hero's line: taps its two ends, as a person would, and checks the length the picture shows. */
async function measureHeroLine(
  mapPage: MapPage,
  subject: CaptureSubject,
): Promise<void> {
  await mapPage.startMeasuring();
  const box = await mapPage.host.boundingBox();
  if (box === null) {
    throw new Error("The map has no box.");
  }
  const view = plateView(subject, box);
  await mapPage.tapMap(
    ...HERO_LINE.map((place): readonly [number, number] => {
      const { x, y } = projectToPixel(view, place.latitude, place.longitude);
      return [x, y];
    }),
  );
  const readout = (await mapPage.measureReadout.textContent())?.trim();
  if (readout !== HERO_READOUT) {
    throw new Error(
      `The hero measures ${readout}, but its text says ${HERO_READOUT}: update HERO_READOUT and the hero's alt text.`,
    );
  }
}

/** Opens Map options with the chosen basemap's tile in view and every preview drawn. */
async function showBasemapPicker(mapPage: MapPage): Promise<void> {
  await mapPage.openMapOptions();
  await mapPage.basemapPicker
    .getByRole("radio", { checked: true })
    .scrollIntoViewIfNeeded();
  await mapPage.page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  );
}

/** Gets the page into the state a subject shows. */
async function arrange(
  mapPage: MapPage,
  subject: CaptureSubject,
): Promise<void> {
  switch (subject.id) {
    case "hero":
      await measureHeroLine(mapPage, subject);
      return;
    case "basemaps":
      await showBasemapPicker(mapPage);
      return;
  }
}

/** Takes one picture as a PNG: opens the playground over the view, arranges it and waits for the map to settle. */
async function takePicture(
  browser: Browser,
  subject: CaptureSubject,
  theme: CaptureTheme,
  options: Options,
): Promise<Buffer> {
  const context = await openContext(browser, subject, theme, options);
  try {
    const page = await context.newPage();
    await page.clock.install({ time: CLOCK_START });
    const mapPage = new MapPage(page, catalogueText(null));
    await mapPage.goto(captureAddress(subject, theme));
    await collapseCredits(mapPage);
    await arrange(mapPage, subject);
    await mapPage.waitForMap();
    return await page.screenshot({ type: "png" });
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
  for (
    let quality = START_QUALITY;
    quality >= LOWEST_QUALITY;
    quality -= QUALITY_STEP
  ) {
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

/** The subjects a run takes: the one named by `--only`, or all of them. */
function chosenSubjects(options: Options): readonly CaptureSubject[] {
  if (options.only === null) {
    return CAPTURE_SUBJECTS;
  }
  const subjects = CAPTURE_SUBJECTS.filter(({ id }) => id === options.only);
  if (subjects.length === 0) {
    throw new Error(`No subject "${options.only}".`);
  }
  return subjects;
}

/** Takes every chosen picture and writes it beside the page's code. */
async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
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
          captureBudgetBytes(subject.id),
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
