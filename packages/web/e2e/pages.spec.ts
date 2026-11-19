// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";

test.describe("other pages", () => {
  test("an unknown address shows Page not found with a way back to the map", async ({
    page,
  }) => {
    const response = await page.goto("/this-route-does-not-exist");
    expect(response?.status()).toBe(404);

    const errorPage = page.getByTestId("error-page");
    await expect(errorPage).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await page.getByRole("link", { name: "Go to the map" }).click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page.getByTestId("map-host")).toBeVisible();
  });

  for (const path of [
    "/.env",
    "/.git/config",
    "/wp-admin",
    "/wp-login.php",
    "/debug",
    "/phpinfo.php",
  ]) {
    test(`a scanner probe for ${path} gets a 404 and no file`, async ({
      request,
    }) => {
      const response = await request.get(path);

      expect(response.status()).toBe(404);
      expect(await response.text()).not.toMatch(/DB_PASSWORD|\[core\]/);
    });
  }

  test("a POST to the home page gets a 405", async ({ request }) => {
    const response = await request.post("/");

    expect(response.status()).toBe(405);
  });

  for (const language of [null, "af"] as const) {
    test.describe(`privacy inline links in ${language ?? "English"}`, () => {
      test.use({ language, viewport: { width: 390, height: 844 } });

      test("keep line pitch, focus and standalone targets", async ({
        page,
      }) => {
        await page.goto("/privacy");
        const privacy = page.getByTestId("privacy-page");
        const plain = privacy.locator(":scope > p").nth(1);
        const inline = privacy.locator(
          'a[href="https://www.cloudflare.com/privacypolicy/"]',
        );
        const linked = inline.locator("..");
        const contact = privacy.locator('a[href^="mailto:"]').locator("..");

        const pitch = async (paragraph: typeof plain) =>
          paragraph.evaluate((element) => {
            const text = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
            );
            const tops: number[] = [];
            let node = text.nextNode();
            while (node) {
              const parent = node.parentElement;
              const position = parent
                ? getComputedStyle(parent).position
                : "static";
              if (position !== "absolute" && position !== "fixed") {
                const range = document.createRange();
                range.selectNodeContents(node);
                tops.push(
                  ...[...range.getClientRects()]
                    .filter((rect) => rect.width > 2 && rect.height > 2)
                    .map((rect) => rect.top),
                );
              }
              node = text.nextNode();
            }
            const lines = tops
              .sort((a, b) => a - b)
              .filter(
                (top, index, values) =>
                  index === 0 || top - (values[index - 1] ?? top) > 0.5,
              );
            const height = element.getBoundingClientRect().height;
            return height / lines.length;
          });

        await expect(linked).toBeVisible();
        const plainPitch = await pitch(plain);
        const linkedPitch = await pitch(linked);
        expect(linkedPitch).toBeLessThanOrEqual(plainPitch + 0.5);
        expect(await pitch(contact)).toBeLessThanOrEqual(plainPitch + 0.5);

        const standaloneHeights = await privacy
          .locator(":scope > a")
          .evaluateAll((links) =>
            links.map((link) => link.getBoundingClientRect().height),
          );
        expect(standaloneHeights).toHaveLength(2);
        expect(Math.min(...standaloneHeights)).toBeGreaterThanOrEqual(44);

        await inline.focus();
        const focusIsVisible = await inline.evaluate((link) => {
          const style = getComputedStyle(link);
          return (
            style.outlineStyle === "solid" &&
            Number.parseFloat(style.outlineWidth) > 0 &&
            style.boxShadow !== "none"
          );
        });
        expect(focusIsVisible).toBe(true);
      });
    });
  }

  test("the privacy page has one heading, plain landmarks and no map", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle(/privacy/i);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByTestId("privacy-page")).toContainText(/cookies/i);
    await expect(page.getByTestId("map-host")).toHaveCount(0);
  });

  test("the privacy page and its tab title are in English by default", async ({
    page,
  }) => {
    await page.goto("/privacy");
    await expect(page).toHaveTitle("Privacy policy | MapCairn");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privacy policy" }),
    ).toBeVisible();
    await expect(page.getByTestId("privacy-page")).toContainText(
      "The site sets no cookies.",
    );
  });
});

test.describe("the privacy page in Afrikaans", () => {
  test.use({ language: "af" });

  test("shows its text, links and tab title in Afrikaans", async ({ page }) => {
    await page.goto("/privacy");
    const privacy = page.getByTestId("privacy-page");
    await expect(
      page.getByRole("heading", { level: 1, name: "Privaatheidsbeleid" }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Privaatheidsbeleid | MapCairn");
    await expect(page.locator("html")).toHaveAttribute("lang", "af");
    await expect(privacy).toContainText("Die webwerf stel geen koekies nie.");
    await expect(privacy).not.toContainText("The site sets no cookies.");
    await expect(
      page.getByRole("link", { name: /Cloudflare se eie privaatheidsbeleid/ }),
    ).toHaveAttribute("href", "https://www.cloudflare.com/privacypolicy/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
  });

  test("the tab title of the map page is in Afrikaans too", async ({
    page,
  }) => {
    await page.goto("/map");
    await expect(page).toHaveTitle("MapCairn | Interaktiewe kaart");
  });

  test("leads from the Settings link to the page in Afrikaans, and back", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    await page
      .getByRole("link", { name: "Lees die privaatheidsbeleid" })
      .click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Privaatheidsbeleid" }),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Terug na die produkbladsy" }),
    ).toHaveAttribute("href", "/");
    await page.getByRole("link", { name: "Terug na die kaart" }).click();
    await expect(page).toHaveURL(/\/map$/);
    await expect(page).toHaveTitle("MapCairn | Interaktiewe kaart");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`passes axe in ${colorScheme} @a11y`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto("/privacy");
      await expect(
        page.getByRole("heading", { level: 1, name: "Privaatheidsbeleid" }),
      ).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
    });
  }
});
