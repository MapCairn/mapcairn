// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Renders `public/og-sdk.png`, the product page's Open Graph and Twitter card
 * image, from the page's own art: the contour lines of `contours.ts` and the
 * cairn's stones, with the light theme's token values.
 *
 * @remarks
 * Run with `npm run generate:og-sdk -w @mapcairn/web` after the art, the
 * product page's headline or the brand colours change. Like
 * `generateOgImage.ts`, it reuses Playwright's Chromium as a one-shot
 * HTML-to-PNG renderer instead of adding an image library. The image holds no
 * map tiles, so it needs no attribution. Set
 * `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a Chromium of your own.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
// Read from the source file, not the `@mapcairn/theme` barrel, because the barrel
// loads vanilla-extract style files that only the Vite plugin can evaluate.
import { accent, neutral, themeValues } from "../../theme/src/tokenValues";
import { STONES } from "../src/app/cairnStones";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_URL,
} from "../src/constants/siteConfig";
import { CONTOURS } from "../src/product/contours";
import {
  CAIRN_TRANSFORM,
  EASTINGS,
  MEASURE,
  NORTHINGS,
  PIN_HEAD,
  PIN_PATH,
  PIN_TIP,
  SHEET,
  TICK_LENGTH,
} from "../src/product/surveyGeometry";

const FONT_PATH = fileURLToPath(
  import.meta.resolve(
    "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  ),
);
const OUTPUT_PATH = fileURLToPath(
  new URL("../public/og-sdk.png", import.meta.url),
);

const NAME = "MapCairn";
const TAGLINE =
  "An open-source SDK for accessible, privacy-respecting map applications";
const FACTS =
  "Open source under the AGPL-3.0. TypeScript, React, MapLibre GL JS.";
const URL_LABEL = SITE_URL.replace(/^https?:\/\//, "");

const colour = themeValues.light.opaque;
const page = colour.pageBackground;
const sheet = colour.surfaceRaised;
const ink = colour.text;
const muted = colour.textMuted;
const accentColor = accent[700];
const halo = colour.mapHalo;
const contourMinor = neutral[300];
const contourIndex = neutral[500];
const gridLine = neutral[500];

const { width: W, height: H } = SHEET;

/** The cairn's stones on the summit, placed exactly as the page's art places them. */
function cairn(): string {
  const stones = STONES.map(
    ({ points, offset }) =>
      `<g transform="${offset ?? ""}"><polygon points="${points}" fill="${halo}" stroke="${halo}" stroke-width="40" stroke-linejoin="round"/><polygon points="${points}" fill="${accentColor}" stroke="${accentColor}" stroke-width="16" stroke-linejoin="round"/></g>`,
  ).join("");
  return `<g transform="${CAIRN_TRANSFORM}">${stones}</g>`;
}

/** The grid ticks on the sheet's edges, as on the page. */
function ticks(): string {
  const lines = [
    ...EASTINGS.map(
      ({ at }) => `<line x1="${at}" y1="0" x2="${at}" y2="${TICK_LENGTH}"/>`,
    ),
    ...NORTHINGS.map(
      ({ at }) => `<line x1="0" y1="${at}" x2="${TICK_LENGTH}" y2="${at}"/>`,
    ),
  ];
  return `<g stroke="${gridLine}" stroke-width="1.5">${lines.join("")}</g>`;
}

/** The page's art at the card's size: contours, the measured line from the pin's tip to the cairn, the cairn and the pin. */
const ART = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
  ${CONTOURS.map(
    ({ index, d }) =>
      `<path d="${d}" fill="none" stroke="${index ? contourIndex : contourMinor}" stroke-width="${index ? 2 : 1.25}" stroke-linejoin="round"/>`,
  ).join("\n  ")}
  ${ticks()}
  <line x1="${MEASURE.from.x}" y1="${MEASURE.from.y}" x2="${MEASURE.to.x}" y2="${MEASURE.to.y}" stroke="${accent[600]}" stroke-width="3" stroke-dasharray="9 8" stroke-linecap="round"/>
  ${cairn()}
  <g transform="translate(${PIN_TIP.x} ${PIN_TIP.y})"><path d="${PIN_PATH}" fill="${accent[600]}" stroke="${halo}" stroke-width="2"/><circle cx="${PIN_HEAD.cx}" cy="${PIN_HEAD.cy}" r="${PIN_HEAD.r}" fill="${halo}"/></g>
  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${neutral[600]}" stroke-width="2"/>
</svg>`;

const TEMPLATE = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: "IBM Plex Sans Variable";
    src: url("${pathToFileURL(FONT_PATH).href}") format("woff2");
    font-weight: 100 700;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${OG_IMAGE_WIDTH}px;
    height: ${OG_IMAGE_HEIGHT}px;
    background: ${page};
    font-family: "IBM Plex Sans Variable", sans-serif;
    color: ${ink};
    padding: 40px;
  }
  .sheet {
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 520px;
    gap: 40px;
    align-items: center;
    padding: 44px 48px;
    border: 2px solid ${neutral[600]};
    border-radius: 14px;
    background: ${sheet};
  }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 600; }
  .brand svg { width: 48px; height: 48px; }
  h1 { margin-top: 28px; font-size: 52px; line-height: 1.1; letter-spacing: -0.025em; font-weight: 600; }
  .facts { margin-top: 28px; font-size: 24px; line-height: 1.4; color: ${muted}; }
  .url { margin-top: 24px; font-size: 24px; font-weight: 600; color: ${accentColor}; }
  .art svg { display: block; width: 100%; height: auto; }
</style>
</head>
<body>
  <div class="sheet">
    <div>
      <div class="brand"><svg viewBox="65 76 386 360" aria-hidden="true">${STONES.map(
        ({ points, offset }) =>
          `<g transform="translate(0 -35) ${offset ?? ""}"><polygon points="${points}" fill="${halo}" stroke="${halo}" stroke-width="30" stroke-linejoin="round"/><polygon points="${points}" fill="${accentColor}" stroke="${accentColor}" stroke-width="16" stroke-linejoin="round"/></g>`,
      ).join("")}</svg>${NAME}</div>
      <h1>${TAGLINE}</h1>
      <p class="facts">${FACTS}</p>
      <p class="url">${URL_LABEL}</p>
    </div>
    <div class="art">${ART}</div>
  </div>
</body>
</html>`;

/** Renders {@link TEMPLATE} at the card's size and writes {@link OUTPUT_PATH}. */
async function generate(): Promise<void> {
  const tempDir = mkdtempSync(
    join(fileURLToPath(new URL("..", import.meta.url)), ".og-sdk-"),
  );
  const tempHtmlPath = join(tempDir, "og-sdk.html");
  writeFileSync(tempHtmlPath, TEMPLATE);
  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  );
  try {
    const browserPage = await browser.newPage({
      viewport: { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
      colorScheme: "light",
    });
    await browserPage.goto(pathToFileURL(tempHtmlPath).href);
    await browserPage.evaluate(() => document.fonts.ready);
    await browserPage.screenshot({ path: OUTPUT_PATH });
  } finally {
    await browser.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(`Wrote ${OUTPUT_PATH}`);
}

await generate();
