/**
 * Renders the basemap picker previews, `packages/web/public/basemaps/<id>.jpg`,
 * as small screenshots of the real basemaps.
 *
 * @remarks
 * Run with `node scripts/generateBasemapThumbnails.mjs` after a basemap is
 * added or changes, then commit the images. Pass basemap ids
 * (`node scripts/generateBasemapThumbnails.mjs osm`) to render only those. It
 * builds nothing. A throwaway static server on port 4174 (never 4173, which
 * Playwright's preview owns) serves one HTML page and the installed
 * `maplibre-gl` files, and headless Chromium draws each basemap with MapLibre
 * from the style and tile URLs defined in
 * `packages/core/src/basemaps/basemaps.ts`, so the previews cannot drift from
 * what the picker selects. Every view is the same: the Cape Town Waterfront at
 * 160 by 120 CSS px, captured at twice that size.
 *
 * The images are small screenshots of OpenFreeMap (OpenMapTiles data and
 * OpenStreetMap contributors) and of the OpenStreetMap standard tile layer,
 * so they carry the credits recorded in `ATTRIBUTIONS.md`. The page needs the
 * network, and a GPU-less machine falls back to software WebGL. Chromium sends
 * its own user agent and the page's Referer; nothing pretends to be another
 * client, as the OpenStreetMap tile usage policy asks.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUTPUT_DIR = join(ROOT, "packages", "web", "public", "basemaps");
const PORT = 4174;

/** The CSS size of one preview. It matches the picker's `THUMB_WIDTH` and `THUMB_HEIGHT`. */
const WIDTH = 160;
const HEIGHT = 120;
const SCALE = 2;

/**
 * The Cape Town Waterfront, where the harbour, the shoreline and the street
 * grid all fit. It sits away from the city's own place label, which every
 * style draws far too large for a preview this small.
 */
const CENTRE = { lat: -33.907, lng: 18.428 };
/** Normalised (256 px tile) zoom, the convention `BasemapDefinition` uses. Close enough that labels stay small. */
const DEFAULT_ZOOM = 13;
/** Per-basemap zoom where the default does not read well at this size. */
const ZOOM_OVERRIDES = {};

/** JPEG quality tried first, then lowered until the file fits the budget. */
const START_QUALITY = 80;
const MIN_QUALITY = 55;
const BUDGET_BYTES = 15 * 1024;

const { BASEMAPS } = await import(
  pathToFileURL(join(ROOT, "packages/core/src/basemaps/basemaps.ts")).href
);

/** The basemaps to render: those named on the command line, or all of them. */
const REQUESTED = process.argv.slice(2);
const SELECTED = REQUESTED.length
  ? BASEMAPS.filter((basemap) => REQUESTED.includes(basemap.id))
  : BASEMAPS;
const UNKNOWN = REQUESTED.filter(
  (id) => !BASEMAPS.some((basemap) => basemap.id === id),
);
if (UNKNOWN.length > 0) {
  throw new Error(`Unknown basemap ids: ${UNKNOWN.join(", ")}`);
}

/** URL prefixes that map to the installed library folder, so MapLibre finds its own sibling files. */
const VENDOR = {
  "/vendor/maplibre-gl/": "node_modules/maplibre-gl/dist/",
};

/**
 * What MapLibre draws for a basemap, built the same way as `styleFor` in the
 * MapLibre adapter: a vector basemap's style URL, or an inline style with one
 * 256 px raster source for a raster basemap.
 */
function styleFor(basemap) {
  const { source } = basemap;
  if (source.kind === "vector") {
    return source.styleUrl;
  }
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [source.tileUrl],
        tileSize: source.tileSize,
        maxzoom: basemap.maxZoom,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

const MIME = {
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
};

/**
 * Builds the one HTML page, which draws a single basemap full-bleed and sets
 * `window.__mapReady` once its tiles have loaded.
 */
function pageFor(basemap, zoom) {
  const common = `
    <meta charset="utf-8" />
    <style>
      html, body, #map { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
    </style>`;

  return `<!doctype html><html><head>${common}
    <link rel="stylesheet" href="/vendor/maplibre-gl/maplibre-gl.css" />
  </head><body><div id="map"></div>
  <script type="module">
    import * as maplibregl from "/vendor/maplibre-gl/maplibre-gl.mjs";
    const map = new maplibregl.Map({
      container: "map",
      style: ${JSON.stringify(styleFor(basemap))},
      center: [${CENTRE.lng}, ${CENTRE.lat}],
      // MapLibre counts 512 px tiles, one zoom below the normalised value.
      zoom: ${zoom - 1},
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.on("idle", () => { window.__mapReady = true; });
  </script></body></html>`;
}

/** Serves the page for the id query and the vendor files, on loopback only. */
function startServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
    const prefix = Object.keys(VENDOR).find((key) =>
      url.pathname.startsWith(key),
    );
    if (prefix !== undefined) {
      const folder = join(ROOT, VENDOR[prefix]);
      const file = normalize(join(folder, url.pathname.slice(prefix.length)));
      if (file.startsWith(folder) && existsSync(file)) {
        response.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
        });
        createReadStream(file).pipe(response);
        return;
      }
    }
    const basemap = BASEMAPS.find(
      (entry) => entry.id === url.searchParams.get("id"),
    );
    if (url.pathname === "/" && basemap !== undefined) {
      const zoom = ZOOM_OVERRIDES[basemap.id] ?? DEFAULT_ZOOM;
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(pageFor(basemap, zoom));
      return;
    }
    response.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Captures one basemap as a JPEG, lowering the quality step by step until it
 * fits {@link BUDGET_BYTES} or reaches {@link MIN_QUALITY}.
 */
async function capture(page, basemap) {
  await page.goto(`http://127.0.0.1:${PORT}/?id=${basemap.id}`);
  await page.waitForFunction(() => window.__mapReady === true, undefined, {
    timeout: 15_000,
  });
  // Let the last frame paint and any late glyphs or sprites settle.
  await page.waitForTimeout(750);
  let quality = START_QUALITY;
  let image = await page.screenshot({ type: "jpeg", quality });
  while (image.length > BUDGET_BYTES && quality > MIN_QUALITY) {
    quality -= 5;
    image = await page.screenshot({ type: "jpeg", quality });
  }
  return { image, quality };
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const server = await startServer();
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
let failed = false;
try {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    reducedMotion: "reduce",
  });
  for (const basemap of SELECTED) {
    const page = await context.newPage();
    try {
      const { image, quality } = await capture(page, basemap);
      const file = join(OUTPUT_DIR, `${basemap.id}.jpg`);
      writeFileSync(file, image);
      const kb = (image.length / 1024).toFixed(1);
      const note =
        image.length > BUDGET_BYTES ? " (over the 15 kB budget)" : "";
      console.log(
        `${basemap.id}: ${kb} kB at quality ${quality}${note} -> ${file}`,
      );
    } catch (error) {
      failed = true;
      console.error(`${basemap.id}: failed`, error);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) {
  process.exitCode = 1;
}
