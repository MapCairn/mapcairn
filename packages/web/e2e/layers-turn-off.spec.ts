// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";

/** A permalink with two layers on, in different groups. */
const TWO_LAYERS = "#layers=earthquakes,imagery&earthquakes.window=week";

test.describe("turning layers off at once", () => {
  test.use({ reducedMotion: "reduce" });

  test("the button is disabled, not hidden, while no layer is on", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(mapPage.turnOffAllButton).toBeVisible();
    await expect(mapPage.turnOffAllButton).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(mapPage.turnOffAllButton).toContainText("0 on");
  });

  test("turns every layer off in one step, says so once, and Undo brings them back with their controls", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto(TWO_LAYERS);
    await mapPage.openMapOptions();
    const quakes = page.getByTestId("layer-earthquakes").getByRole("switch");
    await expect(quakes.first()).toBeChecked();
    await expect(mapPage.turnOffAllButton).toContainText("2 on");

    await mapPage.turnOffAllButton.click();

    await expect(mapPage.layersSection).toContainText("Turned off 2 layers.");
    await expect(mapPage.turnOffAllButton).toContainText("0 on");
    await expect(quakes.first()).not.toBeChecked();
    await expect(page).not.toHaveURL(/layers=/);
    await expect
      .poll(() => mapPage.announcements())
      .toContain("2 layers turned off. Undo available");

    await mapPage.undoTurnOffButton.click();

    await expect(quakes.first()).toBeChecked();
    await expect(page).toHaveURL(/layers=earthquakes,imagery/);
    await expect(page).toHaveURL(/earthquakes\.window=week/);
    await expect(
      page
        .getByTestId("layer-earthquakes")
        .getByRole("radio", { name: "Week" }),
    ).toBeChecked();
    await expect(mapPage.turnOffAllButton).toContainText("2 on");
    await expect
      .poll(() => mapPage.announcements())
      .toContain("2 layers turned back on");
  });

  test("says Undo worked even when the layers load straight after it", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto(TWO_LAYERS);
    await mapPage.openMapOptions();
    await mapPage.turnOffAllButton.click();
    // No wait between the two clicks: Undo and the loads it starts fall inside
    // the announcer's window after the turning-off message.
    await mapPage.undoTurnOffButton.click();
    await expect
      .poll(() => mapPage.announcements())
      .toContain("2 layers turned back on");
  });

  test("works from the keyboard: Enter turns them off, Tab reaches Undo, Enter undoes", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto(TWO_LAYERS);
    await mapPage.openMapOptions();
    await mapPage.turnOffAllButton.focus();
    await page.keyboard.press("Enter");
    await expect(mapPage.turnOffAllButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(mapPage.undoTurnOffButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(mapPage.turnOffAllButton).toBeFocused();
    await expect(mapPage.turnOffAllButton).toContainText("2 on");
  });

  test("a group's action turns off only that group, and its Undo is beside it", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto(TWO_LAYERS);
    await mapPage.openMapOptions();
    const group = mapPage.layersSection.getByRole("button", {
      name: "Turn off 1 in Earthquakes and volcanoes",
    });
    await group.click();
    await expect(mapPage.layersSection).toContainText(
      "Turned off 1 in Earthquakes and volcanoes.",
    );
    await expect(mapPage.undoTurnOffButton).toBeFocused();
    await expect(page).toHaveURL(/layers=imagery/);
    await expect(mapPage.turnOffAllButton).toContainText("1 on");
    await mapPage.undoTurnOffButton.click();
    await expect(page).toHaveURL(/layers=[^&]*earthquakes/);
  });
});
