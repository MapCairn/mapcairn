import { expect, test } from "./fixtures";
import {
  BASEMAP_COUNT,
  DEFAULT_VECTOR_BASEMAP_ID,
  RASTER_BASEMAP_CREDIT,
  RASTER_BASEMAP_ID,
  RASTER_BASEMAP_NAME,
} from "./support/basemaps";
import {
  MAPLIBRE_WORKER_PATTERN,
  RASTER_TILE_PATTERN,
  VECTOR_STYLE_PATTERN,
} from "./support/network";

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

  test("the picker is a radio group that follows the theme until a basemap is chosen", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openMapOptions();

    const radios = mapPage.basemapPicker.getByRole("radio");
    await expect(radios).toHaveCount(BASEMAP_COUNT);
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: "Positron" }),
    ).toBeChecked();
    await expect(mapPage.themeMatchSwitch).toBeChecked();

    await mapPage.chooseBasemap("Liberty");
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: "Liberty" }),
    ).toBeChecked();
    await expect(mapPage.themeMatchSwitch).not.toBeChecked();
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Basemap changed to Liberty");
    await expect.poll(() => mapPage.hashBasemap()).toBe("liberty");
  });

  test("arrow keys move through the basemaps in one tab stop", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openMapOptions();
    await mapPage.basemapPicker
      .getByRole("radio", { name: "Positron" })
      .focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: "Liberty" }),
    ).toBeChecked();
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: "Liberty" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mapPage.themeMatchSwitch).toBeFocused();
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

    await mapPage.chooseBasemap("Dark");
    await mapPage.waitForMap();
    await expect(canvas).toHaveAttribute("data-test-original", "yes");
    await expect(mapPage.host).toHaveAttribute("data-zoom", "8.00");
    view = await mapPage.hashView();
    expect(view?.lat).toBeCloseTo(-33.9, 3);
    expect(view?.lng).toBeCloseTo(18.4, 3);
    expect(view?.bearing).toBe(30);
    expect(styleRequests.some((url) => url.endsWith("/styles/dark"))).toBe(
      true,
    );
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

  test("the credits follow the basemap and name MapLibre", async ({
    mapPage,
  }) => {
    await mapPage.goto(`#basemap=${RASTER_BASEMAP_ID}`);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
      RASTER_BASEMAP_CREDIT,
      "MapLibre",
    ]);
    await mapPage.page.keyboard.press("Escape");

    await mapPage.goto(`#basemap=${DEFAULT_VECTOR_BASEMAP_ID}`);
    await mapPage.creditsButton.click();
    await expect(mapPage.creditsRegion.getByRole("link")).toHaveText([
      "© OpenStreetMap contributors",
      "OpenFreeMap",
      "OpenMapTiles",
      "MapLibre",
    ]);
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
    await expect(message).toContainText("Karta needs WebGL to draw the map.");
    await expect(message).toContainText("Try a different browser");
    await expect(message).toContainText("hardware acceleration");
    await expect(mapPage.region).toContainText(
      "Karta needs WebGL to draw the map.",
    );
    await expect(mapPage.host).toHaveAttribute("data-state", "error");
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(
        expect.stringContaining("Karta needs WebGL to draw the map."),
      );
    await expect(page.getByTestId("engine-error")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reload" })).toHaveCount(0);
    // The rest of the app still works: the map options open.
    await mapPage.openMapOptions();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
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
