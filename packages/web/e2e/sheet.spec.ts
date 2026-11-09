import { expect, test } from "./fixtures";

test.describe("map options sheet on a phone", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ mapPage }) => {
    await mapPage.goto();
    await expect(mapPage.chrome).toHaveAttribute("data-layout", "sheet");
  });

  test("opens as a non-modal dialog at half height, with focus on its title", async ({
    page,
    mapPage,
  }) => {
    await expect(mapPage.mapOptionsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(mapPage.mapOptionsButton).toHaveAttribute(
      "aria-controls",
      "map-options",
    );
    await mapPage.openMapOptions();

    const dialog = page.getByRole("dialog", { name: "Map options" });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toHaveAttribute("aria-modal", "true");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "half");
    await expect(mapPage.mapOptionsButton).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Non-modal: the map and the rest of the chrome stay usable.
    await expect(page.locator('[data-chrome="top-start"]')).not.toHaveAttribute(
      "inert",
      /.*/,
    );
    await mapPage.searchInput.click();
    await expect(mapPage.searchInput).toBeFocused();
  });

  test("the handle cycles detents with Enter and steps them with the arrow keys", async ({
    page,
    mapPage,
  }) => {
    await mapPage.openMapOptions();
    await mapPage.sheetHandle.focus();

    await page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await expect
      .poll(() => mapPage.announcements())
      .toContain("Panel full height");
    await page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "peek");
    await page.keyboard.press(" ");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "half");

    await page.keyboard.press("ArrowDown");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "peek");
    await page.keyboard.press("ArrowDown");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "peek");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await expect(mapPage.sheetHandle).toBeFocused();
  });

  test("at full height it is modal: the background is inert and covered, and Tab stays inside", async ({
    page,
    mapPage,
  }) => {
    await mapPage.openMapOptions();
    await mapPage.sheetHandle.click();
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");

    const dialog = page.getByRole("dialog", { name: "Map options" });
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    for (const slot of ["top-start", "end-stack"]) {
      await expect(page.locator(`[data-chrome="${slot}"]`)).toHaveAttribute(
        "inert",
        "",
      );
    }
    await expect(page.getByRole("main")).toHaveAttribute("inert", "");
    await expect(mapPage.chrome).toHaveAttribute("data-hide-bottom", "true");

    // Nothing behind the sheet shows through where the search pill sits.
    const pill = await page
      .locator('[data-chrome="search-pill"]')
      .boundingBox();
    if (!pill) {
      throw new Error("The search pill has no box.");
    }
    const coveredBySheet = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('[data-chrome="sheet"]') !==
        null,
      { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 },
    );
    expect(coveredBySheet).toBe(true);

    // WebKit's default Tab order skips buttons and links (Safari needs
    // Option+Tab), so past the last form control the next Tab goes to the
    // browser itself and `activeElement` is the body. That is the platform's
    // behaviour, and the inert background still cannot take focus. Every
    // other browser must keep focus inside the sheet on every press.
    const mayLeaveToBrowser = test.info().project.name === "webkit";
    await mapPage.sheetClose.focus();
    for (let presses = 0; presses < 40; presses += 1) {
      await page.keyboard.press("Tab");
      const where = await page.evaluate(() => {
        const active = document.activeElement;
        if (active?.closest('[data-chrome="sheet"]')) {
          return "sheet";
        }
        return active === document.body || active === null
          ? "browser"
          : "background";
      });
      expect(
        where === "sheet" || (mayLeaveToBrowser && where === "browser"),
        `focus went to the ${where} after ${presses + 1} presses`,
      ).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator(":focus")).toBeAttached();
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('[data-chrome="sheet"]') !== null,
      ),
    ).toBe(true);
  });

  test("Escape and Close close it and hand focus back to Map options", async ({
    page,
    mapPage,
  }) => {
    await mapPage.openMapOptions();
    await page.keyboard.press("Escape");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.mapOptionsButton).toBeFocused();

    await mapPage.openMapOptions();
    await mapPage.sheetHandle.click();
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await mapPage.sheetClose.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.mapOptionsButton).toBeFocused();
    await expect(page.getByRole("main")).not.toHaveAttribute("inert", /.*/);
  });

  test("dragging the handle up snaps the sheet to full height", async ({
    page,
    mapPage,
  }) => {
    await mapPage.openMapOptions();
    const handle = await mapPage.sheetHandle.boundingBox();
    if (!handle) {
      throw new Error("The handle has no box.");
    }
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 150, { steps: 6 });
    await page.mouse.move(x, y - 350, { steps: 6 });
    await page.mouse.up();
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
  });

  test("the bottom slots ride above the sheet", async ({ page, mapPage }) => {
    await mapPage.openMapOptions();
    const sheetTop = (await mapPage.sheet.boundingBox())?.y ?? 0;
    for (const slot of ["bottom-start", "bottom-end"]) {
      const box = await page.locator(`[data-chrome="${slot}"]`).boundingBox();
      expect(
        (box?.y ?? Number.POSITIVE_INFINITY) + (box?.height ?? 0),
      ).toBeLessThanOrEqual(sheetTop);
    }
  });
});

test.describe("map options panel on a desktop", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 1280, height: 720 } });

  test("is a labelled complementary region, never modal and without a handle", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await expect(mapPage.chrome).toHaveAttribute("data-layout", "panel");
    await mapPage.openMapOptions();

    await expect(
      page.getByRole("complementary", { name: "Map options" }),
    ).toBeVisible();
    await expect(mapPage.sheetHandle).toHaveCount(0);
    await expect(mapPage.sheet).not.toHaveAttribute("data-detent", /.*/);
    await expect(page.getByRole("main")).not.toHaveAttribute("inert", /.*/);
    await page.keyboard.press("Escape");
    await expect(mapPage.mapOptionsButton).toBeFocused();
  });

  test("a short landscape phone also gets the side panel", async ({
    page,
    mapPage,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await mapPage.goto();
    await expect(mapPage.chrome).toHaveAttribute("data-layout", "panel");
  });
});
