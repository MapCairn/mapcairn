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
import { CONTOUR_VIEW_BOX, CONTOURS, SUMMIT } from "../src/product/contours";

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
const gridLine = neutral[200];

const { width: W, height: H } = CONTOUR_VIEW_BOX;

/** The cairn's stones at a point, as the page's art draws them. */
function cairnAt(x: number, y: number, scale: number): string {
  const stones = STONES.map(
    ({ points, offset }) =>
      `<g transform="${offset ?? ""}"><polygon points="${points}" fill="${halo}" stroke="${halo}" stroke-width="40" stroke-linejoin="round"/><polygon points="${points}" fill="${accentColor}" stroke="${accentColor}" stroke-width="16" stroke-linejoin="round"/></g>`,
  ).join("");
  return `<g transform="translate(${x} ${y}) scale(${scale}) translate(-258 -420)">${stones}</g>`;
}

/** The grid every 80 units, as on the page. */
function grid(): string {
  const lines: string[] = [];
  for (let x = 80; x < W; x += 80) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  }
  for (let y = 80; y < H; y += 80) {
    lines.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`);
  }
  return `<g stroke="${gridLine}" stroke-width="1" vector-effect="non-scaling-stroke">${lines.join("")}</g>`;
}

const PIN = { x: 232, y: 318 };

const ART = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
  ${grid()}
  ${CONTOURS.map(
    ({ index, d }) =>
      `<path d="${d}" fill="none" stroke="${index ? contourIndex : contourMinor}" stroke-width="${index ? 2 : 1.25}" stroke-linejoin="round"/>`,
  ).join("\n  ")}
  <line x1="${PIN.x}" y1="${PIN.y}" x2="${SUMMIT.x}" y2="${SUMMIT.y}" stroke="${accent[600]}" stroke-width="3" stroke-dasharray="9 8" stroke-linecap="round"/>
  ${cairnAt(SUMMIT.x, SUMMIT.y, 0.1)}
  <g transform="translate(${PIN.x} ${PIN.y}) scale(1.3)"><path d="M0 0C-3 -8 -12 -14 -12 -24A12 12 0 0 1 12 -24C12 -14 3 -8 0 0Z" fill="${accent[600]}" stroke="${halo}" stroke-width="2"/><circle cx="0" cy="-24" r="4.5" fill="${halo}"/></g>
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
