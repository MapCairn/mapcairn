import { BASEMAPS } from "@mapcairn/core";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import {
  BASEMAP_COLUMNS,
  BASEMAP_COUNT,
  BASEMAP_LAST_ROW_COUNT,
  BASEMAP_ROWS,
  DARK_BASEMAP_ID,
  DARK_BASEMAP_NAME,
  DEFAULT_VECTOR_BASEMAP_ID,
  DEFAULT_VECTOR_BASEMAP_NAME,
  LIBERTY_BASEMAP_ID,
  LIBERTY_BASEMAP_NAME,
  OTHER_VECTOR_BASEMAP_ID,
  OTHER_VECTOR_BASEMAP_NAME,
  RASTER_BASEMAP_CREDIT,
  RASTER_BASEMAP_ID,
  RASTER_BASEMAP_NAME,
  SATELLITE_BASEMAP_ID,
  SATELLITE_BASEMAP_NAME,
  TOPOGRAPHIC_BASEMAP_ID,
  TOPOGRAPHIC_BASEMAP_NAME,
  UNOFFERED_BASEMAP_IDS,
} from "./support/basemaps";
import {
  MAPLIBRE_WORKER_PATTERN,
  MINIMAL_VECTOR_STYLE,
  OTHER_VECTOR_STYLE_PATTERN,
  RASTER_TILE_PATTERN,
  SATELLITE_TILE_PATTERN,
  SPRITE_PATTERN,
  TRANSPARENT_PNG,
  VECTOR_STYLE_PATTERN,
} from "./support/network";
import { scriptBasemaps, seedStoredSettings } from "./support/services";
import { collapseCredits } from "./support/states";

const START = "#map=8.00/-33.90000/18.40000/30";

test.describe("basemaps", () => {
  test.use({ reducedMotion: "reduce" });

  test("the default vector basemap starts MapLibre and its worker", async ({
    page,
    mapPage,
  }) => {
    const workerStatuses: number[] = [];
    page.on("response", (response) => {
      if (MAPLIBRE_WORKER_PATTERN.test(response.url())) {
        workerStatuses.push(response.status());
      }
    });
    await mapPage.goto();

    await expect(mapPage.host).toHaveAttribute("data-map-host", "");
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
    expect(workerStatuses.length).toBeGreaterThan(0);
    expect(workerStatuses.every((status) => status === 200)).toBe(true);
    // MapLibre's own canvas semantics are removed: the host is the one "Map" region.
    await expect(
      page.getByRole("region", { name: "Map", exact: true }),
    ).toHaveCount(1);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the picker is a radio group that starts on the default basemap in a ${colorScheme} theme`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mapPage.goto();
      await mapPage.openMapOptions();

      const radios = mapPage.basemapPicker.getByRole("radio");
      await expect(radios).toHaveCount(BASEMAP_COUNT);
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: DEFAULT_VECTOR_BASEMAP_NAME,
        }),
      ).toBeChecked();
      await expect(
        mapPage.sheet.getByRole("switch", { name: /match the map/i }),
      ).toHaveCount(0);

      await mapPage.chooseBasemap(OTHER_VECTOR_BASEMAP_NAME);
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: OTHER_VECTOR_BASEMAP_NAME,
        }),
      ).toBeChecked();
      await expect
        .poll(() => mapPage.announcements())
        .toContain(`Basemap changed to ${OTHER_VECTOR_BASEMAP_NAME}`);
      await expect
        .poll(() => mapPage.hashBasemap())
        .toBe(OTHER_VECTOR_BASEMAP_ID);
    });
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 720 },
  ]) {
    test(`the picker lays its ${BASEMAP_COUNT} basemaps out in ${BASEMAP_COLUMNS} columns and ${BASEMAP_ROWS} rows, row by row, at ${viewport.width} by ${viewport.height}`, async ({
      page,
      mapPage,
    }) => {
      await page.setViewportSize(viewport);
      await mapPage.goto();
      await mapPage.openMapOptions();
      const tiles = mapPage.basemapPicker.locator("label");
      await expect(tiles).toHaveCount(BASEMAP_COUNT);
      await expect(tiles.last()).toBeVisible();
      const boxes = await tiles.evaluateAll((labels) =>
        labels.map((label) => {
          const { left, top } = label.getBoundingClientRect();
          return { left: Math.round(left), top: Math.round(top) };
        }),
      );
      expect(new Set(boxes.map((box) => box.left)).size).toBe(BASEMAP_COLUMNS);
      expect(new Set(boxes.map((box) => box.top)).size).toBe(BASEMAP_ROWS);
      // Row by row, left to right: the order the arrow keys follow.
      const firstRow = boxes.slice(0, BASEMAP_COLUMNS);
      expect(firstRow.map((box) => box.top)).toEqual(
        Array(BASEMAP_COLUMNS).fill(boxes[0]?.top),
      );
      // The last row fills the first columns, in the same places as the first.
      const lastRow = boxes.slice(BASEMAP_COLUMNS);
      expect(lastRow).toHaveLength(BASEMAP_LAST_ROW_COUNT);
      expect(lastRow.map((box) => box.left)).toEqual(
        firstRow.slice(0, BASEMAP_LAST_ROW_COUNT).map((box) => box.left),
      );
      expect(new Set(lastRow.map((box) => box.top)).size).toBe(1);
    });
  }

  test("arrow keys move through the basemaps in one tab stop", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.basemapPicker
      .getByRole("radio", { name: DEFAULT_VECTOR_BASEMAP_NAME })
      .focus();
    await page.keyboard.press("ArrowRight");
    const next = mapPage.basemapPicker.getByRole("radio", {
      name: OTHER_VECTOR_BASEMAP_NAME,
    });
    await expect(next).toBeChecked();
    await expect(next).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mapPage.dropPinButton).toBeFocused();
  });

  for (const unoffered of UNOFFERED_BASEMAP_IDS) {
    test(`a saved ${unoffered}, which the site does not offer, opens on the default basemap`, async ({
      page,
      mapPage,
    }) => {
      await seedStoredSettings(page, { basemapId: unoffered });
      const styles: string[] = [];
      page.on("request", (request) => {
        const match = /\/styles\/(\w+)$/.exec(request.url());
        if (match?.[1]) {
          styles.push(match[1]);
        }
      });
      await mapPage.goto();
      expect(styles).toEqual([DEFAULT_VECTOR_BASEMAP_ID]);
      await mapPage.openMapOptions();
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: DEFAULT_VECTOR_BASEMAP_NAME,
        }),
      ).toBeChecked();
    });
  }

  test("a host that offers the SDK's whole list still opens a saved Liberty on Liberty", async ({
    page,
    mapPage,
  }) => {
    await scriptBasemaps(page, BASEMAPS);
    await seedStoredSettings(page, { basemapId: LIBERTY_BASEMAP_ID });
    const styles: string[] = [];
    page.on("request", (request) => {
      const match = /\/styles\/(\w+)$/.exec(request.url());
      if (match?.[1]) {
        styles.push(match[1]);
      }
    });
    await mapPage.goto();
    expect(styles).toEqual([LIBERTY_BASEMAP_ID]);
    await mapPage.openMapOptions();
    await expect(mapPage.basemapPicker.getByRole("radio")).toHaveCount(
      BASEMAPS.length,
    );
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: LIBERTY_BASEMAP_NAME }),
    ).toBeChecked();
  });

  test("Dark is chosen from the picker, loads its own OpenFreeMap style, is saved, leaves Save image on, and a linked dark opens on it", async ({
    page,
    mapPage,
  }) => {
    const styles: string[] = [];
    page.on("request", (request) => {
      const match = /\/styles\/(\w+)$/.exec(request.url());
      if (match?.[1]) {
        styles.push(match[1]);
      }
    });
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: DARK_BASEMAP_NAME }),
    ).not.toBeChecked();
    await expect(
      page.getByTestId(`basemap-option-${DARK_BASEMAP_ID}`).locator("img"),
    ).toHaveCount(1);
    await mapPage.chooseBasemap(DARK_BASEMAP_NAME);
    await expect.poll(() => mapPage.hashBasemap()).toBe(DARK_BASEMAP_ID);
    expect(styles).toContain(DARK_BASEMAP_ID);
    await expect(page.getByTestId("save-image-button")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: DARK_BASEMAP_NAME }),
    ).toBeChecked();

    await mapPage.goto(`#basemap=${DARK_BASEMAP_ID}`);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: DARK_BASEMAP_NAME }),
    ).toBeChecked();
  });

  test("Topographic loads OpenTopoMap raster tiles, credits them in full and is saved", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    const tileRequest = page.waitForRequest(/tile\.opentopomap\.org/);
    await mapPage.chooseBasemap(TOPOGRAPHIC_BASEMAP_NAME);
    await tileRequest;
    await expect.poll(() => mapPage.hashBasemap()).toBe(TOPOGRAPHIC_BASEMAP_ID);
    await expect(page.getByTestId("save-image-button")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await collapseCredits(mapPage);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
      "© OpenStreetMap contributors",
      "SRTM",
      "© OpenTopoMap",
      "CC-BY-SA",
      "MapLibre",
    ]);

    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: TOPOGRAPHIC_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("Satellite loads EOX imagery under the default style's labels, credits them in full and is saved", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    const imagery = page.waitForRequest(SATELLITE_TILE_PATTERN);
    const labels = page.waitForRequest(
      new RegExp(
        `tiles\\.openfreemap\\.org/styles/${DEFAULT_VECTOR_BASEMAP_ID}$`,
      ),
    );
    await mapPage.chooseBasemap(SATELLITE_BASEMAP_NAME);
    // Row before column, in Web Mercator, no deeper than level 14.
    expect((await imagery).url()).toMatch(
      /\/s2cloudless-\d{4}_3857\/default\/g\/(?:[0-9]|1[0-4])\/\d+\/\d+\.jpg$/,
    );
    await labels;
    await expect.poll(() => mapPage.hashBasemap()).toBe(SATELLITE_BASEMAP_ID);
    await expect(page.getByTestId("save-image-button")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await collapseCredits(mapPage);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
      /^EOxCloudless https:\/\/cloudless\.eox\.at by EOX IT Services GmbH \(Contains modified Copernicus Sentinel data \d{4}\)$/,
      "CC BY-NC-SA 4.0",
      "© OpenStreetMap contributors",
      "OpenFreeMap",
      "OpenMapTiles",
      "MapLibre",
    ]);

    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: SATELLITE_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("switching between the raster and vector styles keeps the map, the view and the bearing", async ({
    page,
    mapPage,
  }) => {
    const styleRequests: string[] = [];
    page.on("request", (request) => {
      if (VECTOR_STYLE_PATTERN.test(request.url())) {
        styleRequests.push(request.url());
      }
    });
    await mapPage.goto(START);
    const canvas = page.locator("canvas.maplibregl-canvas");
    // Mark the canvas, so a remounted engine (a new canvas) would show.
    await canvas.evaluate((element) => {
      element.dataset.testOriginal = "yes";
    });
    await mapPage.openMapOptions();

    const tileRequest = page.waitForRequest(RASTER_TILE_PATTERN);
    await mapPage.chooseBasemap(RASTER_BASEMAP_NAME);
    await tileRequest;
    await mapPage.waitForMap();
    await expect(canvas).toHaveCount(1);
    await expect(canvas).toHaveAttribute("data-test-original", "yes");
    await expect(mapPage.host).toHaveAttribute("data-zoom", "8.00");
    await expect
      .poll(() => mapPage.announcements())
      .toContain(`Basemap changed to ${RASTER_BASEMAP_NAME}`);
    let view = await mapPage.hashView();
    expect(view?.lat).toBeCloseTo(-33.9, 3);
    expect(view?.lng).toBeCloseTo(18.4, 3);
    expect(view?.bearing).toBe(30);
    await expect(mapPage.compassButton).toBeVisible();
    // The sheet stays put while the basemap underneath changes.
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");

    await mapPage.chooseBasemap(OTHER_VECTOR_BASEMAP_NAME);
    await mapPage.waitForMap();
    await expect(canvas).toHaveAttribute("data-test-original", "yes");
    await expect(mapPage.host).toHaveAttribute("data-zoom", "8.00");
    view = await mapPage.hashView();
    expect(view?.lat).toBeCloseTo(-33.9, 3);
    expect(view?.lng).toBeCloseTo(18.4, 3);
    expect(view?.bearing).toBe(30);
    expect(
      styleRequests.some((url) =>
        url.endsWith(`/styles/${OTHER_VECTOR_BASEMAP_ID}`),
      ),
    ).toBe(true);
  });

  test("the raster basemap zooms to OpenStreetMap's deepest tile level and no further", async ({
    mapPage,
  }) => {
    await mapPage.goto(
      `#map=18.00/-33.90000/18.40000&basemap=${RASTER_BASEMAP_ID}`,
    );
    await mapPage.focusMap();
    await mapPage.page.keyboard.press("+");
    await expect(mapPage.host).toHaveAttribute("data-zoom", "19.00");
    await mapPage.page.keyboard.press("+");
    await mapPage.waitForMap();
    await expect(mapPage.host).toHaveAttribute("data-zoom", "19.00");
  });

  test.describe("credits", () => {
    test.use({ fastCredits: true });

    test("the credits follow the basemap and name MapLibre", async ({
      mapPage,
    }) => {
      await mapPage.goto(`#basemap=${RASTER_BASEMAP_ID}`);
      await collapseCredits(mapPage);
      await mapPage.creditsButton.click();
      await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
        RASTER_BASEMAP_CREDIT,
        "MapLibre",
      ]);
      await mapPage.page.keyboard.press("Escape");

      await mapPage.goto(`#basemap=${DEFAULT_VECTOR_BASEMAP_ID}`);
      await collapseCredits(mapPage);
      await mapPage.creditsButton.click();
      await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
        "© OpenStreetMap contributors",
        "OpenFreeMap",
        "OpenMapTiles",
        "MapLibre",
      ]);

      await mapPage.goto(`#basemap=${DARK_BASEMAP_ID}`);
      await collapseCredits(mapPage);
      await mapPage.creditsButton.click();
      await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
        "© OpenStreetMap contributors",
        "OpenFreeMap",
        "OpenMapTiles",
        "MapLibre",
      ]);
    });
  });

  test("the raster tiles load under the production content security policy", async ({
    page,
    mapPage,
  }) => {
    await page.addInitScript(() => {
      const violations: string[] = [];
      Object.assign(window, { __cspViolations: violations });
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
      });
    });
    const tile = page.waitForResponse(RASTER_TILE_PATTERN);
    const response = await page.goto(`/#basemap=${RASTER_BASEMAP_ID}`);
    // The preview must send the policy, or this test would prove nothing.
    const policy = (await response?.allHeaders())?.["content-security-policy"];
    expect(policy).toContain("tile.openstreetmap.org");
    await mapPage.waitForMap();
    await tile;
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __cspViolations: string[] }).__cspViolations,
      ),
    ).toEqual([]);
  });

  test("without WebGL a plain message replaces the map", async ({
    page,
    mapPage,
  }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (/webgl/i.test(type)) {
          return null;
        }
        return (getContext as (...args: unknown[]) => unknown).call(
          this,
          type,
          ...rest,
        );
      } as typeof getContext;
    });
    await page.goto("/");

    const message = page.getByTestId("webgl-unavailable");
    await expect(message).toContainText(
      "MapCairn needs WebGL to draw the map.",
    );
    await expect(message).toContainText("Try a different browser");
    await expect(message).toContainText("hardware acceleration");
    await expect(mapPage.region).toContainText(
      "MapCairn needs WebGL to draw the map.",
    );
    await expect(mapPage.host).toHaveAttribute("data-state", "error");
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(
        expect.stringContaining("MapCairn needs WebGL to draw the map."),
      );
    await expect(page.getByTestId("engine-error")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reload" })).toHaveCount(0);
    // The rest of the app still works: the map options open.
    await mapPage.openMapOptions();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
  });

  test("a sprite that cannot load does not stop the map starting", async ({
    page,
    mapPage,
  }) => {
    const spriteRequests: string[] = [];
    await page.route(SPRITE_PATTERN, (route) => {
      spriteRequests.push(route.request().url());
      return route.fulfill({ status: 404, body: "" });
    });
    await page.route(VECTOR_STYLE_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...MINIMAL_VECTOR_STYLE,
          sprite: "https://tiles.openfreemap.org/sprites/missing",
        }),
      }),
    );
    await mapPage.goto();
    expect(spriteRequests.length).toBeGreaterThan(0);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
    await expect(mapPage.host).not.toHaveAttribute("data-state", "error");
    await expect(page.getByTestId("engine-error")).toHaveCount(0);
  });

  test.describe("a basemap whose provider is down", () => {
    /** The origin of the Streets tiles, which these tests take down. */
    const STREETS_HOST = /tile\.openstreetmap\.org/;
    /** The style of the default basemap, which the map goes back to. */
    const DEFAULT_STYLE_PATTERN = new RegExp(
      `tiles\\.openfreemap\\.org/styles/${DEFAULT_VECTOR_BASEMAP_ID}$`,
    );
    const streetsRadio = (mapPage: MapPage) =>
      mapPage.basemapPicker.getByRole("radio", { name: /^Streets/ });

    test("goes back to the previous basemap, says so, and marks the tile until Try again", async ({
      page,
      mapPage,
    }) => {
      await page.route(STREETS_HOST, (route) => route.abort("failed"));
      await mapPage.goto(START);
      const canvas = page.locator("canvas.maplibregl-canvas");
      await canvas.evaluate((element) => {
        element.dataset.testOriginal = "yes";
      });
      await mapPage.openMapOptions();
      const redrawn = page.waitForRequest(DEFAULT_STYLE_PATTERN);
      await mapPage.chooseBasemap(RASTER_BASEMAP_NAME);
      await mapPage.sheetClose.click();

      const banner = page.getByTestId("basemap-error");
      await expect(banner).toContainText(
        "Streets is not available right now.",
        { timeout: 20_000 },
      );
      await expect(
        banner.getByRole("button", { name: "Use previous basemap" }),
      ).toBeVisible();
      await redrawn;
      await expect(mapPage.host).not.toHaveAttribute("data-state", "error");
      // The same engine draws the previous basemap.
      await expect(canvas).toHaveAttribute("data-test-original", "yes");
      await mapPage.waitForMap();
      await expect(page.getByTestId("tile-error")).toHaveCount(0);
      // A basemap that turned out to be down is not kept as the choice.
      await expect
        .poll(() => mapPage.hashBasemap())
        .toBe(DEFAULT_VECTOR_BASEMAP_ID);

      await mapPage.openMapOptions();
      await expect(streetsRadio(mapPage)).toBeDisabled();
      await expect(
        page.getByTestId(`basemap-unavailable-note-${RASTER_BASEMAP_ID}`),
      ).toHaveText("Not available right now");

      await banner
        .getByRole("button", { name: "Use previous basemap" })
        .click();
      await expect(banner).toHaveCount(0);
      const bright = mapPage.basemapPicker.getByRole("radio", {
        name: DEFAULT_VECTOR_BASEMAP_NAME,
      });
      await expect(bright).toBeChecked();

      await page.getByRole("button", { name: "Try again" }).click();
      await expect(streetsRadio(mapPage)).toBeEnabled();
      await expect(
        page.getByTestId(`basemap-unavailable-note-${RASTER_BASEMAP_ID}`),
      ).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(
        0,
      );
      await expect(bright).toBeFocused();
    });

    test("is found for Satellite when its imagery fails, though its labels load", async ({
      page,
      mapPage,
    }) => {
      await page.route(SATELLITE_TILE_PATTERN, (route) =>
        route.abort("failed"),
      );
      await mapPage.goto(START);
      await mapPage.openMapOptions();
      const redrawn = page.waitForRequest(DEFAULT_STYLE_PATTERN);
      await mapPage.chooseBasemap(SATELLITE_BASEMAP_NAME);
      await mapPage.sheetClose.click();

      const banner = page.getByTestId("basemap-error");
      await expect(banner).toContainText(
        "Satellite is not available right now.",
        { timeout: 20_000 },
      );
      await redrawn;
      await expect
        .poll(() => mapPage.hashBasemap())
        .toBe(DEFAULT_VECTOR_BASEMAP_ID);
      await mapPage.openMapOptions();
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: new RegExp(`^${SATELLITE_BASEMAP_NAME}`),
        }),
      ).toBeDisabled();
    });

    test("is found at start-up, when a link opens on it", async ({
      page,
      mapPage,
    }) => {
      await page.route(STREETS_HOST, (route) => route.abort("failed"));
      // Starting on Streets, the map asks for the default's style only when
      // it falls back to it.
      const fellBack = page.waitForRequest(DEFAULT_STYLE_PATTERN);
      await mapPage.goto(`#basemap=${RASTER_BASEMAP_ID}`);

      const banner = page.getByTestId("basemap-error");
      await expect(banner).toContainText(
        "Streets is not available right now.",
        { timeout: 20_000 },
      );
      await fellBack;
      await expect(page.getByTestId("tile-error")).toHaveCount(0);
      await mapPage.waitForMap();
      await expect(mapPage.host).not.toHaveAttribute("data-state", "error");

      await banner
        .getByRole("button", { name: "Use previous basemap" })
        .click();
      await expect(banner).toHaveCount(0);
      await expect
        .poll(() => mapPage.hashBasemap())
        .toBe(DEFAULT_VECTOR_BASEMAP_ID);
      await mapPage.openMapOptions();
      await expect(
        mapPage.basemapPicker.getByRole("radio", {
          name: DEFAULT_VECTOR_BASEMAP_NAME,
        }),
      ).toBeChecked();
      await expect(streetsRadio(mapPage)).toBeDisabled();
    });

    test("is not reported when only some of its tiles fail", async ({
      page,
      mapPage,
    }) => {
      let requests = 0;
      await page.route(STREETS_HOST, (route) => {
        requests += 1;
        return requests === 2
          ? route.abort("failed")
          : route.fulfill({
              status: 200,
              contentType: "image/png",
              body: TRANSPARENT_PNG,
            });
      });
      await mapPage.goto(START);
      await mapPage.openMapOptions();
      await mapPage.chooseBasemap(RASTER_BASEMAP_NAME);
      await mapPage.sheetClose.click();
      await expect.poll(() => mapPage.hashBasemap()).toBe(RASTER_BASEMAP_ID);
      await mapPage.waitForMap();
      expect(requests).toBeGreaterThan(2);
      await expect(page.getByTestId("basemap-error")).toHaveCount(0);
      await mapPage.openMapOptions();
      await expect(streetsRadio(mapPage)).toBeEnabled();
    });
  });

  test("a basemap whose style cannot load keeps the previous one, and is not saved", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await page.route(OTHER_VECTOR_STYLE_PATTERN, (route) =>
      route.fulfill({ status: 404, body: "" }),
    );
    const canvas = page.locator("canvas.maplibregl-canvas");
    await canvas.evaluate((element) => {
      element.dataset.testOriginal = "yes";
    });
    await mapPage.openMapOptions();
    await mapPage.chooseBasemap(OTHER_VECTOR_BASEMAP_NAME);
    // The banners ride above a sheet at peek or half and hide at full; close
    // it so the banner is on screen in every layout.
    await mapPage.sheetClose.click();

    const banner = page.getByTestId("basemap-error");
    await expect(banner).toContainText("That basemap could not be loaded.", {
      timeout: 20_000,
    });
    await expect(banner.getByRole("button", { name: "Reload" })).toHaveCount(0);
    await expect(page.getByTestId("engine-error")).toHaveCount(0);
    await expect(mapPage.host).not.toHaveAttribute("data-state", "error");
    // The same engine goes on drawing the previous basemap.
    await expect(canvas).toHaveAttribute("data-test-original", "yes");
    await mapPage.waitForMap();
    expect(await mapPage.hashBasemap()).not.toBe(OTHER_VECTOR_BASEMAP_ID);

    await banner.getByRole("button", { name: "Use previous basemap" }).click();
    await expect(banner).toHaveCount(0);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: DEFAULT_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();

    // A reload starts from the basemap that worked, not the one that failed.
    await page.reload();
    await mapPage.waitForMap();
    await expect(page.getByTestId("engine-error")).toHaveCount(0);
    await expect(page.getByTestId("basemap-error")).toHaveCount(0);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: DEFAULT_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("a basemap some of whose tiles cannot load says so and offers Retry", async ({
    page,
  }) => {
    // One tile loads, so the provider is up and the rest are ordinary tile
    // errors. When every tile fails the basemap is reported as unavailable
    // instead (see "a basemap whose provider is down").
    let requests = 0;
    await page.route(RASTER_TILE_PATTERN, (route) => {
      requests += 1;
      return requests === 1
        ? route.fulfill({
            status: 200,
            contentType: "image/png",
            body: TRANSPARENT_PNG,
          })
        : route.fulfill({ status: 503, body: "" });
    });
    await page.goto(`/#basemap=${RASTER_BASEMAP_ID}`);
    const banner = page.getByTestId("tile-error");
    await expect(banner).toContainText(
      "Some of the map could not load. Check your connection.",
      { timeout: 20_000 },
    );
    await expect(banner.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByTestId("basemap-error")).toHaveCount(0);
  });
});
