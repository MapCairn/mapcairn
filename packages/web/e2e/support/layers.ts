// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page, Route } from "@playwright/test";

const FIXTURES = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/layers/fixtures",
);

/** A 1x1 transparent PNG, for every tile overlay. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * Every origin a layer definition requests. A test fails if the app reaches
 * one before a layer is on; `mockLayerProviders` answers all of them.
 */
export const LAYER_PROVIDER_ORIGINS: readonly string[] = [
  "https://earthquake.usgs.gov",
  "https://gibs.earthdata.nasa.gov",
  "https://www.gdacs.org",
  "https://ows.globalfloods.eu",
  "https://cdn.jsdelivr.net",
];

/** The recorded responses, by the URL pattern they answer. Tiles get an empty PNG. */
const FEEDS: readonly { readonly pattern: RegExp; readonly file: string }[] = [
  {
    pattern: /earthquake\.usgs\.gov\/earthquakes\/feed\//,
    file: "usgs-2.5_day.json",
  },
  {
    pattern: /www\.gdacs\.org\/gdacsapi\/api\/events\//,
    file: "gdacs-events.json",
  },
  {
    pattern: /www\.gdacs\.org\/gdacsapi\/api\/polygons\//,
    file: "gdacs-tc-geometry.json",
  },
  {
    pattern: /cdn\.jsdelivr\.net\/gh\/nvkelso\/natural-earth-vector@/,
    file: "world-countries.json",
  },
];

const TILE_PATTERN = /gibs\.earthdata\.nasa\.gov|ows\.globalfloods\.eu/;

/** Every request the suite saw for a layer provider, in order. */
export interface LayerRequests {
  readonly urls: string[];
  /**
   * Answers every tile held by `holdTiles` with a transparent PNG, as when
   * a provider that stalled answers at last. Tiles asked for afterwards are
   * answered at once.
   */
  releaseTiles(): Promise<void>;
}

/** Options for {@link mockLayerProviders}. */
export interface LayerProviderOptions {
  /**
   * Whether the provider has no tile at this URL. Such a tile is answered as
   * NASA GIBS answers a time it has not published: a 404 with an open CORS
   * header, which the engine counts as a tile that did not load, not as an
   * error. Every other tile is a transparent PNG.
   */
  readonly noTile?: (url: string) => boolean;
  /**
   * Whether every tile request is recorded and not answered until
   * `LayerRequests.releaseTiles`, as when a provider's server accepts the
   * connection and stalls. The engine then never goes idle, which the map
   * region's busy state must not wait for.
   */
  readonly holdTiles?: boolean;
}

/**
 * Answers every layer provider from the committed fixtures, so layer tests
 * exercise the real fetch source and decoders without a live service, and
 * records what was asked. A fixture the folder lacks answers 404.
 */
export async function mockLayerProviders(
  page: Page,
  options: LayerProviderOptions = {},
): Promise<LayerRequests> {
  const held: Route[] = [];
  let holding = options.holdTiles === true;
  const answerTile = (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: TRANSPARENT_PNG,
    });
  const requests: LayerRequests = {
    urls: [],
    releaseTiles: async () => {
      holding = false;
      await Promise.all(held.splice(0).map(answerTile));
    },
  };
  for (const { pattern, file } of FEEDS) {
    await page.route(pattern, (route) => {
      requests.urls.push(route.request().url());
      let body: string;
      try {
        body = readFileSync(resolve(FIXTURES, file), "utf8");
      } catch {
        return route.fulfill({ status: 404, body: "" });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body,
      });
    });
  }
  await page.route(TILE_PATTERN, (route) => {
    const url = route.request().url();
    requests.urls.push(url);
    if (holding) {
      held.push(route);
      return;
    }
    if (options.noTile?.(decodeURIComponent(url))) {
      return route.fulfill({
        status: 404,
        contentType: "text/html",
        headers: { "access-control-allow-origin": "*" },
        body: "",
      });
    }
    return answerTile(route);
  });
  return requests;
}
