// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFile } from "node:fs/promises";
import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { copiedText, scriptClipboard } from "./support/services";

/** Paris, at a zoom where a few hundred pixels is a few hundred metres. */
const START = "#map=15.00/48.85660/2.35220";

/** Where a handle is on the page, from its centre. */
async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("The handle has no box.");
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * How far from the right edge the drag of a handle to the right may reach
 * before it runs under the end stack, which runs down that edge to about the
 * middle of a phone: the stack's width and inset, and the 60 px a handle
 * keeps from it, with room for the farthest drag the tests make.
 */
const END_STACK_ROOM = 300;

/**
 * The x of the middle of a triangle, clear of the chrome: at least 150 px in,
 * so its left vertex (90 px to the left) is 60 px from the edge, and on a
 * phone left of centre so that dragging the right vertex stays out from under
 * the end stack.
 */
const triangleCentreX = (width: number): number =>
  Math.min(width / 2, Math.max(150, width - END_STACK_ROOM));

/**
 * The x of a circle's centre: 60 px in at least, and on a phone left of
 * centre, because its radius handle sits to the right and is dragged farther.
 */
const circleCentreX = (width: number): number =>
  Math.min(width / 2, Math.max(60, width - END_STACK_ROOM));

/** Three taps that make a triangle near the middle of the map, clear of the chrome. */
async function triangleTaps(
  mapPage: MapPage,
): Promise<(readonly [number, number])[]> {
  const { width, height } = await mapPage.mapSize();
  const cx = triangleCentreX(width);
  const cy = height * 0.4;
  return [
    [cx - 90, cy + 60],
    [cx + 90, cy + 60],
    [cx, cy - 70],
  ];
}

async function drawTriangle(mapPage: MapPage): Promise<void> {
  await mapPage.startDrawing();
  await mapPage.tapMap(...(await triangleTaps(mapPage)));
  await expect(mapPage.drawStatus).toHaveText("Polygon 1, 3 points");
  await mapPage.drawPrimary.click();
  await expect(mapPage.drawStatus).toHaveText("Polygon 1");
}

/** The `points` of the shape's polygon, which change when a vertex moves. */
async function outline(mapPage: MapPage): Promise<string> {
  return (
    (await mapPage.drawShapes
      .first()
      .locator("polygon")
      .last()
      .getAttribute("points")) ?? ""
  );
}

test.describe("draw", () => {
  test.use({ reducedMotion: "reduce" });

  test("opens a toolbar with focus on the shape type, and is one tool at a time", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await expect(mapPage.drawToolbar).toHaveCount(0);
    await expect(mapPage.drawButton).toHaveAttribute("aria-pressed", "false");

    await mapPage.startDrawing();
    await expect(mapPage.drawButton).toHaveAttribute("aria-pressed", "true");
    await expect(mapPage.drawToolbar.locator(":focus")).toHaveCount(1);
    await expect(mapPage.drawStatus).toHaveText("Nothing drawn yet");

    await mapPage.startMeasuring();
    await expect(mapPage.drawToolbar).toHaveCount(0);
    await expect(mapPage.drawButton).toHaveAttribute("aria-pressed", "false");

    await mapPage.startDrawing();
    await expect(mapPage.measureToolbar).toHaveCount(0);
    await expect(mapPage.measureButton).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("draws a polygon by tapping the map and shows its area and perimeter", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    const taps = await triangleTaps(mapPage);
    await mapPage.tapMap(taps[0] as [number, number]);
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 1 point");
    await mapPage.tapMap(
      taps[1] as [number, number],
      taps[2] as [number, number],
    );
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 3 points");
    await expect(mapPage.drawMeasure).toContainText(/(ha|m²).*·.*(m|km)$/);
    await expect(mapPage.drawShapes.first()).toHaveAttribute(
      "data-done",
      "false",
    );

    await mapPage.drawPrimary.click();
    await expect(mapPage.drawShapes.first()).toHaveAttribute(
      "data-done",
      "true",
    );
    await expect(mapPage.drawPrimary).toHaveText("Done");
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(expect.stringMatching(/^Polygon 1 finished\. Area /));
  });

  test("draws a polygon with the keyboard alone", async ({ page, mapPage }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    await mapPage.focusMap();
    await page.keyboard.press(" ");
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 1 point");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press(" ");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press(" ");
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 3 points");
    await page.keyboard.press("Enter");
    await expect(mapPage.drawStatus).toHaveText("Polygon 1");
    await expect(mapPage.drawMeasure).toContainText(/ha|m²/);
  });

  test("refuses to finish a polygon whose edges cross, and says why", async ({
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    const { width, height } = await mapPage.mapSize();
    const cx = width / 2;
    const cy = height * 0.4;
    await mapPage.tapMap(
      [cx - 80, cy - 60],
      [cx + 80, cy + 60],
      [cx + 80, cy - 60],
      [cx - 80, cy + 60],
    );
    await mapPage.drawPrimary.click();
    await expect(mapPage.drawShapes.first()).toHaveAttribute(
      "data-done",
      "false",
    );
    await expect
      .poll(() => mapPage.announcements())
      .toContainEqual(expect.stringMatching(/^The edges cross each other/));
  });

  test("moves a vertex by dragging its handle, without panning the map", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await drawTriangle(mapPage);
    const second = mapPage.drawHandles.and(
      page.locator('[data-handle-id$=":v:1"]'),
    );
    const first = mapPage.drawHandles.and(
      page.locator('[data-handle-id$=":v:0"]'),
    );
    const before = await outline(mapPage);
    const firstBefore = await centreOf(first);
    const grab = await centreOf(second);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 30, grab.y - 20, { steps: 4 });
    await page.mouse.move(grab.x + 60, grab.y - 40, { steps: 4 });
    await page.mouse.up();

    expect(await outline(mapPage)).not.toBe(before);
    const moved = await centreOf(second);
    expect(moved.x).toBeCloseTo(grab.x + 60, -1);
    expect(moved.y).toBeCloseTo(grab.y - 40, -1);
    const firstAfter = await centreOf(first);
    expect(firstAfter.x).toBeCloseTo(firstBefore.x, 0);
    expect(firstAfter.y).toBeCloseTo(firstBefore.y, 0);
    // The press on the handle did not add a point, so the shape has three.
    await expect(
      mapPage.drawHandles.and(page.locator('[data-handle-kind="vertex"]')),
    ).toHaveCount(3);
    await expect(page.getByTestId("draw-selected-label")).toContainText(
      "point 2 of 3",
    );
  });

  test("moves a vertex with the arrow keys, one step for the whole run", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    const { width, height } = await mapPage.mapSize();
    const cx = width / 2;
    const cy = height * 0.4;
    await mapPage.tapMap(
      [cx - 90, cy + 60],
      [cx + 90, cy + 60],
      [cx + 90, cy - 70],
      [cx - 90, cy - 70],
    );
    await mapPage.drawPrimary.click();
    await page.getByRole("button", { name: "Next point" }).click();
    await expect(page.getByTestId("draw-selected-label")).toContainText(
      "point 1 of 4",
    );
    const vertex = mapPage.drawHandles.and(
      page.locator('[data-handle-id$=":v:0"]'),
    );
    const before = await centreOf(vertex);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    const after = await centreOf(vertex);
    expect(after.x - before.x).toBeCloseTo(16, 0);
    expect(after.y - before.y).toBeCloseTo(32, 0);

    await mapPage.drawUndo.click();
    const undone = await centreOf(vertex);
    expect(undone.x).toBeCloseTo(before.x, 0);
    expect(undone.y).toBeCloseTo(before.y, 0);

    await page.getByRole("button", { name: "Next point" }).click();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("draw-selected-label")).toContainText("of 3");
    await expect(
      mapPage.drawHandles.and(page.locator('[data-handle-kind="vertex"]')),
    ).toHaveCount(3);
  });

  test("adds a vertex by pressing a midpoint handle", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await drawTriangle(mapPage);
    const midpoint = mapPage.drawHandles.and(
      page.locator('[data-handle-kind="midpoint"]'),
    );
    await expect(midpoint).toHaveCount(3);
    const at = await centreOf(midpoint.first());
    await page.mouse.click(at.x, at.y);
    await expect(
      mapPage.drawHandles.and(page.locator('[data-handle-kind="vertex"]')),
    ).toHaveCount(4);
    await expect(page.getByTestId("draw-selected-label")).toContainText(
      "point 2 of 4",
    );
    await expect(mapPage.drawShapes).toHaveCount(1);
  });

  test("adds a vertex at the map centre with a button, as the keyboard way to insert", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await drawTriangle(mapPage);
    await page.getByRole("button", { name: "Next point" }).click();
    await page
      .getByRole("button", { name: "Add point after this one at map centre" })
      .click();
    await expect(page.getByTestId("draw-selected-label")).toContainText(
      "point 2 of 4",
    );
  });

  test("undo and redo step through the edits", async ({ mapPage }) => {
    await mapPage.goto(START);
    await drawTriangle(mapPage);
    await mapPage.drawUndo.click();
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 3 points");
    await mapPage.drawUndo.click();
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 2 points");
    await mapPage.drawRedo.click();
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 3 points");
  });

  test("drops an unfinished shape when another tool opens, but keeps it while the sheet is open over it", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    const taps = await triangleTaps(mapPage);
    const twoTaps = [taps[0], taps[1]] as [
      readonly [number, number],
      readonly [number, number],
    ];
    await mapPage.tapMap(...twoTaps);
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 2 points");
    await mapPage.startMeasuring();
    await mapPage.startDrawing();
    await expect(mapPage.drawStatus).toHaveText("Nothing drawn yet");

    await mapPage.tapMap(...twoTaps);
    await mapPage.drawShapesButton.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
    await page.keyboard.press("Escape");
    // The dropped shape used up Polygon 1, so this one is Polygon 2.
    await expect(mapPage.drawStatus).toHaveText("Polygon 2, 2 points");
  });

  test("cancels a shape that is being drawn", async ({ mapPage }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    const taps = await triangleTaps(mapPage);
    await mapPage.tapMap(
      taps[0] as [number, number],
      taps[1] as [number, number],
    );
    await expect(mapPage.drawRemove).toHaveAccessibleName("Cancel shape");
    await mapPage.drawRemove.click();
    await expect(mapPage.drawStatus).toHaveText("Nothing drawn yet");
    await expect(mapPage.drawShapes).toHaveCount(0);
    await expect(mapPage.drawRemove).toHaveAccessibleName("Delete shape");
  });

  test("Escape steps back: vertex, shape, then the tool, and returns focus to Draw", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await drawTriangle(mapPage);
    await page.getByRole("button", { name: "Next point" }).click();
    await expect(page.getByTestId("draw-selected-label")).toContainText(
      "point 1 of 3",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("draw-selected-label")).toContainText(
      "3 points",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("draw-selected-group")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(mapPage.drawToolbar).toHaveCount(0);
    await expect(mapPage.drawButton).toBeFocused();
    // The finished shape stays on the map when the tool closes.
    await expect(mapPage.drawShapes).toHaveCount(1);
    await expect(mapPage.drawHandles).toHaveCount(0);
  });

  test("draws a circle by centre and radius, and changes the radius by button", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    await page.getByRole("radio", { name: "Circle" }).click();
    const { width, height } = await mapPage.mapSize();
    const cx = circleCentreX(width);
    const cy = height * 0.4;
    await mapPage.tapMap([cx, cy], [cx + 110, cy]);
    await expect(mapPage.drawStatus).toHaveText("Circle 1");
    await expect(mapPage.drawMeasure).toContainText(/radius/);
    const radiusHandle = mapPage.drawHandles.and(
      page.locator('[data-handle-kind="radius"]'),
    );
    await expect(radiusHandle).toHaveCount(1);
    const before = await mapPage.drawMeasure.textContent();
    await page.getByRole("button", { name: "Larger radius" }).click();
    await page.getByRole("button", { name: "Larger radius" }).click();
    await expect(mapPage.drawMeasure).not.toHaveText(before ?? "");
    // Drag the radius handle outwards.
    const grab = await centreOf(radiusHandle);
    const after = await mapPage.drawMeasure.textContent();
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 40, grab.y, { steps: 4 });
    await page.mouse.up();
    await expect(mapPage.drawMeasure).not.toHaveText(after ?? "");
  });

  test("keeps shapes through a basemap change", async ({ mapPage }) => {
    await mapPage.goto(START);
    await drawTriangle(mapPage);
    await mapPage.mapOptionsButton.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
    await mapPage.chooseBasemap("Positron");
    await expect(mapPage.drawShapes).toHaveCount(1);
    await expect(mapPage.drawShapes.first()).toHaveAttribute(
      "data-done",
      "true",
    );
  });

  test.describe("export and sharing", () => {
    test("downloads GeoJSON, CSV and WKT from the Shapes section", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await drawTriangle(mapPage);
      await mapPage.drawShapesButton.click();
      await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
      await expect(mapPage.shapesSection).toBeVisible();
      await expect(mapPage.shapesSection.getByTestId("shapes-row")).toHaveCount(
        1,
      );

      const geojson = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download GeoJSON" }).click();
      const geojsonFile = await geojson;
      expect(geojsonFile.suggestedFilename()).toBe("mapcairn-shapes.geojson");
      const collection = JSON.parse(
        await readFile((await geojsonFile.path()) as string, "utf8"),
      );
      expect(collection.type).toBe("FeatureCollection");
      expect(collection.features).toHaveLength(1);
      expect(collection.features[0].geometry.type).toBe("Polygon");
      expect(collection.features[0].properties.area_m2).toBeGreaterThan(1000);

      const csv = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download CSV" }).click();
      const csvFile = await csv;
      expect(csvFile.suggestedFilename()).toBe("mapcairn-shapes.csv");
      const text = await readFile((await csvFile.path()) as string, "utf8");
      expect(text.split("\r\n")[0]).toBe(
        "id,type,area_m2,length_m,geometry,radius_m,centre_lng,centre_lat",
      );
      expect(text.split("\r\n")[1]).toMatch(/^shape-1,polygon,[\d.]+,[\d.]+,"/);
      await expect(page.getByTestId("shapes-feedback")).toContainText(
        "mapcairn-shapes.csv",
      );

      const wkt = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download WKT" }).click();
      const wktFile = await wkt;
      expect(wktFile.suggestedFilename()).toBe("mapcairn-shapes.wkt");
      const wktText = await readFile((await wktFile.path()) as string, "utf8");
      expect(wktText).toMatch(/^POLYGON \(\(/);
      await expect(page.getByTestId("shapes-feedback")).toContainText(
        "mapcairn-shapes.wkt",
      );
    });

    test("closing the sheet goes back to the draw tool, with focus on Shapes", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await drawTriangle(mapPage);
      await mapPage.drawShapesButton.click();
      await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
      await expect(mapPage.drawToolbar).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
      await expect(mapPage.drawToolbar).toBeVisible();
      await expect(mapPage.drawShapesButton).toBeFocused();
    });

    test("Settings over an unfinished shape resumes it with focus on Shapes", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await mapPage.startDrawing();
      const taps = await triangleTaps(mapPage);
      await mapPage.tapMap(...taps.slice(0, 2));
      await expect(mapPage.drawStatus).toHaveText("Polygon 1, 2 points");

      await mapPage.settingsButton.click();
      await expect(mapPage.settingsHeading).toBeVisible();
      await expect(mapPage.drawToolbar).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
      await expect(mapPage.drawStatus).toHaveText("Polygon 1, 2 points");
      await expect(mapPage.drawShapesButton).toBeFocused();
      await expect(mapPage.drawShapes).toHaveCount(1);
    });

    test("selects a shape from the list and edits it", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await drawTriangle(mapPage);
      await mapPage.drawRemove.click();
      await expect(mapPage.drawShapes).toHaveCount(0);
      await mapPage.drawUndo.click();
      await expect(mapPage.drawShapes).toHaveCount(1);
      await page.keyboard.press("Escape");
      await mapPage.drawShapesButton.click();
      await page.getByTestId("shapes-row").first().click();
      await page.keyboard.press("Escape");
      await expect(mapPage.drawToolbar).toBeVisible();
      await expect(page.getByTestId("draw-selected-label")).toContainText(
        "Polygon 1",
      );
    });

    test("shapes never reach the address, only a link the person copies", async ({
      page,
      mapPage,
    }) => {
      await scriptClipboard(page);
      await mapPage.goto(START);
      await drawTriangle(mapPage);
      await mapPage.focusMap();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(async () => (await mapPage.hashView())?.lng ?? 0)
        .toBeGreaterThan(2.3522);
      expect(await page.evaluate(() => window.location.hash)).not.toContain(
        "shapes=",
      );

      await mapPage.drawShapesButton.click();
      await page.getByRole("button", { name: "Copy link with shapes" }).click();
      await expect(page.getByTestId("shapes-feedback")).toHaveText(
        "Link with shapes copied.",
      );
      const [link] = await copiedText(page);
      expect(link).toContain("#map=");
      expect(link).toMatch(/&shapes=[A-Za-z0-9._-]+$/);
      expect(link?.length).toBeLessThan(400);
      // Still not in the address bar.
      expect(await page.evaluate(() => window.location.hash)).not.toContain(
        "shapes=",
      );

      await mapPage.goto(new URL(link ?? "").hash);
      await expect(mapPage.drawShapes).toHaveCount(1);
      await expect
        .poll(() => mapPage.announcements())
        .toContain("1 shape loaded from the link.");
    });

    test("deletes the selected shape and all shapes, and undo brings them back", async ({
      page,
      mapPage,
    }) => {
      await mapPage.goto(START);
      await drawTriangle(mapPage);
      await mapPage.drawShapesButton.click();
      await page.getByRole("button", { name: "Delete all shapes" }).click();
      await expect(page.getByTestId("shapes-empty")).toBeVisible();
      await page.keyboard.press("Escape");
      await mapPage.drawUndo.click();
      await expect(mapPage.drawShapes).toHaveCount(1);
    });
  });

  test("says there is nothing to export before a shape is finished", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto(START);
    await mapPage.startDrawing();
    await mapPage.drawShapesButton.click();
    await page.getByRole("button", { name: "Download GeoJSON" }).click();
    await expect(page.getByTestId("shapes-feedback")).toHaveText(
      "Nothing to export yet. Finish a shape first.",
    );
  });
});

test.describe("draw on touch", () => {
  test.use({ reducedMotion: "reduce" });

  test("drags a vertex with a finger and taps to add a point", async ({
    page,
    mapPage,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chromium",
      "Touch input needs the touch project.",
    );
    await mapPage.goto(START);
    await mapPage.startDrawing();
    const box = await mapPage.host.boundingBox();
    if (!box) {
      throw new Error("The map has no box.");
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height * 0.35;
    for (const [x, y] of [
      [cx - 70, cy + 50],
      [cx + 70, cy + 50],
      [cx, cy - 60],
    ] as const) {
      await page.touchscreen.tap(x, y);
    }
    await expect(mapPage.drawStatus).toHaveText("Polygon 1, 3 points");
    await mapPage.drawPrimary.click();

    const vertex = mapPage.drawHandles.and(
      page.locator('[data-handle-id$=":v:1"]'),
    );
    const grab = await centreOf(vertex);
    // A finger lands a little off the dot, within the larger touch reach.
    const press = { x: grab.x + 14, y: grab.y + 8 };
    const client = await page.context().newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      x: number,
      y: number,
    ) =>
      client.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    await touch("touchStart", press.x, press.y);
    await touch("touchMove", press.x + 20, press.y - 10);
    await touch("touchMove", press.x + 50, press.y - 30);
    await touch("touchEnd", press.x + 50, press.y - 30);
    await expect
      .poll(async () => (await centreOf(vertex)).x)
      .toBeGreaterThan(grab.x + 30);
    await expect(
      mapPage.drawHandles.and(page.locator('[data-handle-kind="vertex"]')),
    ).toHaveCount(3);
  });
});
