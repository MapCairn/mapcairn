// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import { VECTOR } from "./kindLayers";

/*
 * Vector tiles in both encodings for the MapLibre Tile specs. The two files in
 * `e2e/files` hold the same made-up tile: one square polygon in a layer named
 * `areas`, with a `kind` and a `name`, reaching past the edges of the tile so
 * that it fills whichever tile of the map asks for it. `areas.mvt` was made
 * with `@maplibre/vt-pbf` and `areas.mlt` from it with `mlt convert` (the
 * reference converter, 0.7.0). Nothing in them comes from a provider.
 */

const FILES = resolve(dirname(fileURLToPath(import.meta.url)), "../files");

/** The tile as Mapbox Vector Tile bytes. */
export const MVT_TILE = readFileSync(resolve(FILES, "areas.mvt"));

/** The same tile as MapLibre Tile bytes. */
export const MLT_TILE = readFileSync(resolve(FILES, "areas.mlt"));

/** The origin the specs' tiles borrow, which the page's policy lets the map reach. */
export const MLT_TILE_PATTERN = /tiles\.openfreemap\.org\/mlt\//;

const TILE_URL = "https://tiles.openfreemap.org/mlt/{z}/{x}/{y}.pbf";

/** The sample vector layer of the kind specs, with its tiles and encoding set by the spec. */
export function vectorLayer(
  id: string,
  encoding: "mvt" | "mlt" | undefined,
): typeof VECTOR {
  const { source } = VECTOR;
  if (source.kind !== "vector-tiles") {
    throw new Error("The sample vector layer must have a vector tile source.");
  }
  return {
    ...VECTOR,
    id,
    source: {
      ...source,
      tiles: TILE_URL,
      ...(encoding ? { encoding } : {}),
    },
  } as typeof VECTOR;
}

/** What the tile route answers with now; a spec changes it between page loads. */
export interface TileAnswer {
  body: Buffer;
}

/** Answers every tile of the specs' tile origin with `answer.body`, whichever `Accept` header the engine sends. */
export async function answerTiles(
  page: Page,
  answer: TileAnswer,
): Promise<void> {
  await page.route(MLT_TILE_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      headers: { "access-control-allow-origin": "*" },
      body: answer.body,
    }),
  );
}

/** The colour channels may differ by this much before two pixels count as different. */
const CHANNEL_TOLERANCE = 8;

/**
 * How many pixels differ between two PNG images of the same size. It decodes
 * them in a blank page of its own, because the app's policy would refuse the
 * data addresses.
 */
export async function differingPixels(
  context: BrowserContext,
  first: Buffer,
  second: Buffer,
): Promise<number> {
  const page = await context.newPage();
  try {
    return await page.evaluate(
      async ({ images, tolerance }) => {
        const read = async (base64: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const drawing = canvas.getContext("2d");
          if (!drawing) {
            throw new Error("No 2d canvas.");
          }
          drawing.drawImage(image, 0, 0);
          return drawing.getImageData(0, 0, image.width, image.height).data;
        };
        const [a, b] = await Promise.all(images.map(read));
        if (!a || !b || a.length !== b.length) {
          throw new Error("The images are not the same size.");
        }
        let different = 0;
        for (let index = 0; index < a.length; index += 4) {
          const changed = [0, 1, 2].some(
            (channel) =>
              Math.abs((a[index + channel] ?? 0) - (b[index + channel] ?? 0)) >
              tolerance,
          );
          different += changed ? 1 : 0;
        }
        return different;
      },
      {
        images: [first.toString("base64"), second.toString("base64")],
        tolerance: CHANNEL_TOLERANCE,
      },
    );
  } finally {
    await page.close();
  }
}
