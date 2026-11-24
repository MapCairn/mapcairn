// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";
import type { MapPage } from "../pages/MapPage";
import { inspectControls } from "./a11y";
import {
  CHROME_STATES,
  enterState,
  leaveState,
  waitForStableLayout,
} from "./states";

/**
 * The targets in a report without their sizes: a different font makes a link
 * wider, and a report is about which targets are small, not how wide they are.
 */
export function targetNames(report: readonly string[]): readonly string[] {
  return report.map((entry) => entry.replace(/ is \d+x\d+$/, ""));
}

/**
 * The targets under 44 pixels in each chrome state, as the page has them now.
 * Taken before a change to the page's styling, it says which targets were
 * already small, so the change is judged on the targets it made smaller.
 */
export async function smallTargetsByState(
  page: Page,
  mapPage: MapPage,
): Promise<Map<string, readonly string[]>> {
  const found = new Map<string, readonly string[]>();
  for (const state of CHROME_STATES) {
    await enterState(mapPage, state);
    await waitForStableLayout(page);
    found.set(state, targetNames((await inspectControls(page)).under44));
    await leaveState(mapPage, state);
  }
  return found;
}
