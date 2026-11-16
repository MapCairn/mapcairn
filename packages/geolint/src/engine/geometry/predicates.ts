// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { orient2d } from "robust-predicates";

/** A position as longitude and latitude (extra elements, such as altitude, are ignored). */
export type Position = readonly number[];

function x(position: Position): number {
  return position[0] ?? 0;
}

function y(position: Position): number {
  return position[1] ?? 0;
}

/**
 * Which side of the directed line from `a` to `b` the point `c` lies on, using
 * Shewchuk's adaptive exact arithmetic, so the answer is right for any finite
 * input (no epsilon, no rounding surprises).
 *
 * Longitude is x and latitude is y. Returns 1 when `a`, `b`, `c` turn
 * counter-clockwise (`c` is to the left), -1 when they turn clockwise and 0
 * when they are exactly collinear. `robust-predicates` reports the opposite
 * sign, so its result is negated here and nowhere else.
 */
export function orientation(a: Position, b: Position, c: Position): -1 | 0 | 1 {
  const value = orient2d(x(a), y(a), x(b), y(b), x(c), y(c));
  if (value < 0) {
    return 1;
  }
  return value > 0 ? -1 : 0;
}

/** Whether two positions have exactly the same longitude and latitude. */
export function samePosition(a: Position, b: Position): boolean {
  return x(a) === x(b) && y(a) === y(b);
}

/**
 * Whether the point `p` lies on the closed segment from `a` to `b`: exactly
 * collinear (by the robust predicate) and inside the segment's bounding box.
 */
export function onSegment(a: Position, b: Position, p: Position): boolean {
  if (orientation(a, b, p) !== 0) {
    return false;
  }
  return (
    Math.min(x(a), x(b)) <= x(p) &&
    x(p) <= Math.max(x(a), x(b)) &&
    Math.min(y(a), y(b)) <= y(p) &&
    y(p) <= Math.max(y(a), y(b))
  );
}

/** The vertices of a ring without the closing position, when it repeats the first. */
function openVertices(ring: readonly Position[]): readonly Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    ring.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    samePosition(first, last)
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

/** The index of the lowest vertex, and the left-most of those, which is always on the convex hull. */
function extremeVertex(vertices: readonly Position[]): number {
  let lowest = 0;
  for (let i = 1; i < vertices.length; i++) {
    const candidate = vertices[i] as Position;
    const best = vertices[lowest] as Position;
    if (
      y(candidate) < y(best) ||
      (y(candidate) === y(best) && x(candidate) < x(best))
    ) {
      lowest = i;
    }
  }
  return lowest;
}

/** The nearest vertex from `from` that is not the same point, walking by `direction` (1 or -1). */
function neighbour(
  vertices: readonly Position[],
  from: number,
  direction: 1 | -1,
): Position | undefined {
  const count = vertices.length;
  const at = vertices[from] as Position;
  for (let step = 1; step < count; step++) {
    const candidate = vertices[
      (from + direction * step + count * step) % count
    ] as Position;
    if (!samePosition(candidate, at)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * The winding of a simple ring: 1 counter-clockwise, -1 clockwise, 0 when it
 * has no area (fewer than three distinct vertices, or all collinear).
 *
 * It turns at the lowest, then left-most, vertex, which is always on the convex
 * hull, using the robust predicate with the nearest neighbours that are not the
 * same point. That gives the right answer for a ring so thin that the shoelace
 * sum rounds to zero. A ring that crosses itself has no single winding, and for
 * one this reports the turn at the extreme vertex.
 */
export function ringOrientation(ring: readonly Position[]): -1 | 0 | 1 {
  const vertices = openVertices(ring);
  if (vertices.length < 3) {
    return 0;
  }
  const lowest = extremeVertex(vertices);
  const previous = neighbour(vertices, lowest, -1);
  const next = neighbour(vertices, lowest, 1);
  if (previous === undefined || next === undefined) {
    return 0;
  }
  return orientation(previous, vertices[lowest] as Position, next);
}
