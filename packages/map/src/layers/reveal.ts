// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ChromeLayout,
  computeDetentHeights,
  type MapFitOptions,
  type SheetDetent,
} from "@mapcairn/core";
import type { ReadingDirection } from "@mapcairn/react";

/**
 * The detent a bottom sheet rests at when a feature is shown, so its card and
 * the map share the screen. The host raises or lowers the sheet to it after
 * "Show on map" and after a tap on a point.
 */
export const REVEAL_DETENT: SheetDetent = "half";

/** How far inside the free part of the map a revealed point must lie, in pixels. */
export const REVEAL_CLEARANCE = 64;

/** What the reveal needs to know about the chrome. */
export interface RevealGeometry {
  readonly layout: ChromeLayout;
  /** The size of the chrome container, which is the map's size. */
  readonly viewport: { readonly width: number; readonly height: number };
  /** The distance from inline-start to the open panel's far edge, once measured. */
  readonly panelEdge: number | null;
  /** The reading direction. Defaults to left to right. */
  readonly direction?: ReadingDirection;
  /**
   * How far up from the map's bottom edge the shown map key reaches, in
   * pixels, or null while no key shows. Only {@link fitPadding} reads it.
   */
  readonly mapKeyClearance?: number | null;
}

type Padding = NonNullable<MapFitOptions["padding"]>;

/** The closest a fit to a result zooms, so a short route or a single point keeps its surroundings. */
export const FIT_MAX_ZOOM = 16;

/**
 * Room kept round a fitted result, in pixels: the search pill above it and the
 * end stack beside it are bigger than the plain margin, so nothing is drawn
 * under them.
 */
const FIT_CLEARANCE_PX = 32;
const FIT_CLEARANCE_TOP_PX = 88;
const FIT_CLEARANCE_END_PX = 80;

/**
 * The part of the map the sheet (at {@link REVEAL_DETENT}) or the side panel
 * covers, as fit padding.
 * @returns `null` while the map has no size, or when the cover would leave no
 *   map to look at.
 */
export function coveredPadding(geometry: RevealGeometry): Padding | null {
  const { layout, viewport, panelEdge, direction = "ltr" } = geometry;
  const padding: Padding =
    layout === "panel"
      ? {
          top: 0,
          right: direction === "rtl" ? (panelEdge ?? 0) : 0,
          bottom: 0,
          left: direction === "ltr" ? (panelEdge ?? 0) : 0,
        }
      : {
          top: 0,
          right: 0,
          bottom: computeDetentHeights({
            viewportHeight: viewport.height,
            insetBottom: 0,
          })[REVEAL_DETENT],
          left: 0,
        };
  const width = viewport.width - padding.left - padding.right;
  const height = viewport.height - padding.top - padding.bottom;
  return width > 0 && height > 0 ? padding : null;
}

/**
 * The middle of the part of the map the sheet (at {@link REVEAL_DETENT}) or
 * the side panel leaves free, in pixels from the map's top left. A tool that
 * works "at the map centre" uses it, so its target is never under the sheet.
 * @returns `null` while the map has no size, so the caller falls back to the
 *   centre of the whole map.
 */
export function freeCentre(
  geometry: RevealGeometry,
): { readonly x: number; readonly y: number } | null {
  const padding = coveredPadding(geometry);
  if (!padding) {
    return null;
  }
  const { width, height } = geometry.viewport;
  return {
    x: (padding.left + width - padding.right) / 2,
    y: (padding.top + height - padding.bottom) / 2,
  };
}

/**
 * How far to pan the map so a point shows clear of the sheet or side panel.
 * @param point - Where the point is now, in pixels from the map's top left.
 * @returns The pan in pixels that puts the point in the middle of the free
 *   part of the map, or `null` when it is already comfortably inside it (a
 *   point that is visible is never moved).
 */
export function revealOffset(
  point: { readonly x: number; readonly y: number },
  geometry: RevealGeometry,
): { readonly dx: number; readonly dy: number } | null {
  const padding = coveredPadding(geometry);
  if (!padding) {
    return null;
  }
  const { width, height } = geometry.viewport;
  const free = {
    left: padding.left,
    top: padding.top,
    right: width - padding.right,
    bottom: height - padding.bottom,
  };
  const roomy =
    free.right - free.left > 2 * REVEAL_CLEARANCE &&
    free.bottom - free.top > 2 * REVEAL_CLEARANCE;
  const margin = roomy ? REVEAL_CLEARANCE : 0;
  const inside =
    point.x >= free.left + margin &&
    point.x <= free.right - margin &&
    point.y >= free.top + margin &&
    point.y <= free.bottom - margin;
  if (inside) {
    return null;
  }
  return {
    dx: point.x - (free.left + free.right) / 2,
    dy: point.y - (free.top + free.bottom) / 2,
  };
}

/**
 * The least map height a fit keeps between its top and bottom padding before
 * it gives up keeping clear of the map key: room for a revealed point with
 * {@link REVEAL_CLEARANCE} above and below it.
 */
const FIT_MIN_MAP_PX = 2 * REVEAL_CLEARANCE;

/**
 * Fit padding that keeps a result clear of the sheet (at {@link REVEAL_DETENT})
 * or the side panel, and of the search pill and the end stack, so a route or
 * imported shapes are drawn where they can be seen. Given a
 * `mapKeyClearance`, it also keeps the result above the map key, where that
 * still leaves {@link FIT_MIN_MAP_PX} of map.
 */
export function fitPadding(geometry: RevealGeometry): Padding {
  const covered = coveredPadding(geometry);
  const rtl = geometry.direction === "rtl";
  const top = (covered?.top ?? 0) + FIT_CLEARANCE_TOP_PX;
  const bottom = (covered?.bottom ?? 0) + FIT_CLEARANCE_PX;
  return {
    top,
    right:
      (covered?.right ?? 0) + (rtl ? FIT_CLEARANCE_PX : FIT_CLEARANCE_END_PX),
    bottom: Math.max(bottom, keyPadding(geometry, top)),
    left:
      (covered?.left ?? 0) + (rtl ? FIT_CLEARANCE_END_PX : FIT_CLEARANCE_PX),
  };
}

/**
 * Bottom padding that keeps a result above the map key, or zero without a
 * key or where it would leave less than {@link FIT_MIN_MAP_PX} under `top`.
 */
function keyPadding(geometry: RevealGeometry, top: number): number {
  if (geometry.mapKeyClearance == null) {
    return 0;
  }
  const bottom = geometry.mapKeyClearance + FIT_CLEARANCE_PX;
  return geometry.viewport.height - top - bottom >= FIT_MIN_MAP_PX ? bottom : 0;
}
