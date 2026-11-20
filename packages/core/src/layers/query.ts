// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { wrapLongitude } from "../globe/longitude";
import { clamp } from "../numbers/clamp";
import type { Bounds } from "../ports/geometry";

/** The furthest latitude a Web Mercator map shows. */
const MAX_LATITUDE = 85;

/** The smallest span, in degrees, worked with, so a zero-size view still has a window. */
const MIN_SPAN = 1e-4;

/** How much wider than the view a window is on each side, as a share of the view. */
const MARGIN = 0.2;

/** The most times larger than the view a window may be before a new one is taken. */
const MAX_WINDOW_RATIO = 4;

function round(value: number): number {
  return Number(value.toFixed(5));
}

/** The width of the circle of longitude, in degrees. */
const TURN = 360;

function span(bounds: Bounds): number {
  return Math.max(bounds.east - bounds.west, bounds.north - bounds.south);
}

/**
 * `bounds` as the short box: a width of a turn or more is the whole circle,
 * and any other has `west` inside -180 to 180 and `east` past 180 when it
 * crosses the antimeridian (a map reports such a view as 170 to 190, or as
 * -190 to -170, and both mean the same).
 */
function shortBox(bounds: Bounds): Bounds {
  if (bounds.east - bounds.west >= TURN) {
    return { ...bounds, west: -180, east: 180 };
  }
  const west = wrapLongitude(bounds.west);
  return { ...bounds, west, east: west + (bounds.east - bounds.west) };
}

/**
 * The box a query layer asks for when the map shows `view`: the view with a
 * margin, snapped outward to a grid in proportion to its size. A few pixels
 * of panning give the same window, so they send the same request (and the
 * same cache entry), and a small pan stays inside the window and needs none.
 * Latitudes are kept within what a map shows, and longitudes within -180 to
 * 180, except that a view across the antimeridian gets a window across it:
 * the short box, with `west` inside -180 to 180 and `east` past 180 (see
 * `queryBoxes` for the boxes to ask a provider). A view that does not cross
 * the line gets a window that stops at it, margin or not.
 */
export function queryWindow(view: Bounds): Bounds {
  const short = shortBox(view);
  const size = Math.max(span(short), MIN_SPAN);
  const margin = size * MARGIN;
  const step = 10 ** Math.floor(Math.log10(size)) / 2;
  const down = (value: number) => Math.floor(value / step) * step;
  const up = (value: number) => Math.ceil(value / step) * step;
  const south = round(
    clamp(down(short.south - margin), -MAX_LATITUDE, MAX_LATITUDE),
  );
  const north = round(
    clamp(up(short.north + margin), -MAX_LATITUDE, MAX_LATITUDE),
  );
  if (short.east > 180) {
    const width = up(short.east + margin) - down(short.west - margin);
    if (width < TURN) {
      const west = wrapLongitude(down(short.west - margin));
      return { west: round(west), south, east: round(west + width), north };
    }
    return { west: -180, south, east: 180, north };
  }
  return {
    west: round(clamp(down(short.west - margin), -180, 180)),
    south,
    east: round(clamp(up(short.east + margin), -180, 180)),
    north,
  };
}

/**
 * The boxes to ask a provider for `window`, each inside -180 to 180: the
 * window itself, or when it crosses the antimeridian (`east` past 180) the
 * part from `west` to 180 and then the part from -180 to the rest. The
 * boxes meet at the line and cover the window exactly.
 */
export function queryBoxes(window: Bounds): Bounds[] {
  const short = shortBox(window);
  if (short.east <= 180) {
    return [short];
  }
  return [
    { ...short, east: 180 },
    { ...short, west: -180, east: round(short.east - TURN) },
  ];
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.west <= inner.west &&
    outer.south <= inner.south &&
    outer.east >= inner.east &&
    outer.north >= inner.north
  );
}

/** Whether `outer` holds `view` in its own copy of the world or the one east of it. */
function containsView(outer: Bounds, view: Bounds): boolean {
  const short = shortBox(view);
  return (
    contains(outer, short) ||
    contains(outer, {
      ...short,
      west: short.west + TURN,
      east: short.east + TURN,
    })
  );
}

/**
 * The window a query layer should have for `view`: the last one while the
 * view is still inside it and not much smaller than it, otherwise a new one.
 * Panning a little or zooming in a little then costs no request, and zooming
 * in far asks for a smaller area, so fewer features and less data.
 */
export function nextQueryWindow(previous: Bounds | null, view: Bounds): Bounds {
  if (
    previous &&
    containsView(previous, view) &&
    span(previous) <= MAX_WINDOW_RATIO * Math.max(span(view), MIN_SPAN)
  ) {
    return previous;
  }
  return queryWindow(view);
}
