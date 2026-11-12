// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

function span(bounds: Bounds): number {
  return Math.max(bounds.east - bounds.west, bounds.north - bounds.south);
}

/**
 * The box a query layer asks for when the map shows `view`: the view with a
 * margin, snapped outward to a grid in proportion to its size. A few pixels
 * of panning give the same window, so they send the same request (and the
 * same cache entry), and a small pan stays inside the window and needs none.
 * Latitudes and longitudes are kept within what a map shows.
 */
export function queryWindow(view: Bounds): Bounds {
  const size = Math.max(span(view), MIN_SPAN);
  const margin = size * MARGIN;
  const step = 10 ** Math.floor(Math.log10(size)) / 2;
  const down = (value: number) => Math.floor(value / step) * step;
  const up = (value: number) => Math.ceil(value / step) * step;
  return {
    west: round(clamp(down(view.west - margin), -180, 180)),
    south: round(clamp(down(view.south - margin), -MAX_LATITUDE, MAX_LATITUDE)),
    east: round(clamp(up(view.east + margin), -180, 180)),
    north: round(clamp(up(view.north + margin), -MAX_LATITUDE, MAX_LATITUDE)),
  };
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.west <= inner.west &&
    outer.south <= inner.south &&
    outer.east >= inner.east &&
    outer.north >= inner.north
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
    contains(previous, view) &&
    span(previous) <= MAX_WINDOW_RATIO * Math.max(span(view), MIN_SPAN)
  ) {
    return previous;
  }
  return queryWindow(view);
}
