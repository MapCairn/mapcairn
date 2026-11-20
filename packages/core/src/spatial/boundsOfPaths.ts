// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { wrapLongitude } from "../globe/longitude";
import { clamp } from "../numbers/clamp";
import type { Bounds, LatLng } from "../ports/geometry";

const TURN = 360;
const ANTIMERIDIAN = TURN / 2;
/** Degrees below which two runs count as touching and a gap as closed, so rounding in a longitude cannot open a hairline gap. */
const GAP_EPSILON = 1e-9;

/** A run of longitude going east from `start` (in [-180, 180)) for `length` degrees. */
interface Arc {
  readonly start: number;
  readonly length: number;
}

function isFinitePoint(point: LatLng): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng);
}

/**
 * The signed longitude step from one vertex to the next, the short way round.
 * An edge of exactly half the globe has no short way, so it goes east, as
 * `nearestLongitude` does for the drawing (`unwrapLongitudes`) and for
 * `measureLineDistance`.
 */
function shortestStep(from: number, to: number): number {
  const step = wrapLongitude(to - from);
  return step === -ANTIMERIDIAN ? ANTIMERIDIAN : step;
}

/** The runs one path covers: each vertex, and each edge taken the short way round. */
function arcsOfPath(path: readonly LatLng[]): Arc[] {
  const arcs: Arc[] = [];
  path.forEach((point, index) => {
    arcs.push({ start: wrapLongitude(point.lng), length: 0 });
    const next = path[index + 1];
    if (!next) {
      return;
    }
    const step = shortestStep(point.lng, next.lng);
    const from = step >= 0 ? point.lng : next.lng;
    arcs.push({ start: wrapLongitude(from), length: Math.abs(step) });
  });
  return arcs;
}

/** Splits a run that passes 180 into the part before it and the part after, so every run lies inside [-180, 180]. */
function withoutWrap(arc: Arc): [number, number][] {
  const end = arc.start + arc.length;
  if (end <= ANTIMERIDIAN) {
    return [[arc.start, end]];
  }
  return [
    [arc.start, ANTIMERIDIAN],
    [-ANTIMERIDIAN, end - TURN],
  ];
}

/** Joins runs that overlap or touch into the fewest runs, in order. */
function mergeRuns(runs: readonly [number, number][]): [number, number][] {
  const merged: [number, number][] = [];
  for (const [start, end] of [...runs].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && start <= last[1] + GAP_EPSILON) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/**
 * The longitude run going east that is left once the widest uncovered gap in
 * the circle is taken out, or the whole circle when nothing is uncovered.
 */
function runOutsideWidestGap(merged: readonly [number, number][]): {
  west: number;
  east: number;
} {
  const first = merged[0] as [number, number];
  const last = merged[merged.length - 1] as [number, number];
  let gap = first[0] + TURN - last[1];
  let run = { west: first[0], east: last[1] };
  for (let index = 1; index < merged.length; index += 1) {
    const before = merged[index - 1] as [number, number];
    const after = merged[index] as [number, number];
    if (after[0] - before[1] > gap) {
      gap = after[0] - before[1];
      run = { west: after[0], east: before[1] + TURN };
    }
  }
  return gap > GAP_EPSILON ? run : { west: -ANTIMERIDIAN, east: ANTIMERIDIAN };
}

/**
 * The smallest latitude and longitude box holding every vertex of every path
 * and every edge between neighbouring vertices of one path, each edge taken
 * the short way round the globe (the way a path is drawn and measured). Used
 * to fit the map to a polygon, a line or a feature with several parts.
 * @param paths The rings and lines of a shape. A ring repeats its first
 *   vertex at the end, as GeoJSON does; no edge joins two paths.
 * @returns `undefined` when no point has finite coordinates.
 * @remarks Longitude is a circle, so the box is the circle less its widest
 *   gap that no vertex or edge covers. A shape wider than half the globe with
 *   few vertices is therefore boxed on the side its edges cover, which
 *   {@link boundsOfPoints} cannot know from vertices alone. A shape that
 *   covers the whole circle, such as a ring round a pole, gives a `west` of
 *   -180 and an `east` of 180. Otherwise the box has the form of
 *   {@link boundsOfPoints}: `west` inside [-180, 180) and `east` not before it,
 *   past 180 across the antimeridian. An edge of exactly half the globe has
 *   no short way and is taken eastward, as it is drawn and measured. Latitudes are clamped to valid
 *   coordinates, and an edge is a straight step in latitude.
 */
export function boundsOfPaths(
  paths: readonly (readonly LatLng[])[],
): Bounds | undefined {
  const usable = paths
    .map((path) => path.filter(isFinitePoint))
    .filter((path) => path.length > 0);
  if (usable.length === 0) {
    return undefined;
  }
  const { west, east } = runOutsideWidestGap(
    mergeRuns(usable.flatMap(arcsOfPath).flatMap(withoutWrap)),
  );
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const { lat } of usable.flat()) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return {
    south: clamp(south, -90, 90),
    west,
    north: clamp(north, -90, 90),
    east,
  };
}
