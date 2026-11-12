// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";

/*
 * The app's own timers, for specs that jump the page's clock past one instead
 * of sleeping. The values copy constants in `@mapcairn/map`, which a spec
 * cannot import (its styles need the build); keep them equal.
 */

/** `LONG_PRESS_DELAY_MS` in `packages/map/src/host/useLongPress.ts`. */
export const LONG_PRESS_DELAY_MS = 500;

/** `VIEW_SETTLE_MS` in `packages/map/src/layers/MapDataLayers.tsx`. */
export const VIEW_SETTLE_MS = 400;

/** `SCALE_BAR_IDLE_MS` in `packages/map/src/chrome/MapReadout/MapReadout.tsx`. */
export const SCALE_BAR_IDLE_MS = 2_000;

/** `SUGGEST_DEBOUNCE_MS` in `packages/map/src/tools/SearchPill/useSuggestions.ts`. */
export const SUGGEST_DEBOUNCE_MS = 275;

/**
 * Longer than any debounce a search box would use, so a spec jumps this far to
 * show that typing alone never searches the geocoder.
 */
export const ANY_DEBOUNCE_MS = 1_000;

/**
 * How far past a timer's delay a spec jumps the clock, so a timer set a
 * moment after the step that started it has also come due.
 */
export const TIMER_SLACK_MS = 200;

/**
 * Waits for two animation frames in the page, so whatever a timer that just
 * came due set in motion has rendered before a spec checks that it did not
 * happen. Under an installed clock the frames still come, because the clock
 * keeps time with the real one until a spec jumps it.
 */
export async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}
