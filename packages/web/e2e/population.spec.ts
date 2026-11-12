// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";

test.describe("population layer", () => {
  test.use({ reducedMotion: "reduce" });

  test("warns that its provider may leave tiles missing or black", async ({
    page,
    mapPage,
  }) => {
    await mockLayerProviders(page);
    await mapPage.goto("#layers=population");
    await mapPage.openMapOptions();
    const item = page.getByTestId("layer-population");
    await expect(item.getByRole("switch").first()).toBeChecked();
    await expect(item).toContainText("missing or solid black");
    await expect(item).toContainText("provider");
  });
});
