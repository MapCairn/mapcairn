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

    // Every browser keeps focus inside the sheet on every press. WebKit's
    // default Tab order skips links (and, in Safari, buttons), so there the
    // sheet's focus sentinels, not the keydown loop, wrap it round.
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
        where,
        `focus went to the ${where} after ${presses + 1} presses`,
      ).toBe("sheet");
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

test.describe("settings sheet on a phone", () => {
  test.use({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ mapPage }) => {
    await mapPage.goto();
    await expect(mapPage.chrome).toHaveAttribute("data-layout", "sheet");
  });

  test("opens from the Settings button as a sheet titled Settings and help holding only Settings and Help", async ({
    page,
    mapPage,
  }) => {
    await expect(mapPage.settingsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(mapPage.settingsButton).toHaveAttribute(
      "aria-controls",
      "map-options",
    );
    await mapPage.openSettings();

    await expect(
      page.getByRole("dialog", { name: "Settings and help" }),
    ).toBeVisible();
    await expect(mapPage.settingsButton).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(mapPage.mapOptionsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.getByRole("region", { name: "Settings" })).toBeAttached();
    await expect(page.getByRole("region", { name: "Help" })).toBeAttached();
    // The sheet title and the Settings section must not share a name.
    await expect(
      mapPage.sheet.getByRole("heading", { name: "Settings", exact: true }),
    ).toHaveCount(1);
    await expect(mapPage.basemapPicker).toHaveCount(0);
  });

  test("leaves Settings and Help out of the Map options sheet", async ({
    page,
    mapPage,
  }) => {
    await mapPage.openMapOptions();
    await expect(mapPage.basemapPicker).toBeAttached();
    await expect(page.getByRole("region", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Help" })).toHaveCount(0);
  });

  test("pressing Settings again closes it and hands focus back to Settings", async ({
    page,
    mapPage,
  }) => {
    await mapPage.openSettings();
    await mapPage.settingsButton.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.settingsButton).toBeFocused();

    await mapPage.openSettings();
    await page.keyboard.press("Escape");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.settingsButton).toBeFocused();
  });

  test("the Close button hands focus back to Settings", async ({ mapPage }) => {
    await mapPage.openSettings();
    await mapPage.sheetClose.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.settingsButton).toBeFocused();

    await mapPage.openSettings();
    await mapPage.sheetHandle.click();
    await expect(mapPage.sheet).toHaveAttribute("data-detent", "full");
    await mapPage.sheetClose.click();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");
    await expect(mapPage.settingsButton).toBeFocused();
  });

  test("each button switches the open sheet to its own without closing it", async ({
    mapPage,
  }) => {
    await mapPage.openSettings();
    await mapPage.switchToMapOptions();
    await expect(mapPage.sheet).toHaveAttribute("data-state", "open");
    await expect(mapPage.basemapPicker).toBeAttached();
    await expect(mapPage.settingsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await mapPage.switchToSettings();
    await expect(mapPage.basemapPicker).toHaveCount(0);
    await expect(mapPage.mapOptionsButton).toHaveAttribute(
      "aria-expanded",
      "false",
    );
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

  test("Enter and Space toggle Settings, and it is last in its group's tab order", async ({
    page,
    mapPage,
    isMobile,
  }) => {
    await mapPage.goto();
    await mapPage.settingsButton.focus();
    await page.keyboard.press("Enter");
    await expect(mapPage.settingsHeading).toBeVisible();
    await expect(mapPage.settingsButton).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await mapPage.settingsButton.focus();
    await page.keyboard.press("Enter");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");

    await mapPage.settingsButton.focus();
    await page.keyboard.press("Space");
    await expect(mapPage.settingsHeading).toBeVisible();
    await mapPage.settingsButton.focus();
    await page.keyboard.press("Space");
    await expect(mapPage.sheet).toHaveAttribute("data-state", "closed");

    await mapPage.locateButton.focus();
    await page.keyboard.press("Tab");
    await expect(mapPage.settingsButton).toBeFocused();
    // The zoom group follows Settings where it shows (a mouse); on a touch
    // device the map region is next.
    const next = isMobile ? mapPage.region : mapPage.zoomInButton;
    await page.keyboard.press("Tab");
    await expect(next).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(mapPage.settingsButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(mapPage.locateButton).toBeFocused();
  });

  test("Settings opens the same side panel, titled Settings and help", async ({
    page,
    mapPage,
  }) => {
    await mapPage.goto();
    await mapPage.openSettings();

    await expect(
      page.getByRole("complementary", { name: "Settings and help" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(mapPage.settingsButton).toBeFocused();
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
