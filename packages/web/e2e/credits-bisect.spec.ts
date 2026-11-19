import { expect, test } from "./fixtures";
import { mockLayerProviders } from "./support/layers";
import { collapseCredits } from "./support/states";

test.use({ reducedMotion: "reduce", fastCredits: true });

test("credits clear search and draw at 320 by 568 and 150 percent text", async ({
  page,
  mapPage,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockLayerProviders(page);
  await mapPage.goto(
    "#layers=earthquakes,volcano-alerts,fire-alerts,drought-alerts,flood-alerts,cyclones",
  );
  await collapseCredits(mapPage);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "150%";
  });
  await mapPage.startDrawing();
  await mapPage.drawAddPoint.click();
  await mapPage.focusMap();
  await page.keyboard.press("ArrowRight");
  await mapPage.drawAddPoint.click();
  await mapPage.creditsButton.click();
  await expect(mapPage.creditsRegion).toBeVisible();

  const popover = await mapPage.creditsRegion.boundingBox();
  const search = await mapPage.searchLandmark.boundingBox();
  const toolbar = await mapPage.drawToolbar.boundingBox();
  if (!(popover && search && toolbar)) {
    throw new Error("A collision box is missing.");
  }
  const collisions = [
    { name: "search", box: search },
    { name: "toolbar", box: toolbar },
  ]
    .filter(
      ({ box }) =>
        popover.x < box.x + box.width &&
        popover.x + popover.width > box.x &&
        popover.y < box.y + box.height &&
        popover.y + popover.height > box.y,
    )
    .map(({ name }) => name);
  expect(collisions).toEqual([]);
});
