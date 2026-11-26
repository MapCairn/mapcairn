// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

/** The words the GPX fixture's import ends with: its last segment has one position. */
const GPX_RESULT = "4 shapes imported. 1 skipped: 1 with too few points.";

/** The words the KML fixture's import ends with: its track is not read and its polygon's hole is left out. */
const KML_RESULT =
  "5 shapes imported. 1 skipped: 1 of a type that cannot be drawn. Holes in 1 polygon were left out.";

/** A WKT file in Sydney that writes latitude first, so read longitude first its position is outside the world. */
const LATITUDE_FIRST_FILE = {
  name: "sydney.wkt",
  mimeType: "text/plain",
  buffer: Buffer.from("POINT (-33.8688 151.2093)"),
};

/** The zoom, latitude and longitude in an address's `#map=` part. */
function hashView(url: string): { zoom: number; lat: number; lng: number } {
  const match = /#map=(-?[\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)/.exec(url);
  if (!match) {
    return { zoom: Number.NaN, lat: Number.NaN, lng: Number.NaN };
  }
  return {
    zoom: Number(match[1]),
    lat: Number(match[2]),
    lng: Number(match[3]),
  };
}

/** How far a longitude in -180 to 180 is from the antimeridian, in degrees. */
function distanceFromAntimeridian(lng: number): number {
  return 180 - Math.abs(lng);
}

/** Presses the Import button and answers the picker with `files`. */
async function importFrom(
  page: Page,
  files: Parameters<FileChooser["setFiles"]>[0],
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import GeoJSON, GPX, KML, CSV or WKT" })
    .click();
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

  test("imports a GPX file as points and lines, shows no name or description and fits the map to it", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, resolve(FILES, "walk.gpx"));

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      GPX_RESULT,
    );
    await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveText([
      /^Point 1/,
      /^Line 1/,
      /^Line 2/,
      /^Line 3/,
    ]);
    await expect(mapPage.drawShapes).toHaveCount(4);
    await expect
      .poll(() => page.url())
      .toMatch(/#map=[\d.]+\/48\.[5-9][\d.]*\/2\./);
    await expect(page.getByText("Start")).toHaveCount(0);
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect(page.getByText("alert(1)")).toHaveCount(0);
  });

  test("refuses damaged GPX whole, in words, and adds nothing", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.mapOptionsButton.click();
    await importFrom(page, {
      name: "broken.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from('<gpx><wpt lat="1" lon="2">'),
    });
    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "The GPX could not be read, so none of the file was imported.",
    );
    await expect(mapPage.drawShapes).toHaveCount(0);
  });

  test("imports a KML file as points, lines and a polygon, shows no name or description and fits the map to it", async ({
    page,
    mapPage,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, resolve(FILES, "walk.kml"));

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      KML_RESULT,
    );
    await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveText([
      /^Point 1/,
      /^Line 1/,
      /^Polygon 1/,
      /^Point 2/,
      /^Line 2/,
    ]);
    await expect(mapPage.drawShapes).toHaveCount(5);
    await expect
      .poll(() => page.url())
      .toMatch(/#map=[\d.]+\/48\.[5-9][\d.]*\/2\./);
    await expect(page.getByText("Start")).toHaveCount(0);
    await expect(page.locator("img[src='x']")).toHaveCount(0);
    await expect(page.getByText("alert(1)")).toHaveCount(0);
    // A link inside the file is never followed.
    expect(requests.filter((url) => url.includes("never.kml"))).toEqual([]);
  });

  test("refuses damaged KML whole, and a zipped KMZ in words, and adds nothing", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.mapOptionsButton.click();
    await importFrom(page, {
      name: "broken.kml",
      mimeType: "application/vnd.google-earth.kml+xml",
      buffer: Buffer.from("<kml><Placemark><Point><coordinates>1,2"),
    });
    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "The KML could not be read, so none of the file was imported.",
    );
    await importFrom(page, {
      name: "tour.kmz",
      mimeType: "application/vnd.google-earth.kmz",
      buffer: Buffer.from("PK\u0003\u0004doc.kml"),
    });
    await expect(page.getByTestId("shapes-import-feedback")).toContainText(
      "A KMZ file is not read: unzip it and choose the .kml inside.",
    );
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

  test("imports a WKT file, one geometry to a line, and says what it skipped", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, {
      name: "places.wkt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        [
          "POINT (2.3522 48.8566)",
          "LINESTRING (2.35 48.85, 2.36 48.86)",
          "POLYGON ((2.30 48.80, 2.31 48.80, 2.31 48.81, 2.30 48.81, 2.30 48.80))",
          "LINESTRING (2.4 48.9)",
        ].join("\n"),
      ),
    });

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "3 shapes imported. 1 skipped: 1 with too few points.",
    );
    await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveText([
      /^Point 1/,
      /^Line 1/,
      /^Polygon 1/,
    ]);
    await expect(mapPage.drawShapes).toHaveCount(3);
    // The sheet takes part of the screen, so the centre sits a little off the shapes.
    await expect.poll(() => page.url()).toMatch(/#map=[\d.]+\/48\./);
  });

  test("fits the map to shapes across the antimeridian by the short way, in the real engine", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    // Suva and Taveuni: 2.7 degrees of longitude apart, across the line.
    await importFrom(page, {
      name: "fiji.wkt",
      mimeType: "text/plain",
      buffer: Buffer.from("POINT (178.44 -18.14)\nPOINT (-179.9 -16.8)"),
    });

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "2 shapes imported.",
    );
    // The long way round would frame the world (zoom 2 or less, centred near
    // longitude 0); the short way is a close view centred near 180.
    await expect
      .poll(() => distanceFromAntimeridian(hashView(page.url()).lng))
      .toBeLessThan(3);
    const view = hashView(page.url());
    expect(view.zoom).toBeGreaterThan(5);
    expect(view.lat).toBeGreaterThan(-19);
    expect(view.lat).toBeLessThan(-16);
  });

  test("imports the rest of a WKT file around a geometry and a line it cannot use", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, {
      name: "mixed.wkt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        [
          "POINT (2.3522 48.8566) POINT M (1 2 3) POINT (2.36 48.86)",
          "LINESTRING (2.35 48.85, 2.36",
          "LINESTRING (2.30 48.80, 2.31 48.81)",
        ].join("\n"),
      ),
    });

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      /^3 shapes imported\. 2 skipped: /,
    );
    await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveText([
      /^Point 1/,
      /^Point 2/,
      /^Line 1/,
    ]);
  });

  test("reads a latitude-first WKT file once Latitude, longitude is chosen", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await page
      .getByRole("combobox", { name: "WKT coordinate order" })
      .selectOption({ label: "Latitude, longitude" });
    await importFrom(page, LATITUDE_FIRST_FILE);

    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "1 shape imported.",
    );
    await expect(mapPage.drawShapes).toHaveCount(1);
    await expect.poll(() => page.url()).toMatch(/#map=[\d.]+\/-33\.[0-8]/);
  });

  test("offers to read a file the other way when its first position fits only that order", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(FAR_AWAY);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.shapesSection).toBeVisible();
    await importFrom(page, LATITUDE_FIRST_FILE);

    await expect(page.getByTestId("shapes-import-feedback")).toContainText(
      "outside the world as longitude, latitude, but it fits as latitude, longitude.",
    );
    await expect(mapPage.assertiveAnnouncer).toContainText(
      "No shapes imported.",
    );
    await expect(mapPage.drawShapes).toHaveCount(0);

    const reread = page.getByRole("button", {
      name: "Read as latitude, longitude",
    });
    await reread.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
      "1 shape imported.",
    );
    await expect(mapPage.politeAnnouncer).toContainText("1 shape imported.");
    await expect(mapPage.drawShapes).toHaveCount(1);
    const order = page.getByRole("combobox", { name: "WKT coordinate order" });
    await expect(order).toHaveValue("lat-lng");
    // The pressed button is gone, and focus moved to the control it set.
    await expect(reread).toHaveCount(0);
    await expect(order).toBeFocused();
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
      "This is not GeoJSON, GPX, KML, WKT or a CSV of shapes from this map.",
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
    test(`the Shapes section with a GPX import result passes axe in ${colorScheme} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mapPage.goto();
      await mapPage.mapOptionsButton.click();
      await importFrom(page, resolve(FILES, "walk.gpx"));
      await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
        GPX_RESULT,
      );
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
      expect(controls.positiveTabindex).toEqual([]);
    });
    test(`the Shapes section with a KML import result passes axe in ${colorScheme} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mapPage.goto();
      await mapPage.mapOptionsButton.click();
      await importFrom(page, resolve(FILES, "walk.kml"));
      await expect(page.getByTestId("shapes-import-feedback")).toHaveText(
        KML_RESULT,
      );
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
      expect(controls.positiveTabindex).toEqual([]);
    });
    test(`the Shapes section with the axis order offer passes axe in ${colorScheme} @a11y`, async ({
      page,
      mapPage,
    }) => {
      await page.emulateMedia({ colorScheme });
      await mapPage.goto();
      await mapPage.mapOptionsButton.click();
      await importFrom(page, LATITUDE_FIRST_FILE);
      await expect(
        page.getByRole("button", { name: "Read as latitude, longitude" }),
      ).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      const controls = await inspectControls(page);
      expect(controls.unnamed).toEqual([]);
      expect(controls.tooSmall).toEqual([]);
      expect(controls.positiveTabindex).toEqual([]);
    });
  }
});
