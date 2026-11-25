// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";
import { RAINFALL, SAVEABLE } from "./support/catalogueLayers";
import { mockLayerProviders } from "./support/layers";
import { scriptCatalogue } from "./support/services";
import { waitForStableLayout } from "./support/states";

const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test.describe("saving a layer's features", () => {
  test.use({ reducedMotion: "reduce" });

  test.beforeEach(async ({ page, mapPage }) => {
    await mockLayerProviders(page);
    await scriptCatalogue(page, [[RAINFALL, SAVEABLE]]);
    await mapPage.goto();
    await mapPage.openMapOptions();
  });

  test("offers saving only for a layer whose definition allows it", async ({
    mapPage,
  }) => {
    const section = mapPage.layersSection;
    await section.getByRole("switch", { name: "Rainfall" }).click();
    await expect(
      section.getByTestId("layer-list-catalogue-rain"),
    ).toBeVisible();
    await expect(section.getByRole("button", { name: /^Save as/ })).toHaveCount(
      0,
    );
    await section.getByRole("switch", { name: "Saveable" }).click();
    await expect(
      section.getByRole("group", { name: "Save the features of Saveable" }),
    ).toBeVisible();
    await expect(section.getByRole("button", { name: /^Save as/ })).toHaveCount(
      2,
    );
  });

  test("saves GeoJSON from the keyboard and announces it", async ({
    page,
    mapPage,
  }) => {
    const section = mapPage.layersSection;
    await section.getByRole("switch", { name: "Saveable" }).click();
    const button = section.getByRole("button", { name: "Save as GeoJSON" });
    await button.focus();
    const download = page.waitForEvent("download");
    await page.keyboard.press("Enter");
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^catalogue-save-\d{4}-\d{2}-\d{2}\.geojson$/,
    );
    const collection = JSON.parse(
      await readFile((await file.path()) as string, "utf8"),
    );
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.features.length).toBeGreaterThan(0);
    expect(collection.attribution).toEqual(["Credit: U.S. Geological Survey"]);
    expect(JSON.stringify(collection)).not.toMatch(/\de-\d/);
    await expect(
      section.getByTestId("layer-save-status-catalogue-save"),
    ).toContainText("as catalogue-save-");
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(
        expect.stringMatching(
          /^Saved \d+ features? of Saveable as catalogue-save-/,
        ),
      );
  });

  test("saves CSV with the credit on each row", async ({ page, mapPage }) => {
    const section = mapPage.layersSection;
    await section.getByRole("switch", { name: "Saveable" }).click();
    const download = page.waitForEvent("download");
    await section.getByRole("button", { name: "Save as CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const rows = (await readFile((await file.path()) as string, "utf8")).split(
      "\r\n",
    );
    expect(rows[0]).toMatch(
      /^feature_id,longitude,latitude,geometry,.*,credit,saved$/,
    );
    expect(rows[1]).toContain("Credit: U.S. Geological Survey");
  });
});

test.describe("the save buttons @a11y", () => {
  test.use({ reducedMotion: "reduce" });

  for (const size of SIZES) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`pass axe in ${colorScheme} at ${size.name} width @a11y`, async ({
        page,
        mapPage,
      }) => {
        await mockLayerProviders(page);
        await scriptCatalogue(page, [[SAVEABLE]]);
        await page.setViewportSize(size);
        await page.emulateMedia({ colorScheme });
        await mapPage.goto();
        await mapPage.openMapOptions();
        const section = mapPage.layersSection;
        await section.getByRole("switch", { name: "Saveable" }).click();
        const group = section.getByRole("group", {
          name: "Save the features of Saveable",
        });
        await expect(group).toBeVisible();
        await group.scrollIntoViewIfNeeded();
        await waitForStableLayout(page);

        expect(await axeViolations(page)).toEqual([]);
        const controls = await inspectControls(page);
        expect(controls.unnamed).toEqual([]);
        expect(controls.tooSmall).toEqual([]);
      });
    }
  }
});
