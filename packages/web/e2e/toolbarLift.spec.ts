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

/** The tolerance, in px, for two gaps to count as the same. */
const GAP_TOLERANCE = 0.5;

/** A frame in which a bottom slot was not where it rests above the toolbar. */
interface OffFrame {
  readonly frame: number;
  readonly slot: string;
  /** The space between the slot's bottom and the toolbar's top; negative is an overlap. */
  readonly gap: number;
  /** The space the slot rests at, which it has once the frames have settled. */
  readonly settledGap: number;
}

/**
 * Records, on every animation frame while `action` runs and for a few frames
 * after it, the space between each bottom slot and the draw toolbar, and
 * returns each frame whose space was an overlap or was not the one the slot
 * rests at (the last one recorded, once the frames have settled). A slot
 * that trails a toolbar that grows is over it (a negative space); one that
 * trails a toolbar that shrinks floats too high. A sample is read from a
 * ResizeObserver callback that runs after `MapChrome`'s own in the same frame,
 * so it is the state the frame is about to draw, and again once each frame has
 * been drawn, to see a slot that drifts afterwards (for example one that
 * slides).
 */
async function offFramesDuring(
  mapPage: MapPage,
  action: () => Promise<void>,
): Promise<OffFrame[]> {
  const { page } = mapPage;
  const label = mapPage.messages["tools.draw.toolbar"];
  await page.evaluate((toolbarLabel) => {
    const gaps: { frame: number; slot: string; gap: number }[] = [];
    let frame = 0;
    const state = { running: true, gaps };
    const channel = new MessageChannel();
    let barTopAtLastObserver: number | null = null;
    const sample = (afterObservers: boolean) => {
      const toolbar = document.querySelector(
        `[role="toolbar"][aria-label="${toolbarLabel}"]`,
      );
      if (!toolbar) {
        return;
      }
      const bar = toolbar.getBoundingClientRect();
      // Between observer rounds a sample is only valid while nothing has moved
      // since the last one: a change made after the frame was drawn would
      // force a layout that no observer has answered yet.
      if (
        !afterObservers &&
        (barTopAtLastObserver === null ||
          Math.abs(bar.top - barTopAtLastObserver) > 0.5)
      ) {
        return;
      }
      barTopAtLastObserver = bar.top;
      frame += 1;
      for (const slot of ["bottom-start", "bottom-end"]) {
        const box = document
          .querySelector(`[data-chrome="${slot}"]`)
          ?.getBoundingClientRect();
        if (
          box &&
          box.height > 0 &&
          box.left < bar.right &&
          box.right > bar.left
        ) {
          gaps.push({ frame, slot, gap: bar.top - box.bottom });
        }
      }
    };
    // Created after `MapChrome`'s own observer, so in a frame it is told of a
    // size change after `MapChrome` has answered it and before the frame is
    // drawn: the state it reads is the one that would be painted.
    const observer = new ResizeObserver(() => sample(true));
    const watched = new Set<Element>();
    const watch = () => {
      const targets = document.querySelectorAll(
        `[role="toolbar"][aria-label="${toolbarLabel}"], [data-chrome="bottom-centre"], [data-chrome="bottom-start"], [data-chrome="bottom-end"]`,
      );
      for (const target of targets) {
        if (!watched.has(target)) {
          watched.add(target);
          observer.observe(target);
        }
      }
    };
    new MutationObserver(watch).observe(document.body, {
      childList: true,
      subtree: true,
    });
    watch();
    const heartbeat = () => {
      sample(false);
      if (state.running) {
        requestAnimationFrame(() => channel.port2.postMessage(null));
      } else {
        observer.disconnect();
      }
    };
    channel.port1.onmessage = heartbeat;
    channel.port2.postMessage(null);
    (window as unknown as { __lift: typeof state }).__lift = state;
  }, label);
  await action();
  await page.evaluate(async (frames) => {
    for (let index = 0; index < frames; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, SETTLE_FRAMES);
  const gaps = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __lift: {
          running: boolean;
          gaps: { frame: number; slot: string; gap: number }[];
        };
      }
    ).__lift;
    state.running = false;
    return state.gaps;
  });
  return gaps.flatMap((sample) => {
    const settledGap = gaps.findLast((last) => last.slot === sample.slot)?.gap;
    const over = sample.gap < -GAP_TOLERANCE;
    const moved =
      settledGap !== undefined &&
      Math.abs(sample.gap - settledGap) > GAP_TOLERANCE;
    return settledGap !== undefined && (over || moved)
      ? [{ ...sample, settledGap }]
      : [];
  });
}

async function setTextSize(page: Page, size: string): Promise<void> {
  await page.evaluate((value) => {
    document.documentElement.style.fontSize = value;
  }, size);
}

/**
 * `grows` is whether larger text makes the toolbar taller. On a small phone
 * it is already at its cap (half the screen, with the controls scrolling
 * inside), so only the phone proves a toolbar that changes height.
 */
const VIEWPORTS = [
  { name: "a phone", width: 390, height: 844, grows: true },
  { name: "a small phone", width: 320, height: 568, grows: false },
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

    for (const { name, width, height, grows } of VIEWPORTS) {
      test(`every frame has the bottom slots at rest above the toolbar as it opens, gets its first point and measure, and changes text size on ${name}`, async ({
        page,
        mapPage,
      }) => {
        await page.setViewportSize({ width, height });
        await mapPage.goto(START);
        await collapseCredits(mapPage);
        const map = await mapPage.mapSize();

        expect
          .soft(
            await offFramesDuring(mapPage, () => mapPage.startDrawing()),
            "while the toolbar opens",
          )
          .toEqual([]);
        expect
          .soft(
            await offFramesDuring(mapPage, () =>
              mapPage.tapMap([map.width * 0.3, map.height * 0.3]),
            ),
            "at the first point",
          )
          .toEqual([]);
        expect
          .soft(
            await offFramesDuring(mapPage, () =>
              mapPage.tapMap([map.width * 0.5, map.height * 0.3]),
            ),
            "at the first measure",
          )
          .toEqual([]);
        const heightBefore = (await mapPage.drawToolbar.boundingBox())?.height;
        expect
          .soft(
            await offFramesDuring(mapPage, () => setTextSize(page, "150%")),
            "as the text grows",
          )
          .toEqual([]);
        // The text size must really change the toolbar's height, or the
        // frames above prove nothing about a toolbar that changes height.
        if (grows) {
          expect(
            (await mapPage.drawToolbar.boundingBox())?.height,
          ).toBeGreaterThan(heightBefore ?? Number.POSITIVE_INFINITY);
        }
        expect
          .soft(
            await offFramesDuring(mapPage, () => setTextSize(page, "100%")),
            "as the text shrinks",
          )
          .toEqual([]);
      });
    }
  });
}
