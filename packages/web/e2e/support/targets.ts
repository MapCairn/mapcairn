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

/** The smallest touch target and the least space between two, in CSS pixels (WCAG 2.2 and the issue's rule). */
export const MIN_TARGET_PX = 44;
const MIN_GAP_PX = 8;

/** What {@link measureChromeTargets} found; each list is empty when the chrome is sound. */
export interface TargetReport {
  readonly small: readonly string[];
  readonly crowded: readonly string[];
  readonly checked: number;
}

/**
 * Measures every shown button, link and field in the floating chrome (the
 * search pill, the map controls and the end stack): each must be at least
 * 44 by 44 px and, where two sit apart, at least 8 px from their nearest
 * neighbour. Controls that touch are one group (the map controls and the
 * zoom pair share an edge by design), so only a gap that is open but under
 * 8 px fails. The sheet is left to its own specs, and the credits popover's
 * provider-required text links are attribution text, not controls.
 */
export function measureChromeTargets(
  page: Page,
  root = "[data-chrome]",
): Promise<TargetReport> {
  return page.evaluate(
    ({ minTarget, minGap, scope }) => {
      const selector = `${scope} :is(button, a[href], input, select, [role='button'])`;
      const shown = [...document.querySelectorAll<HTMLElement>(selector)]
        .filter(
          (element) =>
            !element.closest(
              "[hidden], [inert], [data-chrome='attribution-popover']",
            ),
        )
        .map((element) => ({
          element,
          rect: element.getBoundingClientRect(),
        }))
        .filter(({ rect }) => rect.width > 2 && rect.height > 2);
      const name = (element: HTMLElement) =>
        element.getAttribute("aria-label") ||
        element.textContent?.trim() ||
        element.tagName.toLowerCase();
      const small = shown
        .filter(
          ({ rect }) =>
            rect.width < minTarget - 0.5 || rect.height < minTarget - 0.5,
        )
        .map(
          ({ element, rect }) =>
            `${name(element)} is ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
      const crowded: string[] = [];
      for (const [index, a] of shown.entries()) {
        for (const b of shown.slice(index + 1)) {
          if (a.element.contains(b.element) || b.element.contains(a.element)) {
            continue;
          }
          const dx = Math.max(
            a.rect.left - b.rect.right,
            b.rect.left - a.rect.right,
          );
          const dy = Math.max(
            a.rect.top - b.rect.bottom,
            b.rect.top - a.rect.bottom,
          );
          const gap = Math.max(dx, dy);
          if (gap > 0.5 && gap < minGap - 0.5) {
            crowded.push(
              `${name(a.element)} and ${name(b.element)}: ${Math.round(gap)} px`,
            );
          }
        }
      }
      return { small, crowded, checked: shown.length };
    },
    { minTarget: MIN_TARGET_PX, minGap: MIN_GAP_PX, scope: root },
  );
}
