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
    const visibleCopy = await page
      .locator("body")
      .evaluate((body) => body.innerText);
    expect(visibleCopy).not.toMatch(/apartheid|gauteng|cape town|township/i);
  });
});
