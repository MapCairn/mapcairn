import { expect, test } from "./fixtures";
import {
  BASEMAP_COLUMNS,
  BASEMAP_COUNT,
  COLORFUL_BASEMAP_ID,
  COLORFUL_BASEMAP_NAME,
  DARK_VECTOR_BASEMAP_ID,
  DARK_VECTOR_BASEMAP_NAME,
  DEFAULT_VECTOR_BASEMAP_ID,
  DEFAULT_VECTOR_BASEMAP_NAME,
  LIBERTY_BASEMAP_ID,
  LIBERTY_BASEMAP_NAME,
  OTHER_VECTOR_BASEMAP_ID,
  OTHER_VECTOR_BASEMAP_NAME,
  RASTER_BASEMAP_CREDIT,
  RASTER_BASEMAP_ID,
  RASTER_BASEMAP_NAME,
} from "./support/basemaps";
import {
  COLORFUL_STYLE_PATTERN,
  MAPLIBRE_WORKER_PATTERN,
  MINIMAL_VECTOR_STYLE,
  OTHER_VECTOR_STYLE_PATTERN,
  RASTER_TILE_PATTERN,
  SPRITE_PATTERN,
  VECTOR_STYLE_PATTERN,
} from "./support/network";
import { seedStoredSettings } from "./support/services";
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
    test(`the picker lays its ${BASEMAP_COUNT} basemaps out in ${BASEMAP_COLUMNS} columns and ${BASEMAP_COUNT / BASEMAP_COLUMNS} rows at ${viewport.width} by ${viewport.height}`, async ({
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
      expect(new Set(boxes.map((box) => box.top)).size).toBe(
        BASEMAP_COUNT / BASEMAP_COLUMNS,
      );
      // Row by row, left to right: the order the arrow keys follow.
      expect(boxes.slice(0, BASEMAP_COLUMNS).map((box) => box.top)).toEqual(
        Array(BASEMAP_COLUMNS).fill(boxes[0]?.top),
      );
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
      name: LIBERTY_BASEMAP_NAME,
    });
    await expect(next).toBeChecked();
    await expect(next).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mapPage.dropPinButton).toBeFocused();
  });

  test("a Liberty saved before Bright became the default still opens on Liberty", async ({
    page,
    mapPage,
  }) => {
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
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: LIBERTY_BASEMAP_NAME }),
    ).toBeChecked();
  });

  test("Fiord, the dark basemap, is chosen from the picker, loads its style from OpenFreeMap, is saved, and leaves Save image on", async ({
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
      mapPage.basemapPicker.getByRole("radio", {
        name: DARK_VECTOR_BASEMAP_NAME,
      }),
    ).not.toBeChecked();
    await expect(
      page
        .getByTestId(`basemap-option-${DARK_VECTOR_BASEMAP_ID}`)
        .locator("img"),
    ).toHaveCount(1);
    await mapPage.chooseBasemap(DARK_VECTOR_BASEMAP_NAME);
    await expect.poll(() => mapPage.hashBasemap()).toBe(DARK_VECTOR_BASEMAP_ID);
    expect(styles).toContain(DARK_VECTOR_BASEMAP_ID);
    await expect(page.getByTestId("save-image-button")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByTestId("export-blocked")).toHaveCount(0);
    await expect(page.getByTestId("permanent-credit")).toHaveCount(0);

    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: DARK_VECTOR_BASEMAP_NAME,
      }),
    ).toBeChecked();
  });

  test("Colorful is chosen from the picker, loads its style from VersaTiles, is saved, and leaves Save image on", async ({
    page,
    mapPage,
  }) => {
    const styles: string[] = [];
    page.on("request", (request) => {
      if (COLORFUL_STYLE_PATTERN.test(request.url())) {
        styles.push(request.url());
      }
    });
    await mapPage.goto(START);
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: COLORFUL_BASEMAP_NAME,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByTestId(`basemap-option-${COLORFUL_BASEMAP_ID}`).locator("img"),
    ).toHaveCount(1);
    await mapPage.chooseBasemap(COLORFUL_BASEMAP_NAME);
    await expect.poll(() => mapPage.hashBasemap()).toBe(COLORFUL_BASEMAP_ID);
    expect(styles).toHaveLength(1);
    await expect(page.getByTestId("save-image-button")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByTestId("export-blocked")).toHaveCount(0);
    await expect(page.getByTestId("permanent-credit")).toHaveCount(0);

    await page.evaluate(() => {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    });
    await page.reload();
    await mapPage.waitForMap();
    await mapPage.openMapOptions();
    await expect(
      mapPage.basemapPicker.getByRole("radio", {
        name: COLORFUL_BASEMAP_NAME,
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

      await mapPage.goto(`#basemap=${DARK_VECTOR_BASEMAP_ID}`);
      await collapseCredits(mapPage);
      await mapPage.creditsButton.click();
      await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
        "© OpenStreetMap contributors",
        "OpenFreeMap",
        "OpenMapTiles",
        "MapLibre",
      ]);
      await mapPage.page.keyboard.press("Escape");

      await mapPage.goto(`#basemap=${COLORFUL_BASEMAP_ID}`);
      await collapseCredits(mapPage);
      await mapPage.creditsButton.click();
      await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
        "© OpenStreetMap contributors",
        "VersaTiles",
        "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
        "CC BY 4.0",
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

  test("a basemap that cannot load says so and offers Retry", async ({
    page,
  }) => {
    await page.route(RASTER_TILE_PATTERN, (route) =>
      route.fulfill({ status: 503, body: "" }),
    );
    await page.goto(`/#basemap=${RASTER_BASEMAP_ID}`);
    const banner = page.getByTestId("tile-error");
    await expect(banner).toContainText(
      "Some of the map could not load. Check your connection.",
      { timeout: 20_000 },
    );
    await expect(banner.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
