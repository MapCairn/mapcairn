// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors

import type { Position } from "../geometry/predicates.js";
import type { LeafGeometry, PositionRef } from "../geometry/walk.js";
import { isPosition, pointer } from "../json.js";

/** A run of possible positions inside a geometry, and where it is. */
interface Run {
  readonly items: readonly unknown[];
  /** Feature-relative pointer of the array, or of the position itself for a `Point`. */
  readonly pointer: string;
  /** Whether `items` holds the one position of a `Point`, which is not an array element. */
  readonly single: boolean;
}

/** The arrays directly inside `value` as runs, such as the rings of a polygon. */
function runsIn(value: unknown, base: string): Run[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((child: unknown, index: number) =>
    Array.isArray(child)
      ? [{ items: child, pointer: pointer(base, index), single: false }]
      : [],
  );
}

/**
 * The runs of possible positions in a leaf geometry, without checking that
 * they are positions, so that building them costs time in the number of rings
 * and not of vertices.
 */
function runsOf(leaf: LeafGeometry): Run[] {
  const base = pointer(leaf.pointer, "coordinates");
  const { coordinates } = leaf;
  switch (leaf.type) {
    case "Point":
      return [{ items: [coordinates], pointer: base, single: true }];
    case "MultiPoint":
    case "LineString":
      return Array.isArray(coordinates)
        ? [{ items: coordinates, pointer: base, single: false }]
        : [];
    case "MultiLineString":
    case "Polygon":
      return runsIn(coordinates, base);
    case "MultiPolygon":
      return Array.isArray(coordinates)
        ? coordinates.flatMap((polygon: unknown, index: number) =>
            runsIn(polygon, pointer(base, index)),
          )
        : [];
  }
}

function positionAt(run: Run, index: number): PositionRef | undefined {
  const item = run.items[index];
  if (!isPosition(item)) {
    return undefined;
  }
  return {
    position: item,
    pointer: run.single ? run.pointer : pointer(run.pointer, index),
  };
}

/**
 * Every readable position of a leaf geometry, without its pointer, in document
 * order. It reads each position once and builds nothing per position, so it is
 * cheap enough for a bounding box over a very large geometry.
 */
export function* eachPosition(leaf: LeafGeometry): Generator<Position> {
  for (const run of runsOf(leaf)) {
    for (const item of run.items) {
      if (isPosition(item)) {
        yield item;
      }
    }
  }
}

/**
 * At most `limit` readable positions of a leaf geometry, spread evenly over all
 * of it, in document order. A geometry with `limit` positions or fewer is given
 * whole; a larger one is sampled so that the first and the last position are
 * always included. The cost follows `limit`, not the number of vertices.
 * `limit` must be at least 2.
 */
export function samplePositions(
  leaf: LeafGeometry,
  limit: number,
): PositionRef[] {
  const runs = runsOf(leaf);
  const total = runs.reduce((sum, run) => sum + run.items.length, 0);
  const wanted = Math.min(total, limit);
  const sampled: PositionRef[] = [];
  let runIndex = 0;
  let runStart = 0;
  for (let k = 0; k < wanted; k++) {
    const target =
      wanted === total ? k : Math.round((k * (total - 1)) / (wanted - 1));
    let run = runs[runIndex] as Run;
    while (target >= runStart + run.items.length) {
      runStart += run.items.length;
      runIndex += 1;
      run = runs[runIndex] as Run;
    }
    const found = positionAt(run, target - runStart);
    if (found !== undefined) {
      sampled.push(found);
    }
  }
  return sampled;
}
