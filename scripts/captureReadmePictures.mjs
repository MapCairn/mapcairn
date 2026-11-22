// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Takes the README pictures in `docs/images` from the deployed reference site:
 * two stills and two recordings turned into GIFs, each in the light and the
 * dark theme (`docs/guides/product-captures.md`, "The README pictures").
 *
 *   node scripts/captureReadmePictures.mjs --out <folder> [--stills] [--demos]
 *
 * A person runs it by hand: it loads the live site, which fetches the
 * earthquakes layer and the basemap from their public providers as any
 * visitor's browser does, so it contacts nobody else and loads each page once
 * for each picture. It writes raw PNGs and finished GIFs to `--out` (a folder
 * outside the repository); `docs/guides/product-captures.md` says how the
 * stills are reduced before they are committed. The recordings need `ffmpeg`
 * and `gifski` on the path. With neither `--stills` nor `--demos`, it takes
 * both. The steps are the ones a person takes: the helpers that fix the
 * addresses, sizes and program arguments are in `readmePictures.mjs`, with a
 * test.
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { isEntryPoint } from "./entryPoint.mjs";
import {
  demoPath,
  ffmpegFrameArgs,
  gifskiArgs,
  LIVE_MAP_URL,
  liveMapUrl,
  START_VIEW,
  STILL_LINE,
  STILL_SIZE,
  stillPath,
  THEMES,
} from "./readmePictures.mjs";

/** Where the first-visit tour records that it was answered, and the version the app ships. */
const TOUR_SEEN_KEY = "mapcairn:tourSeen";
const TOUR_VERSION = 1;

/** How long the layer is given to fetch and draw before a still is taken. */
const LAYER_SETTLE_MS = 8_000;
/** How long the map is given to draw its first tiles before a recording's first step. */
const MAP_SETTLE_MS = 3_000;
const MS_PER_SECOND = 1_000;
/** How long the credits are given to open before a still is taken. */
const CREDITS_SETTLE_MS = 1_500;
/** The pause between steps of a recording, so a viewer can follow. */
const STEP_PAUSE_MS = 1_200;
/** The pause on the finished view at the end of a recording. */
const END_PAUSE_MS = 2_500;
/** The delay between typed letters in a recording. */
const TYPING_DELAY_MS = 120;
/** The place typed into the search box of the recording. */
const SEARCH_TEXT = "Nairobi";

/**
 * A browser context for a picture: a mouse, motion off, the theme asked for
 * and the first-visit tour already answered.
 */
async function openContext(browser, theme, size, record) {
  return browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: theme,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(LIVE_MAP_URL).origin,
          localStorage: [
            { name: TOUR_SEEN_KEY, value: JSON.stringify(TOUR_VERSION) },
          ],
        },
      ],
    },
    ...(record === undefined ? {} : { recordVideo: { dir: record, size } }),
  });
}

/** Turns the measure tool on and taps the two points, given in pixels of the page. */
async function measure(page, points) {
  await page.getByRole("button", { name: /^Measure/ }).click();
  for (const point of points) {
    await page.mouse.click(point.x, point.y);
  }
}

/** One still: the measure tool over Africa with the earthquakes layer on and the credits open. */
async function takeStill(browser, theme, folder) {
  const context = await openContext(browser, theme, STILL_SIZE);
  const page = await context.newPage();
  await page.goto(liveMapUrl(START_VIEW), { waitUntil: "load" });
  await page.waitForTimeout(LAYER_SETTLE_MS);
  await measure(page, STILL_LINE);
  await page.getByRole("button", { name: "Map credits" }).click();
  await page.waitForTimeout(CREDITS_SETTLE_MS);
  await page.screenshot({ path: stillPath(folder, theme) });
  await context.close();
}

/** Opens the map and waits for its first tiles, so the recording can start on a drawn map. */
async function openDemoPage(page) {
  await page.goto(liveMapUrl(START_VIEW, false), { waitUntil: "load" });
  await page.waitForTimeout(MAP_SETTLE_MS);
}

/** The steps of a recording: search, turn the layer on for the week, measure, open the credits. */
async function playDemo(page) {
  const search = page.getByRole("combobox", { name: /Search/ });
  await search.pressSequentially(SEARCH_TEXT, { delay: TYPING_DELAY_MS });
  await page.waitForTimeout(END_PAUSE_MS);
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Map options" }).click();
  await page.waitForTimeout(STEP_PAUSE_MS);
  await page.getByRole("switch", { name: "Earthquakes", exact: true }).click();
  await page.waitForTimeout(STEP_PAUSE_MS);
  await page.getByRole("radio", { name: "Week" }).click();
  await page.waitForTimeout(END_PAUSE_MS);
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.waitForTimeout(STEP_PAUSE_MS);
  await measure(page, STILL_LINE);
  await page.waitForTimeout(STEP_PAUSE_MS);
  await page.getByRole("button", { name: "Map credits" }).click();
  await page.waitForTimeout(END_PAUSE_MS);
}

/** Runs a program and stops the script with its own message when it fails. */
function run(program, args) {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${program} failed (is it installed?)`);
  }
}

/** One recording of a theme, joined into a GIF. */
async function takeDemo(browser, theme, folder, work) {
  const videos = join(work, `${theme}-video`);
  const frames = join(work, `${theme}-frames`);
  mkdirSync(frames, { recursive: true });
  const started = Date.now();
  const context = await openContext(browser, theme, STILL_SIZE, videos);
  const page = await context.newPage();
  await openDemoPage(page);
  const leadSeconds = (Date.now() - started) / MS_PER_SECOND;
  await playDemo(page);
  await context.close();
  const [video] = readdirSync(videos);
  run("ffmpeg", ffmpegFrameArgs(join(videos, video), frames, leadSeconds));
  const output = demoPath(work, theme);
  const frameFiles = readdirSync(frames)
    .sort()
    .map((name) => join(frames, name));
  run("gifski", gifskiArgs(frameFiles, output));
  renameSync(output, demoPath(folder, theme));
}

/** Reads `--out`, `--stills` and `--demos` from the command line. */
function readOptions(argv) {
  const at = argv.indexOf("--out");
  const out = at === -1 ? undefined : argv[at + 1];
  if (out === undefined) {
    throw new Error("Pass --out <folder>, a folder outside the repository.");
  }
  const stills = argv.includes("--stills");
  const demos = argv.includes("--demos");
  return { out, stills: stills || !demos, demos: demos || !stills };
}

/** Takes the pictures the options ask for. */
async function main(argv) {
  const options = readOptions(argv);
  mkdirSync(options.out, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "mapcairn-readme-"));
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      if (options.stills) {
        await takeStill(browser, theme, options.out);
      }
      if (options.demos) {
        await takeDemo(browser, theme, options.out, work);
      }
    }
  } finally {
    await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}

if (isEntryPoint(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
