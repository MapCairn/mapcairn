import { expect, test } from "./fixtures";

const WORKER_ASSET_PATTERN = /\/assets\/maplibre-gl-worker-[\w-]+\.js/;
const LOADING_TIMEOUT_MS = 20_000;

test.describe("vector basemap", () => {
  test("starts the MapLibre worker and finishes loading the default basemap", async ({
    page,
  }) => {
    const workerStatuses: number[] = [];
    page.on("response", (response) => {
      if (WORKER_ASSET_PATTERN.test(response.url())) {
        workerStatuses.push(response.status());
      }
    });

    await page.goto("/");

    await expect(
      page.locator("output", { hasText: "Loading map" }),
    ).toHaveAttribute("aria-hidden", "true", { timeout: LOADING_TIMEOUT_MS });
    expect(workerStatuses.length).toBeGreaterThan(0);
    expect(workerStatuses.every((status) => status === 200)).toBe(true);
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(1);
  });

  test("falls back to the raster basemap when the MapLibre worker cannot be loaded", async ({
    page,
  }) => {
    await page.route(WORKER_ASSET_PATTERN, (route) =>
      route.fulfill({ status: 404, body: "not found" }),
    );

    await page.goto("/");

    await expect(
      page.locator("output", { hasText: "Loading map" }),
    ).toHaveAttribute("aria-hidden", "true", { timeout: LOADING_TIMEOUT_MS });
    await expect(page.locator("canvas.maplibregl-canvas")).toHaveCount(0);
    await expect(page.locator(".leaflet-tile-pane img").first()).toBeAttached();
  });
});
