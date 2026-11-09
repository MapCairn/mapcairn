/**
 * Renders `public/og-image.png`, the Open Graph/Twitter card preview image
 * used by `root.tsx`'s `meta()`, from a small self-contained HTML template.
 *
 * @remarks
 * Run with `npm run generate:og-image -w @karta/web` after brand
 * copy or colours change. There's no image-generation library in the
 * dependency tree (no `sharp`/`satori`/`resvg`), but `@playwright/test`'s
 * bundled Chromium already is, so this reuses it as a one-shot HTML-to-PNG
 * renderer rather than adding a new dependency for the same job. Uses the
 * same self-hosted IBM Plex Sans file, `SITE_URL`, brand copy (the `TITLE`
 * and `TAGLINE` constants below) and the light theme's colour values from
 * `@karta/theme` as the live app, so the card can't drift from what a
 * visitor sees after clicking through.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
// Read from the source file, not the `@karta/theme` barrel, because the barrel
// loads vanilla-extract style files that only the Vite plugin can evaluate.
import { themeValues } from "../../theme/src/tokenValues";
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
const OUTPUT_PATH = fileURLToPath(
  new URL("../public/og-image.png", import.meta.url),
);

const TITLE = "Karta";
const TAGLINE =
  "Explore an interactive map. Search places, compare basemaps and measure distances or areas.";
const URL_LABEL = SITE_URL.replace(/^https?:\/\//, "");

const colour = themeValues.light.opaque;
const surfaceColor = colour.surfaceRaised;
const accentColor = colour.accent;
const textColor = colour.text;
const mutedColor = colour.textMuted;

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
  .frame {
    position: absolute;
    inset: 40px;
    border: 2px solid ${textColor};
  }
  .content {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 96px;
  }
  .title {
    font-size: 112px;
    font-weight: 600;
    color: ${textColor};
    line-height: 1;
  }
  .rule {
    margin-top: 36px;
    width: 160px;
    height: 6px;
    background: ${accentColor};
  }
  .tagline {
    margin-top: 32px;
    max-width: 820px;
    font-size: 34px;
    font-weight: 400;
    line-height: 1.35;
    color: ${textColor};
  }
  .url {
    position: absolute;
    left: 96px;
    bottom: 72px;
    font-size: 26px;
    font-weight: 500;
    color: ${mutedColor};
  }
</style>
</head>
<body>
  <div class="frame"></div>
  <div class="content">
    <div class="title">${TITLE}</div>
    <div class="rule"></div>
    <div class="tagline">${TAGLINE}</div>
  </div>
  <div class="url">${URL_LABEL}</div>
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
    });
    await page.goto(pathToFileURL(tempHtmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUTPUT_PATH });
  } finally {
    await browser.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`Wrote ${OUTPUT_PATH}`);
}

await generateOgImage();
