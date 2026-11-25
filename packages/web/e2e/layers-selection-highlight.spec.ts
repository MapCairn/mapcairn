// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { axeViolations } from "./support/a11y";
import { mockLayerProviders } from "./support/layers";
import { addToSelection, scriptSelection } from "./support/services";
import { collapseCredits, waitForStableLayout } from "./support/states";

const FRANCE = { layerId: "world-countries", featureId: "FRA" };
const QUAKE = { layerId: "earthquakes", featureId: "tx2026wbxhyh" };
const FRANCE_VIEW = "#layers=world-countries&map=5.00/46.50000/2.50000";
const QUAKE_VIEW = "#layers=earthquakes&map=6.00/31.65000/-104.41500";

/**
 * The selected set is drawn on the map. The seam supplies the store the site
 * builds none of, and the polygons and points come from the real definitions
 * and recorded responses.
 */
test.describe("selected features on the map", () => {
  test.use({ reducedMotion: "reduce" });

  test("a selected polygon has a dashed outline and a check badge", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await scriptSelection(page, { refs: [FRANCE] });
    await mapPage.goto(FRANCE_VIEW);

    const mark = page.getByTestId("selection-highlight");
    await expect(mark).toHaveAttribute("data-kind", "outline");
    await expect(mark.locator("[data-part='badge']")).toHaveCount(1);
    await expect(mark.locator("[data-part='outline']").first()).toHaveCSS(
      "stroke-dasharray",
      /\d/,
    );
  });

  test("a selected point has a ring and a check badge", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await scriptSelection(page, { refs: [QUAKE] });
    await mapPage.goto(QUAKE_VIEW);

    const mark = page.getByTestId("selection-highlight");
    await expect(mark).toHaveAttribute("data-kind", "point");
    await expect(mark.locator("[data-part='ring']")).toHaveCount(1);
    await expect(mark.locator("[data-part='badge']")).toHaveCount(1);
  });

  test("follows the set as it changes, and marks nothing while the layer is off", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await scriptSelection(page);
    await mapPage.goto(FRANCE_VIEW);
    await expect(page.getByTestId("layer-status-world-countries")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("selection-highlight")).toHaveCount(0);

    await addToSelection(page, [FRANCE]);
    await expect(page.getByTestId("selection-highlight")).toHaveCount(1);

    await page.evaluate(() => {
      window.__mapcairnSelection?.store.clear();
    });
    await expect(page.getByTestId("selection-highlight")).toHaveCount(0);
  });

  test("marks nothing when the layer of a selected feature is off", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await scriptSelection(page, { refs: [FRANCE] });
    await mapPage.goto("#map=5.00/46.50000/2.50000");
    await expect(page.getByTestId("selection-highlight")).toHaveCount(0);
  });
});

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

test.describe("selected features on the map @a11y", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });
  test.setTimeout(90_000);

  for (const viewport of VIEWPORTS) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`the highlights pass axe in ${colorScheme} at ${viewport.width}px @a11y`, async ({
        page,
        mapPage,
      }) => {
        await mockLayerProviders(page);
        await scriptSelection(page, { refs: [FRANCE, QUAKE] });
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme });
        await mapPage.goto(
          "#layers=world-countries,earthquakes&map=2.00/35.00000/-50.00000",
        );
        await collapseCredits(mapPage);
        await expect(page.getByTestId("selection-highlight")).not.toHaveCount(
          0,
        );
        await waitForStableLayout(page);

        expect(await axeViolations(page)).toEqual([]);
      });
    }
  }
});
