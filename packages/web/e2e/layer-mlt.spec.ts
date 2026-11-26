// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import {
  answerTiles,
  differingPixels,
  MLT_TILE,
  MVT_TILE,
  vectorLayer,
} from "./support/mltTiles";
import { MINIMAL_VECTOR_STYLE, VECTOR_STYLE_PATTERN } from "./support/network";
import { scriptLayers } from "./support/services";
import { viewportDetails, waitForStableLayout } from "./support/states";

/*
 * Vector tiles that say how they are encoded. The same made-up tile is served
 * as Mapbox Vector Tile bytes and as MapLibre Tile bytes (see
 * `support/mltTiles.ts`), and the map engine in the page decodes it, so these
 * specs show the passthrough works end to end: a source that declares `mlt`
 * draws, in the map, in a saved image and as a basemap style's own source, and
 * a server that answers in the other encoding gives a readable status in place
 * of a blank layer, which goes once a tile loads. The mismatch specs pin the
 * engine's wording of an unreadable tile (see `tileFormatWatch.ts`), so run
 * this spec on every maplibre-gl upgrade. The reference site adopts no MapLibre Tile source; the
 * layers here exist only in the test.
 */

const AT_CENTRE = "map=7.00/30.00000/31.00000";
const FORMAT_STATUS = "This layer's tiles are in another format.";

/** The fewest pixels a layer that fills the map changes, so a layer that draws is told from one that does not. */
const DRAWN_PIXELS = 10_000;

/** The most pixels two renderings of the same tile may differ by, for the engine's own rounding. */
const SAME_PIXELS = 50;

const EMPTY = Buffer.alloc(0);

test.describe("vector tiles that declare their encoding", () => {
  test.use({ reducedMotion: "reduce" });

  test("a source that declares mlt draws the layer, as the same tile in mvt does", async ({
    page,
    mapPage,
  }) => {
    await scriptLayers(page, [vectorLayer("kind-mlt", "mlt")]);
    const answer = { body: EMPTY };
    await answerTiles(page, answer);
    const shoot = async () => {
      await mapPage.goto(`#layers=kind-mlt&${AT_CENTRE}`);
      return mapPage.host.screenshot({ animations: "disabled" });
    };
    const blank = await shoot();
    answer.body = MLT_TILE;
    const drawn = await shoot();
    await expect
      .poll(async () => differingPixels(page.context(), blank, await shoot()))
      .toBeGreaterThan(DRAWN_PIXELS);

    await scriptLayers(page, [vectorLayer("kind-mlt", undefined)]);
    answer.body = MVT_TILE;
    const plain = await shoot();
    expect(await differingPixels(page.context(), blank, plain)).toBeGreaterThan(
      DRAWN_PIXELS,
    );
    expect(await differingPixels(page.context(), drawn, plain)).toBeLessThan(
      SAME_PIXELS,
    );

    await mapPage.openMapOptions();
    await expect(page.getByTestId("layer-status-kind-mlt")).toHaveCount(0);
  });

  for (const [name, encoding, body] of [
    ["mvt tiles for a source that says mlt", "mlt", MVT_TILE],
    ["mlt tiles for a source that says nothing", undefined, MLT_TILE],
    ["mlt tiles for a source that says mvt", "mvt", MLT_TILE],
  ] as const) {
    test(`says the tiles are in another format for ${name}`, async ({
      page,
      mapPage,
    }) => {
      await scriptLayers(page, [vectorLayer("kind-mlt", encoding)]);
      await answerTiles(page, { body });
      await mapPage.goto(`#layers=kind-mlt&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      // Only the engine's own wording of an unreadable tile
      // (`TILE_UNREADABLE_MESSAGE`) reaches this status, so these specs pin it.
      await expect(page.getByTestId("layer-status-kind-mlt")).toHaveText(
        FORMAT_STATUS,
      );
      await expect(mapPage.politeAnnouncer).toContainText(
        `Sample tiles: ${FORMAT_STATUS}`,
      );
    });
  }

  test("clears the status when the server is fixed and a tile loads", async ({
    page,
    mapPage,
  }) => {
    await scriptLayers(page, [vectorLayer("kind-mlt", "mlt")]);
    const answer = { body: MVT_TILE };
    await answerTiles(page, answer);
    await mapPage.goto(`#layers=kind-mlt&${AT_CENTRE}`);
    await mapPage.openMapOptions();
    const status = page.getByTestId("layer-status-kind-mlt");
    await expect(status).toHaveText(FORMAT_STATUS);

    answer.body = MLT_TILE;
    // Zoom from the keyboard: a phone has no zoom buttons, and the open sheet
    // covers the map, so the map region is focused rather than clicked.
    await mapPage.focusMap();
    await page.keyboard.press("+");
    await expect(status).toHaveCount(0);
    await expect(mapPage.politeAnnouncer).toContainText(
      "Sample tiles: imagery is showing again.",
    );
  });

  test("keeps the layer in the saved image", async ({ page, mapPage }) => {
    await scriptLayers(page, [vectorLayer("kind-mlt", "mlt")]);
    const answer = { body: EMPTY };
    await answerTiles(page, answer);
    const save = async () => {
      await mapPage.goto(`#layers=kind-mlt&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      await expect
        .poll(() => mapPage.host.getAttribute("aria-busy"))
        .toBe("false");
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Save image" }).click();
      return readFile(await (await download).path());
    };
    const blank = await save();
    answer.body = MLT_TILE;
    const drawn = await save();
    expect(await differingPixels(page.context(), blank, drawn)).toBeGreaterThan(
      DRAWN_PIXELS,
    );
  });

  test("works unchanged as the encoding a basemap style gives its own source", async ({
    page,
    mapPage,
  }) => {
    const styleFor = (sourceEncoding: "mvt" | "mlt") => ({
      ...MINIMAL_VECTOR_STYLE,
      sources: {
        ...MINIMAL_VECTOR_STYLE.sources,
        areas: {
          type: "vector",
          tiles: ["https://tiles.openfreemap.org/mlt/{z}/{x}/{y}.pbf"],
          maxzoom: 14,
          encoding: sourceEncoding,
        },
      },
      layers: [
        ...MINIMAL_VECTOR_STYLE.layers,
        {
          id: "areas",
          type: "fill",
          source: "areas",
          "source-layer": "areas",
          paint: { "fill-color": "#d81b60", "fill-opacity": 1 },
        },
      ],
    });
    const answer = { body: EMPTY };
    await answerTiles(page, answer);
    let encoding: "mvt" | "mlt" = "mlt";
    await page.route(VECTOR_STYLE_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(styleFor(encoding)),
      }),
    );
    const shoot = async () => {
      await mapPage.goto(`#${AT_CENTRE}`);
      return mapPage.host.screenshot({ animations: "disabled" });
    };
    const blank = await shoot();
    answer.body = MLT_TILE;
    const drawn = await shoot();
    expect(await differingPixels(page.context(), blank, drawn)).toBeGreaterThan(
      DRAWN_PIXELS,
    );
    encoding = "mvt";
    answer.body = MVT_TILE;
    expect(
      await differingPixels(page.context(), drawn, await shoot()),
    ).toBeLessThan(SAME_PIXELS);
  });
});

/** The sizes the status must fit: phone, tablet and desktop. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.describe("a vector layer whose tiles are in another format @a11y", () => {
  test.use({ reducedMotion: "reduce" });
  test.setTimeout(90_000);

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(
        `its status line passes axe in ${colorScheme} at ${viewport.width}px @a11y`,
        viewportDetails(viewport),
        async ({ page, mapPage }) => {
          await scriptLayers(page, [vectorLayer("kind-mlt", "mlt")]);
          await answerTiles(page, { body: MVT_TILE });
          await page.setViewportSize(viewport);
          await page.emulateMedia({ colorScheme });
          await mapPage.goto(`#layers=kind-mlt&${AT_CENTRE}`);
          await mapPage.openMapOptions();
          const status = page.getByTestId("layer-status-kind-mlt");
          await expect(status).toHaveText(FORMAT_STATUS);
          await status.scrollIntoViewIfNeeded();
          await waitForStableLayout(page);

          expect(await axeViolations(page)).toEqual([]);
          expect((await inspectControls(page)).unnamed).toEqual([]);
        },
      );
    }
  }
});
