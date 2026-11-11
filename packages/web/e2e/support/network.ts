import type { Page } from "@playwright/test";

/**
 * A 1x1 transparent PNG, served in place of every raster basemap tile so the
 * suite never depends on a tile provider's availability or rate limits.
 */
export const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * The raster tile hosts of the site's Streets and Topographic basemaps, and
 * of Satellite's imagery.
 */
export const RASTER_TILE_PATTERN =
  /(?:tile\.openstreetmap\.org|tile\.opentopomap\.org|tiles\.maps\.eox\.at)/;

/** Satellite's imagery tiles, from EOX. */
export const SATELLITE_TILE_PATTERN = /tiles\.maps\.eox\.at\/wmts\//;

/**
 * Vector style documents from OpenFreeMap: Bright (the default, whose labels
 * Satellite draws over its imagery), Positron and Dark on the site, and Liberty
 * and Fiord for a host that offers the SDK's whole list. No test reaches
 * OpenFreeMap.
 */
export const VECTOR_STYLE_PATTERN = /tiles\.openfreemap\.org\/styles\//;

/** The OpenFreeMap Positron style document, a basemap that is not the default. */
export const OTHER_VECTOR_STYLE_PATTERN =
  /tiles\.openfreemap\.org\/styles\/positron/;

/** OpenFreeMap sprite sheets: their JSON index and their images. */
export const SPRITE_PATTERN = /tiles\.openfreemap\.org\/sprites\//;

/** A Nominatim place search. */
export const GEOCODER_SEARCH_PATTERN = /nominatim\.openstreetmap\.org\/search/;

/** A Nominatim reverse lookup. */
export const GEOCODER_REVERSE_PATTERN =
  /nominatim\.openstreetmap\.org\/reverse/;

/** The MapLibre worker script emitted by the build. */
export const MAPLIBRE_WORKER_PATTERN =
  /\/assets\/maplibre-gl-worker-[\w-]+\.js/;

/**
 * A minimal MapLibre style with one inline GeoJSON point, served in place of
 * the OpenFreeMap styles. The GeoJSON source makes MapLibre start its worker,
 * so the suite still exercises the worker without tile, glyph or sprite
 * requests.
 */
export const MINIMAL_VECTOR_STYLE = {
  version: 8,
  sources: {
    "worker-check": {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: { type: "Point", coordinates: [0, 0] },
          },
        ],
      },
    },
  },
  layers: [{ id: "worker-check", type: "circle", source: "worker-check" }],
};

/** The one place every real Nominatim search in the suite resolves to. */
export const GEOCODER_RESULT = {
  place_id: 26262288,
  display_name: "Soweto, City of Johannesburg, Gauteng, South Africa",
  lat: "-26.2678",
  lon: "27.8586",
  boundingbox: ["-26.35", "-26.20", "27.75", "27.95"],
};

/** The reverse lookup every real Nominatim `/reverse` request resolves to. */
export const GEOCODER_REVERSE_RESULT = {
  place_id: 26262500,
  display_name:
    "Diepkloof, Soweto, City of Johannesburg, Gauteng, South Africa",
  lat: "-26.25",
  lon: "27.94",
};

/**
 * Stubs every third-party request the app makes (raster tiles, vector styles
 * and Nominatim), so tests are deterministic and never reach a live service.
 * Tests that need a different answer register their own route afterwards,
 * which Playwright tries first.
 */
export async function mockThirdPartyServices(page: Page): Promise<void> {
  // Nothing may reach the routing service unless a test scripts it (a test's
  // own route is tried first), because a route is sent only when asked for.
  await page.route(/valhalla1\.openstreetmap\.de/, (route) => route.abort());
  await page.route(RASTER_TILE_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: TRANSPARENT_PNG,
    }),
  );
  await page.route(VECTOR_STYLE_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MINIMAL_VECTOR_STYLE),
    }),
  );
  await page.route(GEOCODER_SEARCH_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([GEOCODER_RESULT]),
    }),
  );
  await page.route(GEOCODER_REVERSE_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(GEOCODER_REVERSE_RESULT),
    }),
  );
}
