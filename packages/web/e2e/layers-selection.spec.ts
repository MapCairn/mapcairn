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
 * yet, so this spec shows that the store reached the host, and that a change
 * made from outside is not announced, as the hook documents.
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
    expect(
      consoleMessages.some((message) =>
        /test services replace .*\bselection\b/.test(message),
      ),
    ).toBe(true);
    expect(await selectedRefs(page)).toEqual([REFERENCE]);
  });

  // The Selection section arrives with the panel (plan 0007, step 5), which
  // gives this test something visible to check as well.
  test("says nothing when the set changes from outside", async ({
    page,
    mapPage,
  }) => {
    await scriptSelection(page, { refs: [REFERENCE] });
    await mapPage.goto();
    const heard = await mapPage.announcements();

    await replaceSelectionExternally(page, [
      REFERENCE,
      { layerId: "earthquakes", featureId: "b" },
    ]);

    await expect.poll(() => selectedRefs(page)).toHaveLength(2);
    expect(await mapPage.announcements()).toEqual(heard);
  });
});
