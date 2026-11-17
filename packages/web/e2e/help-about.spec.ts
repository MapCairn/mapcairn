// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { SOURCE_REPOSITORY_URL } from "../src/constants/siteConfig";
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import { waitForStableLayout } from "./support/states";

/** Phone, tablet and desktop, the sizes the Help panel must fit. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.describe("the About block in Help", () => {
  test.use({ reducedMotion: "reduce" });

  test("names the licence and links to the source code, in a new tab", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();

    const about = mapPage.page.getByTestId("help-about");
    await about.scrollIntoViewIfNeeded();
    await expect(
      about.getByRole("heading", { name: "About", level: 4 }),
    ).toBeVisible();
    await expect(about).toContainText("open source software");
    await expect(about).toContainText("AGPL-3.0");

    const link = about.getByRole("link", {
      name: "View the source code and licence on GitHub (opens in a new tab)",
    });
    await expect(link).toHaveAttribute("href", SOURCE_REPOSITORY_URL);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("is reachable by keyboard and shows a focus ring", async ({
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();
    const link = mapPage.page
      .getByTestId("help-about")
      .getByRole("link", { name: /source code and licence/ });
    await link.focus();
    // Arriving by keyboard, so the browser treats the focus as visible.
    await mapPage.page.keyboard.press("Shift+Tab");
    await mapPage.page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    const ring = await link.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" || style.boxShadow !== "none";
    });
    expect(ring).toBe(true);
  });

  test("is not in the Map options sheet", async ({ mapPage }) => {
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.page.getByTestId("help-about")).toHaveCount(0);
  });

  test("makes no request to GitHub", async ({ page, mapPage }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      const { hostname } = new URL(request.url());
      if (hostname === "github.com" || hostname.endsWith(".github.com")) {
        requests.push(request.url());
      }
    });
    await mapPage.goto();
    await mapPage.openSettings();
    await mapPage.page.getByTestId("help-about").scrollIntoViewIfNeeded();
    expect(requests).toEqual([]);
  });

  test.describe("in Afrikaans", () => {
    test.use({ language: "af" });

    test("is in Afrikaans, with the licence and address unchanged", async ({
      mapPage,
    }) => {
      await mapPage.goto();
      await mapPage.openSettings();
      const about = mapPage.page.getByTestId("help-about");
      await about.scrollIntoViewIfNeeded();
      await expect(
        about.getByRole("heading", { name: "Oor", level: 4 }),
      ).toBeVisible();
      await expect(about).toContainText("oopbronsagteware");
      await expect(about).toContainText("AGPL-3.0");
      await expect(
        about.getByRole("link", { name: /Kyk na die bronkode en lisensie/ }),
      ).toHaveAttribute("href", SOURCE_REPOSITORY_URL);
    });
  });
});

test.describe("the About block in Help @a11y", () => {
  test.use({ reducedMotion: "reduce" });

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`passes axe in ${colorScheme} at ${viewport.width}px @a11y`, async ({
        page,
        mapPage,
      }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await mapPage.goto();
        await mapPage.openSettings();
        await page.getByTestId("help-about").scrollIntoViewIfNeeded();
        await waitForStableLayout(page);

        expect(await axeViolations(page)).toEqual([]);
        const controls = await inspectControls(page);
        expect(controls.unnamed).toEqual([]);
        expect(controls.tooSmall).toEqual([]);
      });
    }
  }
});
