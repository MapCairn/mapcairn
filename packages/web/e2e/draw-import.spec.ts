import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileChooser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { axeViolations, inspectControls } from "./support/a11y";

/*
 * Importing shapes from a file, through the browser's own file picker and
 * the real `BrowserFileOpener`: Playwright answers the picker with a file
 * from `e2e/files`. The accessibility test carries @a11y, so `npm run a11y`
 * runs it and `npm run e2e` does not.
 */

const FILES = resolve(dirname(fileURLToPath(import.meta.url)), "files");

/** Cape Town, far from the shapes in the files, so a fit to them shows. */
const FAR_AWAY = "#map=10.00/-33.92000/18.42000";

/** The words the GeoJSON fixture's import ends with. */
const GEOJSON_RESULT =
  "4 shapes imported. 1 skipped: 1 with edges that cross. Holes in 1 polygon were left out.";

/** Presses the Import button and answers the picker with `files`. */
async function importFrom(
  page: Page,
  files: Parameters<FileChooser["setFiles"]>[0],
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import GeoJSON or CSV" }).click();
  await (await chooser).setFiles(files);
}

test.describe("draw import", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  test("imports a GeoJSON file from Map options, fits the map to it and undoes in one step", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, resolve(FILES, "shapes.geojson"));

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      GEOJSON_RESULT,
    );
    await expect(mapPage.politeAnnouncer).toContainText("4 shapes imported.");
    await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveText([
      /^Point 1/,
      /^Line 1/,
      /^Polygon 1/,
      /^Circle 1/,
    ]);
    await expect(mapPage.drawShapes).toHaveCount(4);
    // The map has moved from Cape Town to the shapes in Paris.
    await expect.poll(() => page.url()).toMatch(/#map=[\d.]+\/48\.8/);
    // Nothing went anywhere: the picker is closed and its input is gone.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    await page.keyboard.press("Escape");
    await mapPage.startDrawing();
    await mapPage.drawUndo.click();
    await expect(mapPage.drawShapes).toHaveCount(0);
  });

  test("imports a CSV from the draw tool's Shapes and export, circles included", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.startDrawing();
    await mapPage.drawShapesButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, resolve(FILES, "shapes.csv"));

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "2 shapes imported.",
    );
    await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveText([
      /^Point 1/,
      /^Circle 1/,
    ]);
  });

  test("refuses a file that is not shapes, in words, and adds nothing", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.mapOptionsButton.click();
    await importFrom(page, {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Bring a torch."),
    });
    await expect(page.getByTestId("shapes-import-feedback")).toContainText(
      "This is not GeoJSON or a CSV of shapes from this map.",
    );
    await expect(mapPage.assertiveAnnouncer).toContainText(
      "This is not GeoJSON",
    );
    await expect(mapPage.drawShapes).toHaveCount(0);
  });
});

test.describe("draw import accessibility", () => {
  test.use({ reducedMotion: "reduce", fastCredits: true });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the Shapes section with an import result passes axe in ${colorScheme} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mapPage.goto();
      await mapPage.mapOptionsButton.click();
      await importFrom(page, resolve(FILES, "shapes.geojson"));
      await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
        GEOJSON_RESULT,
      );
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
      expect(controls.positiveTabindex).toEqual([]);
    });
  }
});
