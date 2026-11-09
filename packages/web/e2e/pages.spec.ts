import { expect, test } from "./fixtures";

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
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("map-host")).toBeVisible();
  });

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
});
