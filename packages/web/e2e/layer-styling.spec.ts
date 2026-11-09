import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";

/**
 * Polygon layers shaded in classes. The sample is the host's country layer,
 * answered from a committed fixture of six countries, so the polygons and the
 * key come from the real definition, decoder and engine.
 */
test.describe("polygon styling", () => {
  test.use({ reducedMotion: "reduce" });

  test("a graduated layer has a key whose classes differ by more than colour", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=world-countries");
    await mapPage.openMapOptions();
    await expect(
      page.getByTestId("layer-status-world-countries"),
    ).toContainText("6 shown");
    const key = page.getByTestId("layer-legend-world-countries");
    const entries = key.getByRole("listitem");
    await expect(entries).toHaveCount(5);
    await expect(entries.first()).toContainText("Under 1 million");
    await expect(entries.last()).toContainText("200 million and above");
    // The outline gets thicker with each class: a signal beside colour.
    const widths = await key
      .locator("[data-part='outline']")
      .evaluateAll((outlines) =>
        outlines.map((outline) => Number(outline.getAttribute("stroke-width"))),
      );
    expect(widths).toHaveLength(5);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(5);
  });

  test("a polygon opens the same card from the list and from the map", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    // France sits at the centre of this view.
    await mapPage.goto("#layers=world-countries&map=5.00/46.50000/2.50000");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-world-countries");
    await list.locator("summary").click();
    await list
      .getByTestId("layer-list-row")
      .filter({ hasText: "France" })
      .click();
    const card = page.getByTestId("feature-card");
    await expect(page.getByTestId("feature-card-heading")).toHaveText("France");
    await expect(card).toContainText("Population about");
    await expect(card).toContainText("Europe");
    // The class is named in words beside its swatch.
    await expect(card).toContainText("50 to 200 million");
    await expect(page.getByTestId("selection-marker")).toBeVisible();
    await page.getByTestId("feature-card-close").click();
    await expect(card).toHaveCount(0);
  });

  test("a tap on a polygon selects it", async ({ page, mapPage }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=world-countries&map=5.00/46.50000/2.50000");
    await mapPage.host.click();
    await expect(page.getByTestId("feature-card-heading")).toHaveText("France");
  });

  test("Show on map fits the whole polygon in view", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=world-countries&map=2.00/0.00000/0.00000");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-world-countries");
    await list.locator("summary").click();
    await list
      .getByTestId("layer-list-row")
      .filter({ hasText: "Australia" })
      .click();
    await page.getByTestId("feature-card-show").click();
    await expect
      .poll(async () => (await mapPage.hashView())?.zoom ?? 0)
      .toBeGreaterThan(2);
    const view = await mapPage.hashView();
    expect(view?.lng ?? 0).toBeGreaterThan(110);
    expect(view?.lat ?? 0).toBeLessThan(-15);
  });

  test("passes axe with a styled layer on and its card open @a11y", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=world-countries");
    await mapPage.openMapOptions();
    const list = page.getByTestId("layer-list-world-countries");
    await list.locator("summary").click();
    await list.getByTestId("layer-list-row").first().click();
    expect(await axeViolations(page)).toEqual([]);
  });
});
