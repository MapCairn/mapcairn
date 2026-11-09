import { expect, test } from "./fixtures";
import { E2E } from "./selectors";
import { ensurePanelOpen } from "./ui";

test("a basemap permalink survives reloading", async ({ page }) => {
  await page.goto("/");
  await ensurePanelOpen(page);
  await page.getByTestId(E2E.basemapOption.satellite).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("basemap"))
    .toBe("satellite");
  await page.reload();
  await ensurePanelOpen(page);
  await expect(page.getByTestId(E2E.basemapOption.satellite)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("obsolete dataset and panel parameters are discarded", async ({
  page,
}) => {
  await page.goto(
    "/?layers=removed&panel=removed&feature=removed&basemap=topo",
  );
  await expect(page).toHaveURL(/\?basemap=topo$/);
  await ensurePanelOpen(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);
});
