// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import {
  replaceSelectionExternally,
  scriptSelection,
  selectedRefs,
  selectionSubscribers,
} from "./support/services";

const REFERENCE = { layerId: "earthquakes", featureId: "a" };

/**
 * The host calls the feature selection hook and mounts its provider, and the
 * seam can supply the store the site builds none of. Nothing reads the set
 * yet, so this spec shows that the store reached the host and that a set
 * changes nothing the person sees or hears.
 */
test.describe("a scripted selection store", () => {
  test.use({ reducedMotion: "reduce" });

  test("is taken by the host, which subscribes to it and keeps what it holds", async ({
    page,
    mapPage,
    consoleMessages,
  }) => {
    await scriptSelection(page, { refs: [REFERENCE] });
    await mapPage.goto();

    await expect.poll(() => selectionSubscribers(page)).toBeGreaterThan(0);
    expect(consoleMessages.join("\n")).toContain(
      "test services replace selection",
    );
    expect(await selectedRefs(page)).toEqual([REFERENCE]);
  });

  test("shows and says nothing while the set holds references or changes from outside", async ({
    page,
    mapPage,
  }) => {
    await scriptSelection(page, { refs: [REFERENCE] });
    await mapPage.goto();
    await mapPage.openMapOptions();
    await expect(page.getByTestId("sheet-section-layers")).toBeVisible();
    const heard = await mapPage.announcements();

    await replaceSelectionExternally(page, [
      REFERENCE,
      { layerId: "earthquakes", featureId: "b" },
    ]);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );

    expect(await selectedRefs(page)).toHaveLength(2);
    expect(await mapPage.announcements()).toEqual(heard);
    await expect(page.getByRole("region", { name: /selection/i })).toHaveCount(
      0,
    );
  });
});
