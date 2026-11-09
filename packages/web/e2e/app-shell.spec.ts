import { expect, test } from "./fixtures";
import { RASTER_BASEMAP_NAME } from "./support/basemaps";
import { LAYER_PROVIDER_ORIGINS } from "./support/layers";

test.describe("app shell", () => {
  test("loads the map with its landmarks and no hydration errors", async ({
    page,
    mapPage,
    consoleMessages,
  }) => {
    await mapPage.goto();

    await expect(page).toHaveTitle(/karta/i);
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(mapPage.heading).toHaveText("Karta");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(mapPage.searchLandmark).toBeVisible();
    await expect(mapPage.region).toBeVisible();
    await expect(mapPage.region).toHaveAttribute("aria-roledescription", "map");
    await expect(mapPage.mapControls).toBeVisible();
    await expect(mapPage.creditsButton).toBeVisible();
    expect(
      consoleMessages.filter((message) =>
        /react error #4(18|19|21|23|25)|hydrat|did not match/i.test(message),
      ),
    ).toEqual([]);
  });

  test("the skip link is the first tab stop and moves focus to the map region", async ({
    page,
    mapPage,
    browserName,
  }) => {
    await mapPage.goto();

    if (browserName === "webkit") {
      // WebKit leaves links out of the Tab order unless the user turns on
      // "Press Tab to highlight each item", and Playwright's WebKit has no
      // Option+Tab, so prove the order from the document instead: nothing
      // focusable comes before the link.
      const firstFocusable = await page.evaluate(() => {
        const candidates = document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        return [...candidates].find((element) => !element.closest("[inert]"))
          ?.textContent;
      });
      expect(firstFocusable).toBe("Skip to map");
      await mapPage.skipLink.focus();
    } else {
      await page.keyboard.press("Tab");
    }
    await expect(mapPage.skipLink).toBeFocused();
    await expect(mapPage.skipLink).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(mapPage.region).toBeFocused();
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Map");
  });

  test("the map region describes its keyboard controls", async ({
    mapPage,
  }) => {
    await mapPage.goto();

    await expect(mapPage.region).toHaveAccessibleDescription(
      /Arrow keys: pan the map\..*P: drop a pin at the centre of the map\..*Escape: close the open panel\./,
    );
  });

  test("lists the data layers off, and requests no layer data until one is on", async ({
    page,
    mapPage,
  }) => {
    const dataRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        url.pathname.startsWith("/data/") ||
        LAYER_PROVIDER_ORIGINS.includes(url.origin)
      ) {
        dataRequests.push(request.url());
      }
    });

    await mapPage.goto();
    await mapPage.openMapOptions();

    const layers = page.getByTestId("sheet-section-layers");
    await expect(layers).toBeAttached();
    for (const toggle of await layers.getByRole("switch").all()) {
      await expect(toggle).not.toBeChecked();
    }
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(
      mapPage.basemapPicker.getByRole("radio", { name: RASTER_BASEMAP_NAME }),
    ).toBeAttached();
    expect(dataRequests).toEqual([]);
  });

  test("keeps the chrome copy domain-neutral", async ({ page, mapPage }) => {
    await mapPage.goto();

    await expect(mapPage.searchInput).toHaveAttribute(
      "placeholder",
      "Search places",
    );
    const visibleCopy = await page.locator("body").evaluate((body) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const visible: string[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.parentElement?.getClientRects().length) {
          visible.push(node.textContent ?? "");
        }
      }
      return visible.join(" ");
    });
    expect(visibleCopy).not.toMatch(/apartheid|gauteng|cape town|township/i);
  });
});
