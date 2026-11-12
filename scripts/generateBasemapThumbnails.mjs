/**
 * Renders the basemap picker previews, `packages/web/public/basemaps/<id>.jpg`,
 * as small screenshots of the real basemaps.
 *
 * @remarks
 * Run with `node scripts/generateBasemapThumbnails.mjs` after a basemap is
 * added or changes, then commit the images. Which basemaps get a preview, and
 * where the file goes, is `BASEMAP_THUMBNAILS` in
 * `packages/web/src/basemaps/basemapThumbnails.ts`: the SDK's definitions name
 * no preview. Pass basemap ids
 * (`node scripts/generateBasemapThumbnails.mjs osm`) to render only those. It
 * builds nothing. A throwaway static server on port 4174 (never 4173, which
 * Playwright's preview owns) serves one HTML page and the installed
 * `maplibre-gl` files, and headless Chromium draws each basemap with MapLibre
 * from the style and tile URLs defined in
 * `packages/core/src/basemaps/basemaps.ts` and in the host's own
 * `packages/web/src/basemaps/openTopoMapBasemap.ts` and
 * `packages/web/src/basemaps/satelliteBasemap.ts`, so the previews cannot
 * drift from what the picker selects. Every view is the same: the Cape Town
 * Waterfront at 160 by 120 CSS px, captured at twice that size.
 *
 * The images are small screenshots of OpenFreeMap (OpenMapTiles data and
 * OpenStreetMap contributors), of the OpenStreetMap standard tile layer, of
 * OpenTopoMap and of EOX's Sentinel-2 cloudless imagery, so they carry the
 * credits and licences recorded in `ATTRIBUTIONS.md`. The
 * page needs the network, and a GPU-less machine falls back to software WebGL.
 * Chromium sends its own user agent and the page's Referer; nothing pretends
 * to be another client, as the OpenStreetMap tile usage policy asks.
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
const PUBLIC_DIR = join(ROOT, "packages", "web", "public");
const OUTPUT_DIR = join(PUBLIC_DIR, "basemaps");
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

const { BASEMAPS: SDK_BASEMAPS } = await import(
  pathToFileURL(join(ROOT, "packages/core/src/basemaps/basemaps.ts")).href
);
const { OPEN_TOPO_MAP_BASEMAP } = await import(
  pathToFileURL(join(ROOT, "packages/web/src/basemaps/openTopoMapBasemap.ts"))
    .href
);

const { SATELLITE_BASEMAP } = await import(
  pathToFileURL(join(ROOT, "packages/web/src/basemaps/satelliteBasemap.ts"))
    .href
);

/** The preview path the site serves for each basemap it offers (a module with no imports, so plain Node loads it). */
const { BASEMAP_THUMBNAILS } = await import(
  pathToFileURL(join(ROOT, "packages/web/src/basemaps/basemapThumbnails.ts"))
    .href
);

/**
 * The SDK's basemaps and those only the reference host defines (which import
 * types only so plain Node loads them), less any the host names no preview
 * for in `BASEMAP_THUMBNAILS`: their tile is a swatch, so there is no image to
 * render. The SDK's definitions name none, so the host's table decides.
 */
const BASEMAPS = [
  ...SDK_BASEMAPS,
  OPEN_TOPO_MAP_BASEMAP,
  SATELLITE_BASEMAP,
].filter((basemap) => BASEMAP_THUMBNAILS[basemap.id] !== undefined);

/** The basemaps to render: those named on the command line, or all of them. */
const REQUESTED = process.argv.slice(2);
const SELECTED = REQUESTED.length
  ? BASEMAPS.filter((basemap) => REQUESTED.includes(basemap.id))
  : BASEMAPS;
const UNKNOWN = REQUESTED.filter(
  (id) => !BASEMAPS.some((basemap) => basemap.id === id),
);
if (UNKNOWN.length > 0) {
  throw new Error(
    `Unknown basemap ids, or ones the host names no preview for: ${UNKNOWN.join(", ")}`,
  );
}

/** URL prefixes that map to the installed library folder, so MapLibre finds its own sibling files. */
const VENDOR = {
  "/vendor/maplibre-gl/": "node_modules/maplibre-gl/dist/",
};

/**
 * What MapLibre draws for a basemap, built the same way as `styleFor` in the
 * MapLibre adapter: a vector basemap's style URL, a hybrid basemap's label
 * style URL (the page adds the imagery as `composeHybrid` in the adapter
 * does), or an inline style with one 256 px raster source for a raster basemap.
 */
function styleFor(basemap) {
  const { source } = basemap;
  if (source.kind === "vector") {
    return source.styleUrl;
  }
  if (source.kind === "hybrid") {
    return source.labelStyleUrl;
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
    // A hybrid basemap. The source of truth is "composeHybrid" in
    // packages/web/src/adapters/maplibre/MapLibreMapAdapter.ts; this mirrors
    // it, so change both together: keep the label style's line and symbol
    // layers from the kept source layers (less those it names to leave out),
    // put the imagery under them, capped at its deepest real level, and lay
    // the basemap's swatch colour under that as a plain ground.
    const hybrid = ${JSON.stringify(basemap.source.kind === "hybrid" ? { ...basemap.source, swatch: basemap.swatch } : null)};
    map.on("style.load", () => {
      if (!hybrid) {
        return;
      }
      const keep = new Set(hybrid.labelSourceLayers);
      const omit = new Set(hybrid.labelOmitLayers ?? []);
      const types = new Set(["line", "symbol"]);
      for (const layer of map.getStyle().layers) {
        const kept = types.has(layer.type) && keep.has(layer["source-layer"] ?? "") && !omit.has(layer.id);
        if (!kept) {
          map.removeLayer(layer.id);
        }
      }
      map.addSource("imagery", {
        type: "raster",
        tiles: [hybrid.tileUrl],
        tileSize: hybrid.tileSize,
        maxzoom: hybrid.maxTileZoom,
      });
      map.addLayer(
        { id: "imagery", type: "raster", source: "imagery" },
        map.getStyle().layers[0]?.id,
      );
      if (hybrid.swatch) {
        map.addLayer(
          { id: "ground", type: "background", paint: { "background-color": hybrid.swatch } },
          "imagery",
        );
      }
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
      const file = join(PUBLIC_DIR, BASEMAP_THUMBNAILS[basemap.id]);
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
