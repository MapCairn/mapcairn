import {
  type ChromeLayout,
  computeDetentHeights,
  type MapFitOptions,
  type SheetDetent,
} from "@mapcairn/core";

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
  /** The open side panel's right edge, in pixels from the left, once it has published one. */
  readonly panelEdge: number | null;
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
  const { layout, viewport, panelEdge } = geometry;
  const padding: Padding =
    layout === "panel"
      ? { top: 0, right: 0, bottom: 0, left: panelEdge ?? 0 }
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
 * Fit padding that keeps a result clear of the sheet (at {@link REVEAL_DETENT})
 * or the side panel, and of the search pill and the end stack, so a route or
 * imported shapes are drawn where they can be seen.
 */
export function fitPadding(geometry: RevealGeometry): Padding {
  const covered = coveredPadding(geometry);
  return {
    top: (covered?.top ?? 0) + FIT_CLEARANCE_TOP_PX,
    right: (covered?.right ?? 0) + FIT_CLEARANCE_END_PX,
    bottom: (covered?.bottom ?? 0) + FIT_CLEARANCE_PX,
    left: (covered?.left ?? 0) + FIT_CLEARANCE_PX,
  };
}
