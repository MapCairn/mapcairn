// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Renders `public/og-image.png`, the Open Graph/Twitter card preview image
 * used by `root.tsx`'s `meta()`, from a small self-contained HTML template.
 *
 * @remarks
 * Run with `npm run generate:og-image -w @mapcairn/web` after brand
 * copy or colours change. There's no image-generation library in the
 * dependency tree (no `sharp`/`satori`/`resvg`), but `@playwright/test`'s
 * bundled Chromium already is, so this reuses it as a one-shot HTML-to-PNG
 * renderer rather than adding a new dependency for the same job. Uses the
 * same self-hosted IBM Plex Sans file, `SITE_URL`, brand copy (the `TITLE`
 * and `TAGLINE` constants below) and the light theme's colour values from
 * `@mapcairn/theme` as the live app, so the card can't drift from what a
 * visitor sees after clicking through.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
// Read from the source file, not the `@mapcairn/theme` barrel, because the barrel
// loads vanilla-extract style files that only the Vite plugin can evaluate.
import { accent, neutral, themeValues } from "../../theme/src/tokenValues";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  SITE_URL,
} from "../src/constants/siteConfig";

const FONT_PATH = fileURLToPath(
  import.meta.resolve(
    "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  ),
);
const FAVICON_PATH = fileURLToPath(
  new URL("../public/favicon.svg", import.meta.url),
);
const OUTPUT_PATH = fileURLToPath(
  new URL("../public/og-image.png", import.meta.url),
);

const TITLE = "MapCairn";
const TAGLINE =
  "Explore an interactive map. Search places, compare basemaps and measure distances or areas.";
const URL_LABEL = SITE_URL.replace(/^https?:\/\//, "");

const colour = themeValues.light.opaque;
const surfaceColor = colour.surfaceRaised;
const accentColor = accent[600];
const onAccent = colour.accentContrast;
const accentTint = accent[100];
const accentSoft = accent[200];
const textColor = colour.text;
const lineColor = neutral[300];
const fineLineColor = neutral[200];
const roadColor = neutral[300];

/** Where the contour rings are centred, near the lower right of the card. */
const HILL = { x: 960, y: 420 };

/**
 * The MapCairn mark: the cairn on the accent tile, drawn from `public/favicon.svg`
 * itself (its light variant, since the page renders in the light scheme), so the
 * card cannot drift from the icon.
 */
const MARK_SVG = `<img src="${pathToFileURL(FAVICON_PATH).href}" width="156" height="156" alt="" />`;

/**
 * A closed, wobbling ring around {@link HILL}, like one contour line of a
 * hill. The wobble is a fixed sum of sine waves, so the output is stable.
 * @param radius - Mean radius in pixels.
 * @param seed - Shifts the wobble phase so neighbouring rings drift apart.
 */
function contourPath(radius: number, seed: number): string {
  const steps = 160;
  const points: string[] = [];
  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const wobble =
      1 +
      0.1 * Math.sin(3 * angle + seed * 0.45) +
      0.05 * Math.sin(5 * angle + seed * 0.8) +
      0.03 * Math.sin(2 * angle - seed * 0.3);
    const x = HILL.x + radius * 1.35 * wobble * Math.cos(angle);
    const y = HILL.y + radius * 0.9 * wobble * Math.sin(angle);
    points.push(`${step === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${points.join("")}Z`;
}

const CONTOURS = Array.from({ length: 11 }, (_, index) => {
  const radius = 30 + index * 34;
  const major = index % 5 === 4;
  return `<path d="${contourPath(radius, index)}" fill="none" stroke="${lineColor}" stroke-width="${major ? 2 : 1.25}" opacity="${major ? 0.85 : 0.6}"/>`;
}).join("\n    ");

/** Evenly spaced parallel streets, rotated as a block, for a city-grid texture. */
const GRID = (() => {
  const lines: string[] = [];
  for (let offset = -900; offset <= 900; offset += 56) {
    lines.push(
      `<line x1="${offset}" y1="-900" x2="${offset}" y2="900" stroke="${fineLineColor}" stroke-width="2"/>`,
      `<line x1="-900" y1="${offset}" x2="900" y2="${offset}" stroke="${fineLineColor}" stroke-width="2"/>`,
    );
  }
  return lines.join("");
})();

/**
 * The map motif: a bay in the top corner, a street grid, two arterial roads,
 * contour rings and a dropped-pin accuracy halo. It fades out towards the text
 * through a horizontal mask, so the left of the card stays clean.
 */
const MOTIF_SVG = `<svg viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" aria-hidden="true">
  <defs>
    <linearGradient id="fade" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0.3" stop-color="${onAccent}" stop-opacity="0"/>
      <stop offset="0.62" stop-color="${onAccent}" stop-opacity="1"/>
    </linearGradient>
    <mask id="reveal"><rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="url(#fade)"/></mask>
    <clipPath id="land"><path d="M0 0H${OG_IMAGE_WIDTH}V${OG_IMAGE_HEIGHT}H0Z"/></clipPath>
  </defs>
  <g mask="url(#reveal)">
    <g transform="translate(900 360) rotate(-24)" opacity="0.55">${GRID}</g>
    <path d="M520 0C640 60 700 150 800 170C900 190 1000 130 1080 190C1140 235 1170 300 1200 320V0Z" fill="${accentTint}"/>
    <path d="M520 0C640 60 700 150 800 170C900 190 1000 130 1080 190C1140 235 1170 300 1200 320" fill="none" stroke="${accentSoft}" stroke-width="3"/>
    <path d="M610 ${OG_IMAGE_HEIGHT}C700 520 760 470 860 440S1040 330 1200 300" fill="none" stroke="${roadColor}" stroke-width="9" stroke-linecap="round"/>
    <path d="M610 ${OG_IMAGE_HEIGHT}C700 520 760 470 860 440S1040 330 1200 300" fill="none" stroke="${surfaceColor}" stroke-width="4" stroke-linecap="round"/>
    <path d="M760 ${OG_IMAGE_HEIGHT}C800 560 880 540 940 480S1010 340 1080 ${OG_IMAGE_HEIGHT}" fill="none" stroke="${roadColor}" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
    ${CONTOURS}
    <circle cx="${HILL.x}" cy="${HILL.y}" r="76" fill="${accentColor}" fill-opacity="0.1" stroke="${accentColor}" stroke-opacity="0.35" stroke-width="2"/>
    <circle cx="${HILL.x}" cy="${HILL.y}" r="18" fill="${accentColor}" stroke="${onAccent}" stroke-width="6"/>
  </g>
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
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    width: ${OG_IMAGE_WIDTH}px;
    height: ${OG_IMAGE_HEIGHT}px;
    background: ${surfaceColor};
    font-family: "IBM Plex Sans Variable", sans-serif;
    position: relative;
    overflow: hidden;
  }
  .motif {
    position: absolute;
    inset: 0;
  }
  .bar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 10px;
    background: ${accentColor};
  }
  .content {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 88px 24px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 36px;
  }
  .brand img {
    display: block;
    border-radius: 35px;
    box-shadow: 0 10px 28px color-mix(in oklch, ${accentColor} 28%, transparent);
  }
  .title {
    font-size: 120px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: ${textColor};
    line-height: 1;
  }
  .tagline {
    margin-top: 44px;
    max-width: 640px;
    font-size: 36px;
    font-weight: 400;
    line-height: 1.38;
    color: ${textColor};
  }
  .url {
    position: absolute;
    left: 88px;
    bottom: 56px;
    font-size: 26px;
    font-weight: 600;
    color: ${accent[700]};
  }
</style>
</head>
<body>
  <div class="motif">${MOTIF_SVG}</div>
  <div class="content">
    <div class="brand">${MARK_SVG}<div class="title">${TITLE}</div></div>
    <div class="tagline">${TAGLINE}</div>
  </div>
  <div class="url">${URL_LABEL}</div>
  <div class="bar"></div>
</body>
</html>`;

/**
 * Renders {@link TEMPLATE} with a headless Chromium page sized exactly to
 * the OG image's target dimensions and writes the resulting screenshot to
 * {@link OUTPUT_PATH}.
 * @remarks Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to point at a specific
 *   Chromium binary (e.g. one pre-installed at a fixed path outside
 *   Playwright's own version-pinned cache) instead of `playwright install`ing
 *   a matching browser; unset, this launches Playwright's own resolved
 *   Chromium as usual.
 */
async function generateOgImage(): Promise<void> {
  const tempDir = mkdtempSync(
    join(fileURLToPath(new URL("..", import.meta.url)), ".og-image-"),
  );
  const tempHtmlPath = join(tempDir, "og-image.html");
  writeFileSync(tempHtmlPath, TEMPLATE);

  const browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  );
  try {
    const page = await browser.newPage({
      viewport: { width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT },
      colorScheme: "light",
    });
    await page.goto(pathToFileURL(tempHtmlPath).href);
    await page.evaluate(() =>
      Promise.all([
        document.fonts.ready,
        ...[...document.images].map((image) => image.decode()),
      ]),
    );
    await page.screenshot({ path: OUTPUT_PATH });
  } finally {
    await browser.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`Wrote ${OUTPUT_PATH}`);
}

await generateOgImage();
