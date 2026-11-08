import { expect, test } from "./fixtures";
import { E2E } from "./selectors";
import { ensurePanelOpen } from "./ui";

test.describe("app shell", () => {
  test("loads with the expected landmarks and a rendered map", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }
      consoleErrors.push(message.text());
    });

    await page.goto("/");

    await expect(page).toHaveTitle(/karta/i);
    await expect(
      page.getByRole("link", { name: /skip to map information/i }),
    ).toHaveAttribute("href", "#map-information");
    await expect(page.getByRole("main")).toHaveAttribute(
      "id",
      "map-information",
    );
    await expect(page.getByTestId(E2E.locationSearchInput)).toBeVisible();

    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".leaflet-control-scale")).toBeVisible();
    await expect(page.getByTestId(E2E.layerToggle.townships)).toBeHidden();
    await expect(page.getByTestId(E2E.mapView)).toBeVisible();
    expect(
      consoleErrors.filter((message) =>
        /react error #418|hydration|did not match/i.test(message),
      ),
    ).toEqual([]);
  });

  test("keeps the coordinate readout clear of Settings without announcing pointer updates", async ({
    page,
  }) => {
    await page.goto("/");

    const readout = page.getByTestId("map-coordinate-readout");
    const settings = page.getByTestId(E2E.settingsMenuTrigger);
    await expect(readout).toBeVisible();
    await expect(readout).toHaveAttribute("aria-hidden", "true");

    const readoutBox = await readout.boundingBox();
    const settingsBox = await settings.boundingBox();
    expect(readoutBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();

    if (!readoutBox || !settingsBox) {
      throw new Error("Expected both coordinate and Settings bounds");
    }

    const overlapsHorizontally =
      readoutBox.x < settingsBox.x + settingsBox.width &&
      readoutBox.x + readoutBox.width > settingsBox.x;
    const overlapsVertically =
      readoutBox.y < settingsBox.y + settingsBox.height &&
      readoutBox.y + readoutBox.height > settingsBox.y;

    expect(overlapsHorizontally && overlapsVertically).toBe(false);
  });

  test("the skip link is the first stop on Tab and moves focus into the map region", async ({
    page,
  }) => {
    await page.goto("/");

    const skipLink = page.getByRole("link", {
      name: /skip to map information/i,
    });
    const main = page.getByRole("main");

    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(main).toBeFocused();
  });

  test("shows layer controls in the panel and keeps legend toggle available", async ({
    page,
  }) => {
    await page.goto("/");

    await ensurePanelOpen(page);

    const townships = page.getByTestId(E2E.layerToggle.townships);
    await expect(townships).not.toBeChecked();
    await townships.check();

    await page.getByTestId(E2E.panelToggle).click();
    const legendChip = page.getByTestId(E2E.legendChip);
    await expect(legendChip).toBeVisible();
    await legendChip.click();
    await expect(
      page.getByRole("list", { name: /active map layers legend/i }),
    ).toBeVisible();
  });

  test("keeps application chrome domain-neutral before a layer is selected", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Karta | Interactive map",
    );
    await expect(page.getByTestId(E2E.locationSearchInput)).toHaveAttribute(
      "placeholder",
      "Search places",
    );
    const visibleCopy = await page.locator("body").evaluate((body) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const visibleText: string[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (node.parentElement?.getClientRects().length) {
          visibleText.push(node.textContent ?? "");
        }
      }
      return visibleText.join("");
    });
    expect(visibleCopy).not.toMatch(/apartheid|gauteng|cape town|township/i);
  });
});
