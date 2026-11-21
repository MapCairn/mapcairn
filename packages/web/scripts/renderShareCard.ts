// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * Draws one link preview card (`src/product/shareCard.ts`) to a PNG with
 * Playwright's Chromium, which the project already has, so no image library
 * joins the dependencies. Both card generators call it.
 *
 * @remarks Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a Chromium of your
 * own. The card holds no map tiles, so it needs no attribution.
 */
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH } from "../src/constants/siteConfig";
import { type ShareCardWords, shareCardHtml } from "../src/product/shareCard";

const FONT_PATH = fileURLToPath(
  import.meta.resolve(
    "@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  ),
);
const MARK_PATH = fileURLToPath(
  new URL("../public/favicon.svg", import.meta.url),
);
const SCRIPTS_PARENT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Writes the card with these words to `outputPath` and prints its size.
 * @param words - The headline and lede of the card.
 * @param outputPath - The PNG to write, an absolute path.
 */
export async function renderShareCard(
  words: ShareCardWords,
  outputPath: string,
): Promise<void> {
  const tempDir = mkdtempSync(join(SCRIPTS_PARENT, ".share-card-"));
  const htmlPath = join(tempDir, "card.html");
  writeFileSync(
    htmlPath,
    shareCardHtml(words, {
      fontUrl: pathToFileURL(FONT_PATH).href,
      markUrl: pathToFileURL(MARK_PATH).href,
    }),
  );
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
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() =>
      Promise.all([
        document.fonts.ready,
        ...[...document.images].map((image) => image.decode()),
      ]),
    );
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
  console.log(`Wrote ${outputPath} (${statSync(outputPath).size} bytes)`);
}
