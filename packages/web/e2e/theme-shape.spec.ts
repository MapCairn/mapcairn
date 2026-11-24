// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { axeViolations, inspectControls } from "./support/a11y";
import { findCornerClipping } from "./support/corners";
import { inspectChromeLayout } from "./support/layout";
import { scriptSearch } from "./support/services";
import {
  CHROME_STATES,
  enterState,
  leaveState,
  viewportDetails,
  waitForStableLayout,
} from "./support/states";
import { smallTargetsByState, targetNames } from "./support/targets";

/*
 * The shape presets of `createThemeStylesheet` (`shape`: square, default or
 * round), checked at every slot. A generated stylesheet, served from the app's
 * own origin as a host would serve it (`/design/host-theme/square` and
 * `/design/host-theme/round`), sets the page's corners; the default preset
 * writes nothing and is the baseline. For each preset, at phone, tablet and
 * desktop sizes in both themes, the spec walks every chrome state and checks
 * that nothing overlaps, that no control gets smaller than it is by default,
 * that no rounded corner cuts text, an icon, a field or a focus ring, and
 * (tagged @a11y) axe. The search pill must stay a pill.
 */
test.use({ reducedMotion: "reduce", fastCredits: true });
test.setTimeout(180_000);

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1440, height: 900 },
] as const;

const PRESETS = ["default", "square", "round"] as const;
type Preset = (typeof PRESETS)[number];

/** The stylesheet for a preset, or `null` for the default, which writes nothing. */
const sheetFor = (preset: Preset): string | null =>
  preset === "default" ? null : `/design/host-theme/${preset}`;

/** Opens the map in a viewport and theme with the SDK's own corners. */
async function openMap(
  page: Page,
  mapPage: MapPage,
  viewport: (typeof VIEWPORTS)[number],
  colorScheme: "light" | "dark",
): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.setViewportSize(viewport);
  await scriptSearch(page);
  await mapPage.goto();
  await waitForStableLayout(page);
}

/** Links the preset's stylesheet and waits for the layout to settle. */
async function applyPreset(page: Page, preset: Preset): Promise<void> {
  const sheet = sheetFor(preset);
  if (sheet !== null) {
    await page.addStyleTag({ url: sheet });
  }
  await waitForStableLayout(page);
}

/** The corner radius of the search pill, in pixels, and the pill's height. */
async function pillCorner(
  mapPage: MapPage,
): Promise<{ radius: number; height: number }> {
  return mapPage.searchInput.evaluate((input) => {
    const pill = input.parentElement as HTMLElement;
    return {
      radius: Number.parseFloat(getComputedStyle(pill).borderTopLeftRadius),
      height: pill.getBoundingClientRect().height,
    };
  });
}

/*
 * The corner check must be able to fail: text that a rounded, clipping box
 * cuts is found, and text clear of the curve is not.
 */
test.describe("the corner check", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "Runs once, in the desktop project.");
  });

  test("finds text and an icon a rounded corner cuts, and lets clear content pass", async ({
    page,
  }) => {
    await page.setContent(`
      <div style="position:absolute;left:10px;top:10px;width:120px;height:60px;overflow:hidden;border-radius:30px;font:16px sans-serif">
        <span style="position:absolute;left:0;top:0">Cut</span>
      </div>
      <div style="position:absolute;left:10px;top:100px;width:120px;height:60px;overflow:hidden;border-radius:30px;font:16px sans-serif">
        <span style="position:absolute;left:40px;top:20px">Clear</span>
      </div>
      <div style="position:absolute;left:200px;top:10px;width:120px;height:60px;border-radius:30px;font:16px sans-serif">
        <span style="position:absolute;left:0;top:0">Not clipped</span>
      </div>`);

    expect(await findCornerClipping(page)).toEqual([
      expect.stringContaining("cuts its top left corner into text"),
    ]);
  });

  test("counts a control's focus ring, which follows its own radius", async ({
    page,
  }) => {
    await page.setContent(`
      <div style="position:absolute;left:10px;top:10px;width:100px;height:100px;overflow:hidden;border-radius:20px">
        <button style="position:absolute;left:4px;top:4px;width:44px;height:44px;border-radius:0">A</button>
      </div>
      <div style="position:absolute;left:200px;top:10px;width:100px;height:100px;overflow:hidden;border-radius:20px">
        <button style="position:absolute;left:12px;top:12px;width:44px;height:44px;border-radius:14px">B</button>
      </div>`);

    expect(await findCornerClipping(page)).toEqual([
      expect.stringContaining('the focus ring of button "A"'),
    ]);
  });
});

for (const preset of PRESETS) {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const viewport of VIEWPORTS) {
      const name = `the ${preset} shape at ${viewport.width}x${viewport.height} in the ${colorScheme} theme`;
      const details = viewportDetails(viewport);

      test(
        `${name} keeps every slot sound`,
        details,
        async ({ page, mapPage }) => {
          await openMap(page, mapPage, viewport, colorScheme);
          const before = await smallTargetsByState(page, mapPage);
          await applyPreset(page, preset);
          for (const state of CHROME_STATES) {
            await test.step(state, async () => {
              await enterState(mapPage, state);
              await waitForStableLayout(page);
              const layout = await inspectChromeLayout(page);
              const context = JSON.stringify(layout.boxes);
              expect.soft(layout.overlaps, context).toEqual([]);
              expect.soft(layout.outside, context).toEqual([]);
              expect.soft(layout.obscured, context).toEqual([]);
              const controls = await inspectControls(page);
              expect.soft(controls.tooSmall).toEqual([]);
              const newlySmall = targetNames(controls.under44).filter(
                (target) => !before.get(state)?.includes(target),
              );
              expect
                .soft(newlySmall, "targets the shape made smaller")
                .toEqual([]);
              expect.soft(await findCornerClipping(page)).toEqual([]);
              await leaveState(mapPage, state);
            });
          }
        },
      );

      test(`${name} passes axe @a11y`, details, async ({ page, mapPage }) => {
        await openMap(page, mapPage, viewport, colorScheme);
        await applyPreset(page, preset);
        for (const state of CHROME_STATES) {
          await test.step(state, async () => {
            await enterState(mapPage, state);
            await waitForStableLayout(page);
            expect.soft(await axeViolations(page)).toEqual([]);
            await leaveState(mapPage, state);
          });
        }
      });
    }
  }
}

test.describe("the search pill", () => {
  const WIDE_PHONE = { width: 390, height: 844 } as const;

  test("stays a pill in the default and round shapes, and changes with the square one", async ({
    page,
    mapPage,
  }) => {
    await openMap(page, mapPage, WIDE_PHONE, "light");
    const byDefault = await pillCorner(mapPage);
    expect(byDefault.radius * 2).toBeGreaterThanOrEqual(byDefault.height);

    await applyPreset(page, "round");
    const round = await pillCorner(mapPage);
    expect(round.radius * 2).toBeGreaterThanOrEqual(round.height);
    expect(round.radius).toBe(byDefault.radius);

    await applyPreset(page, "square");
    const square = await pillCorner(mapPage);
    expect(square.radius * 2).toBeLessThan(square.height);
  });
});
