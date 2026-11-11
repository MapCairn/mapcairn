/**
 * Renders the MapCairn icon set in `public/` from the hand-written master SVGs
 * in `scripts/icons/`.
 *
 * @remarks
 * Run with `node scripts/generateIcons.mjs` from `packages/web` after a master
 * SVG changes. It drives the Chromium bundled with `@playwright/test`, so no
 * image library is needed. The ICO file is assembled here from PNG buffers.
 * Output: `favicon.svg`, `safari-pinned-tab.svg`, `favicon.ico`, the PNG
 * favicons, `apple-touch-icon.png`, the Android and maskable icons and the
 * Windows tile.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ICONS_DIR = fileURLToPath(new URL("./icons/", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

/** PNG renders: master SVG, output size in pixels, and whether to keep transparency. */
const PNG_TARGETS = [
  {
    out: "favicon-16x16.png",
    master: "mark.svg",
    size: 16,
    transparent: true,
  },
  { out: "favicon-32x32.png", master: "mark.svg", size: 32, transparent: true },
  {
    out: "apple-touch-icon.png",
    master: "mark-bleed.svg",
    size: 180,
    transparent: false,
  },
  {
    out: "android-chrome-192x192.png",
    master: "mark.svg",
    size: 192,
    transparent: true,
  },
  {
    out: "android-chrome-512x512.png",
    master: "mark.svg",
    size: 512,
    transparent: true,
  },
  {
    out: "maskable-icon-512x512.png",
    master: "mark-maskable.svg",
    size: 512,
    transparent: false,
  },
  {
    out: "mstile-150x150.png",
    master: "mstile-glyph.svg",
    size: 150,
    transparent: true,
  },
];

/** Entries of `favicon.ico`. */
const ICO_TARGETS = [
  { master: "mark.svg", size: 16 },
  { master: "mark.svg", size: 32 },
  { master: "mark.svg", size: 48 },
];

/** SVG masters that ship unchanged. */
const SVG_COPIES = [
  ["favicon.svg", "favicon.svg"],
  ["safari-pinned-tab.svg", "safari-pinned-tab.svg"],
];

/**
 * Builds an ICO container holding PNG-compressed entries.
 *
 * @param entries - Square images, each a PNG buffer and its pixel size.
 * @returns The ICO file bytes.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach(({ png, size }, index) => {
    const at = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at);
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1);
    directory.writeUInt16LE(1, at + 4);
    directory.writeUInt16LE(32, at + 6);
    directory.writeUInt32LE(png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([
    header,
    directory,
    ...entries.map((entry) => entry.png),
  ]);
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await context.newPage();

  /**
   * Rasterises an SVG master at an exact pixel size.
   *
   * @param master - File name in `scripts/icons/`.
   * @param size - Width and height in pixels.
   * @param transparent - Keep alpha when true, otherwise the SVG must paint every pixel.
   * @returns The PNG bytes.
   */
  async function render(master, size, transparent) {
    const svg = readFileSync(join(ICONS_DIR, master)).toString("base64");
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent"><img alt="" width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${svg}"></body></html>`,
    );
    await page.evaluate(() =>
      Promise.all([...document.images].map((image) => image.decode())),
    );
    return page.screenshot({
      type: "png",
      omitBackground: transparent,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  }

  mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const [from, to] of SVG_COPIES) {
    copyFileSync(join(ICONS_DIR, from), join(PUBLIC_DIR, to));
  }
  for (const { out, master, size, transparent } of PNG_TARGETS) {
    writeFileSync(
      join(PUBLIC_DIR, out),
      await render(master, size, transparent),
    );
  }
  const icoEntries = [];
  for (const { master, size } of ICO_TARGETS) {
    icoEntries.push({ png: await render(master, size, true), size });
  }
  writeFileSync(join(PUBLIC_DIR, "favicon.ico"), buildIco(icoEntries));
} finally {
  await browser.close();
}
