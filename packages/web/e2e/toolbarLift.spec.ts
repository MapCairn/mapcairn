// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { MapPage } from "./pages/MapPage";
import { collapseCredits } from "./support/states";

/** Paris, at a zoom where a few hundred pixels is a few hundred metres. */
const START = "#map=15.00/48.85660/2.35220";

/** Frames to keep recording after an action, so a late lift is still seen. */
const SETTLE_FRAMES = 12;

/** What the recorder keeps for a frame in which a bottom slot meets the toolbar. */
interface OverlapFrame {
  readonly frame: number;
  readonly slot: string;
  readonly slotBottom: number;
  readonly toolbarTop: number;
}

/**
 * Records, on every animation frame while `action` runs and for a few frames
 * after it, whether a bottom slot overlaps the draw toolbar, and returns each
 * frame that did. A frame is sampled before the browser lays out and paints
 * the next one, so a sample is what the visitor saw, and a lift that follows
 * the toolbar a frame late shows as an overlap.
 */
async function overlapsDuring(
  mapPage: MapPage,
  action: () => Promise<void>,
): Promise<OverlapFrame[]> {
  const { page } = mapPage;
  const label = mapPage.messages["tools.draw.toolbar"];
  await page.evaluate((toolbarLabel) => {
    const found: OverlapFrame[] = [];
    let frame = 0;
    const state = { running: true, found };
    const sample = () => {
      frame += 1;
      const toolbar = document.querySelector(
        `[role="toolbar"][aria-label="${toolbarLabel}"]`,
      );
      if (toolbar) {
        const bar = toolbar.getBoundingClientRect();
        for (const slot of ["bottom-start", "bottom-end"]) {
          const element = document.querySelector(`[data-chrome="${slot}"]`);
          const box = element?.getBoundingClientRect();
          if (
            box &&
            box.height > 0 &&
            box.bottom > bar.top + 0.5 &&
            box.top < bar.bottom &&
            box.left < bar.right &&
            box.right > bar.left
          ) {
            found.push({
              frame,
              slot,
              slotBottom: box.bottom,
              toolbarTop: bar.top,
            });
          }
        }
      }
      if (state.running) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
    (window as unknown as { __lift: typeof state }).__lift = state;
  }, label);
  await action();
  await page.evaluate(async (frames) => {
    for (let index = 0; index < frames; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, SETTLE_FRAMES);
  return page.evaluate(() => {
    const state = (
      window as unknown as {
        __lift: { running: boolean; found: OverlapFrame[] };
      }
    ).__lift;
    state.running = false;
    return state.found;
  });
}

async function setTextSize(page: Page, size: string): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = value;
  }, size);
}

const VIEWPORTS = [
  { name: "a phone", width: 390, height: 844 },
  { name: "a small phone", width: 320, height: 568 },
] as const;

/** The languages and motion settings the frames are recorded in. With motion, the sheet's lift slides, and the toolbar's must not. */
const SETTINGS = [
  { language: "en", motion: "reduce" },
  { language: "en", motion: "no-preference" },
  { language: "af", motion: "reduce" },
] as const;

for (const { language, motion } of SETTINGS) {
  test.describe(`bottom slots follow the draw toolbar (${language}, motion ${motion})`, () => {
    test.use({
      reducedMotion: motion,
      fastCredits: true,
      language: language === "af" ? "af" : null,
    });

    for (const { name, width, height } of VIEWPORTS) {
      test(`no frame has a bottom slot over the toolbar as it opens, gets its first point and measure, and changes text size on ${name}`, async ({
        page,
        mapPage,
      }) => {
        await page.setViewportSize({ width, height });
        await mapPage.goto(START);
        await collapseCredits(mapPage);
        const map = await mapPage.mapSize();

        expect(
          await overlapsDuring(mapPage, () => mapPage.startDrawing()),
          "while the toolbar opens",
        ).toEqual([]);
        expect(
          await overlapsDuring(mapPage, () =>
            mapPage.tapMap([map.width * 0.3, map.height * 0.3]),
          ),
          "at the first point",
        ).toEqual([]);
        expect(
          await overlapsDuring(mapPage, () =>
            mapPage.tapMap([map.width * 0.5, map.height * 0.3]),
          ),
          "at the first measure",
        ).toEqual([]);
        const heightBefore = (await mapPage.drawToolbar.boundingBox())?.height;
        expect(
          await overlapsDuring(mapPage, () => setTextSize(page, "150%")),
          "as the text grows",
        ).toEqual([]);
        // The text size must really change the toolbar's height, or the
        // frames above prove nothing about a toolbar that changes height.
        expect(
          (await mapPage.drawToolbar.boundingBox())?.height,
        ).toBeGreaterThan(heightBefore ?? Number.POSITIVE_INFINITY);
        expect(
          await overlapsDuring(mapPage, () => setTextSize(page, "100%")),
          "as the text shrinks",
        ).toEqual([]);
      });
    }
  });
}
