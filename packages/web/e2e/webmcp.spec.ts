import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { RASTER_BASEMAP_ID } from "./support/basemaps";
import { SAMPLE_RESULTS, scriptSearch } from "./support/services";

declare global {
  interface Window {
    /** Tools the page registered with the stubbed `document.modelContext`. */
    __kartaTools?: Map<
      string,
      { description: string; execute: (input: unknown) => Promise<unknown> }
    >;
  }
}

/**
 * Gives the page a WebMCP `document.modelContext` that records registrations,
 * as a browser with WebMCP would provide, so the tools can be listed and
 * called like an in-browser agent would.
 */
async function stubModelContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools = new Map();
    window.__kartaTools = tools;
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(
          tool: { name: string },
          options?: { signal?: AbortSignal },
        ) {
          tools.set(tool.name, tool);
          options?.signal?.addEventListener("abort", () => {
            if (tools.get(tool.name) === tool) {
              tools.delete(tool.name);
            }
          });
          return Promise.resolve();
        },
      },
    });
  });
}

/** Calls a registered tool and returns the text of its result. */
function callTool(page: Page, name: string, input: unknown): Promise<string> {
  return page.evaluate(
    async ({ tool, args }) => {
      const registered = window.__kartaTools?.get(tool);
      if (!registered) {
        throw new Error(`No tool named ${tool}.`);
      }
      const result = (await registered.execute(args)) as {
        content: { text: string }[];
      };
      return result.content.map((part) => part.text).join("\n");
    },
    { tool: name, args: input },
  );
}

test.describe("WebMCP tools", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await stubModelContext(page);
    await scriptSearch(page, {
      byQuery: {
        "cape town": SAMPLE_RESULTS.slice(0, 1),
        "cape coast": SAMPLE_RESULTS.slice(1, 2),
        "cape cod": SAMPLE_RESULTS.slice(2, 3),
      },
      noMatch: ["atlantis"],
    });
  });

  test("registers the map tools where WebMCP exists", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await expect
      .poll(() =>
        page.evaluate(() => [...(window.__kartaTools?.keys() ?? [])].sort()),
      )
      .toEqual([
        "measure-area",
        "measure-distance",
        "search-map-location",
        "set-app-theme",
        "set-map-basemap",
      ]);
  });

  test("search-map-location moves the map, or says nothing was found", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    expect(
      await callTool(page, "search-map-location", { query: "Cape Town" }),
    ).toBe("Moved the map to Cape Town.");
    await expect
      .poll(async () => (await mapPage.hashView())?.lat ?? 0)
      .toBeCloseTo(-33.9249, 2);
    expect(
      await callTool(page, "search-map-location", { query: "Atlantis" }),
    ).toBe('No place found for "Atlantis".');
  });

  test("set-map-basemap and set-app-theme change the map and the theme", async ({
    page,
    mapPage,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await mapPage.goto();
    expect(
      await callTool(page, "set-map-basemap", { basemap: RASTER_BASEMAP_ID }),
    ).toBe(`Switched the basemap to ${RASTER_BASEMAP_ID}.`);
    await expect.poll(() => mapPage.hashBasemap()).toBe(RASTER_BASEMAP_ID);
    expect(await callTool(page, "set-map-basemap", { basemap: "mars" })).toBe(
      'Unknown basemap "mars".',
    );

    expect(await callTool(page, "set-app-theme", { theme: "dark" })).toBe(
      "Switched the theme to dark.",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("measure-distance and measure-area show the measurement", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    const distance = await callTool(page, "measure-distance", {
      locations: ["Cape Town", "Cape Coast"],
    });
    expect(distance).toMatch(
      /^Distance along Cape Town → Cape Coast: [\d,.]+ km$/,
    );
    await expect(mapPage.measureToolbar).toBeVisible();
    await expect(mapPage.measureOverlay).toHaveAttribute(
      "data-mode",
      "distance",
    );

    const area = await callTool(page, "measure-area", {
      locations: ["Cape Town", "Cape Coast", "Cape Cod"],
    });
    expect(area).toMatch(/^Area enclosed by Cape Town, Cape Coast, Cape Cod: /);
    await expect(mapPage.measureOverlay).toHaveAttribute("data-mode", "area");

    expect(
      await callTool(page, "measure-distance", { locations: ["Cape Town"] }),
    ).toBe("Give at least two places to measure a distance.");
  });
});
