// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Page } from "@playwright/test";

/** A floating element's visible box, as the collision check sees it. */
export interface ChromeBox {
  /** Its `data-chrome` name. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What {@link inspectChromeLayout} found. The three problem lists are empty when the layout is sound. */
export interface ChromeLayoutReport {
  /** Every floating element that is shown, clipped to what can be seen, for diagnosis. */
  readonly boxes: readonly ChromeBox[];
  /** Pairs of shown floating elements that overlap (neither contains the other). */
  readonly overlaps: readonly string[];
  /** Shown floating elements that reach outside the viewport. */
  readonly outside: readonly string[];
  /** Controls in the chrome whose visible centre hits something else. */
  readonly obscured: readonly string[];
  /** Zoom buttons that were on screen and checked with `elementFromPoint`. */
  readonly zoomButtonsChecked: number;
  /** Zoom buttons scrolled out of view inside the end stack (reachable by scrolling or Tab). */
  readonly zoomButtonsScrolledAway: number;
}

/**
 * Collects every shown `[data-chrome]` element and checks the layout rules
 * from DESIGN.md ("neighbours push apart instead of overlapping"):
 *
 * - No two shown floating elements overlap, unless one contains the other
 *   (slot wrappers contain their content, the search pill its results).
 * - None reaches outside the viewport. The one documented exception is the
 *   bottom sheet, which is a full-height surface translated down so only its
 *   detent shows: it may extend below the bottom edge.
 * - Every control outside the sheet is the element hit at the centre of its
 *   visible part, so nothing (for example the credits popover) covers it.
 *
 * @remarks Boxes are clipped to their scrolling ancestors first. The end
 *   stack and the credits popover are scroll containers capped at the room
 *   `MapChrome` measured (DESIGN.md: an explicit "show zoom buttons" scrolls
 *   rather than hides), so content scrolled out of them is not on screen and
 *   cannot collide; such zoom buttons are counted as scrolled away.
 *
 *   "Shown" means laid out with a size, not `hidden`, not
 *   `visibility: hidden` or `display: none`, and not the closed sheet.
 *   Opacity is deliberately not a reason to skip: the scale bar fades when
 *   idle and comes back without any layout change, so it must still fit.
 *   Sub-pixel slivers (half a pixel or less) are ignored.
 */
export function inspectChromeLayout(page: Page): Promise<ChromeLayoutReport> {
  return page.evaluate(() => {
    const EPSILON = 0.5;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    interface Box {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }

    /** The part of an element not clipped by a scrolling or clipping ancestor. */
    const visibleBox = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      const box: Box = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
      for (
        let ancestor = element.parentElement;
        ancestor && ancestor !== document.body;
        ancestor = ancestor.parentElement
      ) {
        const style = getComputedStyle(ancestor);
        if (style.overflowX === "visible" && style.overflowY === "visible") {
          continue;
        }
        const clip = ancestor.getBoundingClientRect();
        box.left = Math.max(box.left, clip.left + ancestor.clientLeft);
        box.top = Math.max(box.top, clip.top + ancestor.clientTop);
        box.right = Math.min(
          box.right,
          clip.left + ancestor.clientLeft + ancestor.clientWidth,
        );
        box.bottom = Math.min(
          box.bottom,
          clip.top + ancestor.clientTop + ancestor.clientHeight,
        );
      }
      return box;
    };
    const hasArea = (box: Box) =>
      box.right - box.left > EPSILON && box.bottom - box.top > EPSILON;

    const shown = [
      ...document.querySelectorAll<HTMLElement>("[data-chrome]"),
    ].filter(
      (element) =>
        hasArea(visibleBox(element)) &&
        element.closest("[hidden]") === null &&
        element.closest('[data-chrome="sheet"][data-state="closed"]') ===
          null &&
        element.checkVisibility({ visibilityProperty: true }),
    );
    const describeElement = (element: HTMLElement) =>
      element.dataset.chrome ?? element.tagName;
    const boxes = shown.map((element) => {
      const box = visibleBox(element);
      return {
        name: describeElement(element),
        x: Math.round(box.left),
        y: Math.round(box.top),
        width: Math.round(box.right - box.left),
        height: Math.round(box.bottom - box.top),
      };
    });

    /** How much of two elements' visible boxes overlap on screen, or null. */
    const overlapOf = (a: HTMLElement, b: HTMLElement): string | null => {
      if (a.contains(b) || b.contains(a)) {
        return null;
      }
      const ra = visibleBox(a);
      const rb = visibleBox(b);
      // Only the part on screen counts: a sheet below the fold overlaps nothing there.
      const width =
        Math.min(ra.right, rb.right, viewportWidth) -
        Math.max(ra.left, rb.left, 0);
      const height =
        Math.min(ra.bottom, rb.bottom, viewportHeight) -
        Math.max(ra.top, rb.top, 0);
      return width > EPSILON && height > EPSILON
        ? `${describeElement(a)} overlaps ${describeElement(b)} by ${Math.round(width)}x${Math.round(height)}`
        : null;
    };
    const overlaps = shown.flatMap((a, i) =>
      shown
        .slice(i + 1)
        .map((b) => overlapOf(a, b))
        .filter((found): found is string => found !== null),
    );

    /** Where an element leaves the viewport, or null when it stays inside. */
    const outsideOf = (element: HTMLElement): string | null => {
      const box = visibleBox(element);
      const isBottomSheet =
        element.closest('[data-chrome="sheet"][data-layout="sheet"]') !== null;
      const below = box.bottom > viewportHeight + EPSILON && !isBottomSheet;
      const leaves =
        box.left < -EPSILON ||
        box.top < -EPSILON ||
        box.right > viewportWidth + EPSILON ||
        below;
      return leaves
        ? `${describeElement(element)} at ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)} in ${viewportWidth}x${viewportHeight}`
        : null;
    };
    const outside = shown
      .map(outsideOf)
      .filter((found): found is string => found !== null);

    const obscured: string[] = [];
    let zoomButtonsChecked = 0;
    let zoomButtonsScrolledAway = 0;
    const controls = shown
      .filter((element) => element.closest('[data-chrome="sheet"]') === null)
      .flatMap((element) => [
        ...element.querySelectorAll<HTMLElement>(
          "button, a[href], input, [role='option']",
        ),
      ]);
    /** Checks one control: on screen and the element under its visible centre. */
    const checkControl = (control: HTMLElement) => {
      if (!control.checkVisibility({ visibilityProperty: true })) {
        return;
      }
      const label =
        control.getAttribute("aria-label") ??
        control.textContent?.trim() ??
        control.tagName;
      const isZoom = label === "Zoom in" || label === "Zoom out";
      const box = visibleBox(control);
      if (!hasArea(box)) {
        if (isZoom) {
          zoomButtonsScrolledAway += 1;
        }
        return;
      }
      const x = (box.left + box.right) / 2;
      const y = (box.top + box.bottom) / 2;
      if (x < 0 || y < 0 || x > viewportWidth || y > viewportHeight) {
        return;
      }
      if (isZoom) {
        zoomButtonsChecked += 1;
      }
      const hit = document.elementFromPoint(x, y);
      if (!(hit && control.contains(hit))) {
        const hitChrome = hit?.closest<HTMLElement>("[data-chrome]");
        obscured.push(
          `${label} is covered by ${hitChrome?.dataset.chrome ?? hit?.tagName ?? "nothing"}`,
        );
      }
    };
    for (const control of new Set(controls)) {
      checkControl(control);
    }

    return {
      boxes,
      overlaps,
      outside,
      obscured,
      zoomButtonsChecked,
      zoomButtonsScrolledAway,
    };
  });
}
