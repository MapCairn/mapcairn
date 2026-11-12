import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import {
  AREAS,
  HEAT,
  mockKindData,
  POINTS,
  QUERY,
  VECTOR,
} from "./support/kindLayers";
import { scriptLayers } from "./support/services";
import { settleFrames, TIMER_SLACK_MS, VIEW_SETTLE_MS } from "./support/timers";

/*
 * The layer kinds beyond points and rasters: heatmaps, vector tiles, queries
 * for the view, and a tap that finds several features. Each layer is data,
 * defined in `support/kindLayers.ts`, and answered by the test.
 */

const AT_CENTRE = "map=7.00/30.00000/31.00000";

test.describe("layer kinds", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await scriptLayers(page, [AREAS, POINTS, HEAT, QUERY, VECTOR]);
  });

  test.describe("heatmap", () => {
    test("names its density steps in words and tunes without asking for data again", async ({
      page,
      mapPage,
    }) => {
      const requests = await mockKindData(page);
      await mapPage.goto(`#layers=kind-heat&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-status-kind-heat")).toContainText(
        "4 shown",
      );
      const key = page.getByTestId("layer-legend-kind-heat");
      await expect(key.getByRole("listitem")).toHaveText([
        "Sparse",
        "Moderate",
        "Dense",
      ]);
      expect(
        requests.urls.filter((url) => url.includes("heat.json")),
      ).toHaveLength(1);
      const radius = page
        .getByTestId("layer-control-kind-heat-radius")
        .getByRole("slider");
      await radius.focus();
      await page.keyboard.press("ArrowRight");
      await expect(
        page.getByTestId("layer-control-kind-heat-radius"),
      ).toContainText("22 px");
      await expect(page).toHaveURL(/kind-heat\.radius=22/);
      expect(
        requests.urls.filter((url) => url.includes("heat.json")),
      ).toHaveLength(1);
    });
  });

  test.describe("vector tiles", () => {
    test("asks for tiles only inside the layer's zoom window", async ({
      page,
      mapPage,
    }) => {
      const requests = await mockKindData(page);
      const tileRequests = () =>
        requests.urls.filter((url) => /\/kinds\/\d+\/\d+\/\d+\.pbf/.test(url));
      await mapPage.goto("#layers=kind-vector&map=3.00/30.00000/31.00000");
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-legend-kind-vector")).toContainText(
        "Park",
      );
      // Nothing should be asked for, so there is no event to wait for; give a
      // tile request time to be made if one were going to.
      await page.waitForTimeout(1500);
      expect(tileRequests()).toEqual([]);
      await mapPage.goto("#layers=kind-vector&map=7.00/30.00000/31.00000");
      await expect.poll(() => tileRequests().length).toBeGreaterThan(0);
      await expect(page.getByTestId("layer-list-kind-vector")).toHaveCount(0);
    });
  });

  test.describe("query", () => {
    test("says to zoom in when too far out, and asks for nothing", async ({
      page,
      mapPage,
    }) => {
      const requests = await mockKindData(page);
      await mapPage.goto("#layers=kind-query&map=3.00/30.00000/31.00000");
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-status-kind-query")).toContainText(
        "Zoom in to load this layer.",
      );
      // Nothing should be asked for, so there is no event to wait for; give a
      // query time to be made if one were going to.
      await page.waitForTimeout(1000);
      expect(requests.urls.filter((url) => url.includes("/query"))).toEqual([]);
    });

    test("asks only for the view, says when it shows the first of more, and asks again only after a real move", async ({
      page,
      mapPage,
    }) => {
      const requests = await mockKindData(page);
      const queries = () =>
        requests.urls.filter((url) => url.includes("/query"));
      await page.clock.install();
      await mapPage.goto(`#layers=kind-query&${"map=8.00/30.00000/31.00000"}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-status-kind-query")).toContainText(
        "Showing the first 3. Zoom in to see more.",
      );
      expect(queries()).toHaveLength(1);
      const first = new URL(queries()[0] as string).searchParams;
      expect(first.get("limit")).toBe("4");
      const [west, south, east, north] = (first.get("bbox") as string)
        .split(",")
        .map(Number) as [number, number, number, number];
      expect(west).toBeLessThan(31);
      expect(east).toBeGreaterThan(31);
      expect(south).toBeLessThan(30);
      expect(north).toBeGreaterThan(30);

      // A small pan stays inside the window: nothing more is asked for.
      await mapPage.region.focus();
      const before = await mapPage.hashView();
      await page.keyboard.press("ArrowRight");
      // The address follows the map once it has stopped; then run the clock
      // past the wait for the map to settle, after which a query would go.
      await expect
        .poll(async () => (await mapPage.hashView())?.lng)
        .not.toBe(before?.lng);
      await page.clock.runFor(VIEW_SETTLE_MS + TIMER_SLACK_MS);
      await settleFrames(page);
      // Requests are recorded by the route handler, outside the page, and
      // nothing should be asked for, so there is no event to wait for; give a
      // query time to reach the handler if one were made.
      await page.waitForTimeout(500);
      expect(queries()).toHaveLength(1);

      // A long pan leaves it: one more request, after the map settles, for a
      // window further east that holds the new view.
      for (let press = 0; press < 12; press += 1) {
        await page.keyboard.press("ArrowRight");
      }
      await expect.poll(() => queries().length).toBe(2);
      const [nextWest, , nextEast] = (
        new URL(queries()[1] as string).searchParams.get("bbox") as string
      )
        .split(",")
        .map(Number) as [number, number, number, number];
      expect(nextWest).toBeGreaterThan(west);
      const centre = async () => (await mapPage.hashView())?.lng ?? Number.NaN;
      await expect.poll(centre).toBeGreaterThan(nextWest);
      await expect.poll(centre).toBeLessThan(nextEast);
    });
  });

  test.describe("several features under one tap", () => {
    async function openAtCentre(page: import("@playwright/test").Page) {
      await mockKindData(page);
    }

    test("a tap opens a list, each row opens its card, and back returns to the list", async ({
      page,
      mapPage,
    }) => {
      await openAtCentre(page);
      await mapPage.goto(`#layers=kind-areas,kind-points&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-status-kind-points")).toContainText(
        "1 shown",
      );
      await mapPage.sheetClose.click();
      await mapPage.host.click();
      const list = page.getByTestId("feature-choices");
      await expect(page.getByTestId("feature-choices-heading")).toHaveText(
        "3 features here",
      );
      await expect(page.getByTestId("feature-choices-heading")).toBeFocused();
      const rows = list.getByTestId("feature-choices-row");
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText("Middle point");
      await rows.filter({ hasText: "Small area" }).click();
      await expect(page.getByTestId("feature-card-heading")).toHaveText(
        "Small area",
      );
      await expect(page.getByTestId("feature-card-heading")).toBeFocused();
      await page.getByTestId("feature-card-back").click();
      await expect(page.getByTestId("feature-choices-heading")).toBeFocused();
      await page.getByTestId("feature-choices-close").click();
      await expect(list).toHaveCount(0);
    });

    test("the keyboard reaches the same list with I, and says when nothing is there", async ({
      page,
      mapPage,
    }) => {
      await openAtCentre(page);
      await mapPage.goto(`#layers=kind-areas,kind-points&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-status-kind-points")).toContainText(
        "1 shown",
      );
      await mapPage.sheetClose.click();
      await mapPage.region.focus();
      await page.keyboard.press("i");
      await expect(page.getByTestId("feature-choices-heading")).toHaveText(
        "3 features here",
      );
      await expect(mapPage.politeAnnouncer).toContainText("3 features here");

      // Away from every feature, nothing is found and it says so.
      await page.getByTestId("feature-choices-close").click();
      await mapPage.sheetClose.click();
      await mapPage.goto(
        `#layers=kind-areas,kind-points&map=7.00/10.00000/10.00000`,
      );
      await mapPage.region.focus();
      await page.keyboard.press("i");
      await expect(mapPage.politeAnnouncer).toContainText(
        "No features at the centre of the map.",
      );
    });
  });

  test.describe("save image", () => {
    test("saves the map as a PNG from a button, asking for nothing and keeping the drawing buffer off", async ({
      page,
      mapPage,
    }) => {
      await mockKindData(page);
      await mapPage.goto(`#layers=kind-areas&${AT_CENTRE}`);
      await mapPage.openMapOptions();
      await expect(page.getByTestId("layer-status-kind-areas")).toContainText(
        "2 shown",
      );
      // Capturing never costs the map its performance: the engine keeps the
      // default drawing buffer, which the browser can discard.
      const keepsBuffer = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const context =
          canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
        return context?.getContextAttributes()?.preserveDrawingBuffer;
      });
      expect(keepsBuffer).toBe(false);

      const button = page.getByRole("button", { name: "Save image" });
      await button.focus();
      const requested: string[] = [];
      page.on("request", (request) => requested.push(request.url()));
      const download = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^map-\d{4}-\d{2}-\d{2}\.png$/);
      const path = await file.path();
      const bytes = await readFile(path);
      expect([...bytes.subarray(0, 8)]).toEqual([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      expect(bytes.length).toBeGreaterThan(1000);
      await expect(mapPage.politeAnnouncer).toContainText("Map image saved.");
      expect(
        requested.filter(
          (url) => !url.startsWith("blob:") && !url.startsWith("data:"),
        ),
      ).toEqual([]);
    });
  });

  test("passes axe with a list, a heatmap key and the save image button open @a11y", async ({
    page,
    mapPage,
  }) => {
    await mockKindData(page);
    await mapPage.goto(`#layers=kind-areas,kind-points,kind-heat&${AT_CENTRE}`);
    await mapPage.openMapOptions();
    await expect(page.getByTestId("layer-status-kind-heat")).toContainText(
      "4 shown",
    );
    await mapPage.sheetClose.click();
    await mapPage.host.click();
    await expect(page.getByTestId("feature-choices")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });
});
