// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type MapPlacement,
  placePath,
  placePoint,
  visibleRuns,
} from "../globe/placement";
import type { LatLng, PixelPoint } from "../ports/geometry";
import type { MapEditHandleKind } from "../ports/map";
import { shapeRing } from "./shape";
import type { DrawShape } from "./types";

/** Reach, in CSS pixels, of a handle for a mouse or pen. */
export const HANDLE_HIT_RADIUS_MOUSE_PX = 12;

/** Reach, in CSS pixels, of a handle for a finger: a 44 px target. */
export const HANDLE_HIT_RADIUS_TOUCH_PX = 22;

/** A handle that has been placed on the screen. */
export interface ProjectedHandle {
  readonly id: string;
  readonly point: PixelPoint;
  readonly kind: MapEditHandleKind;
}

const KIND_PRIORITY: Readonly<Record<MapEditHandleKind, number>> = {
  vertex: 2,
  radius: 1,
  midpoint: 0,
};

/**
 * The handle a press at `at` lands on: the nearest within `tolerancePx`. At
 * equal distance a vertex beats a radius handle, which beats a midpoint, and
 * the later handle (drawn on top) beats an earlier one. Both map adapters use
 * this, so a press means the same thing on either.
 */
export function hitTestHandle(
  handles: readonly ProjectedHandle[],
  at: PixelPoint,
  tolerancePx: number,
): ProjectedHandle | null {
  let best: ProjectedHandle | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const handle of handles) {
    const distance = Math.hypot(handle.point.x - at.x, handle.point.y - at.y);
    if (distance > tolerancePx) {
      continue;
    }
    const closer = distance < bestDistance;
    const tied =
      distance === bestDistance &&
      best !== null &&
      KIND_PRIORITY[handle.kind] >= KIND_PRIORITY[best.kind];
    if (closer || tied) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}

function distanceToSegment(
  at: PixelPoint,
  a: PixelPoint,
  b: PixelPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / lengthSquared),
        );
  return Math.hypot(at.x - (a.x + t * dx), at.y - (a.y + t * dy));
}

function nearPath(
  at: PixelPoint,
  path: readonly PixelPoint[],
  tolerancePx: number,
): boolean {
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1] as PixelPoint;
    const b = path[index] as PixelPoint;
    if (distanceToSegment(at, a, b) <= tolerancePx) {
      return true;
    }
  }
  return false;
}

function insideRing(at: PixelPoint, ring: readonly PixelPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] as PixelPoint;
    const b = ring[j] as PixelPoint;
    if (
      a.y > at.y !== b.y > at.y &&
      at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** The ring a shape's interior is tested against, or null for a shape with none. */
function hitRing(shape: DrawShape): readonly LatLng[] | null {
  if (shape.kind === "circle" && shape.radiusMetres !== undefined) {
    return shapeRing(shape);
  }
  if (shape.kind === "polygon" && shape.vertices.length >= 3) {
    return shape.vertices;
  }
  return null;
}

function hits(
  shape: DrawShape,
  at: PixelPoint,
  placement: MapPlacement,
  tolerancePx: number,
  interior: boolean,
): boolean {
  const { vertices } = shape;
  const first = vertices[0];
  if (!first) {
    return false;
  }
  const ring = hitRing(shape);
  if (ring) {
    const path = placePath(ring, true, placement);
    if (interior && path.whole && insideRing(at, path.pixels)) {
      return true;
    }
    return visibleRuns(path).some((run) => nearPath(at, run, tolerancePx));
  }
  if (vertices.length >= 2) {
    return visibleRuns(placePath(vertices, false, placement)).some((run) =>
      nearPath(at, run, tolerancePx),
    );
  }
  const point = placePoint(first, placement);
  return (
    point !== null && Math.hypot(at.x - point.x, at.y - point.y) <= tolerancePx
  );
}

/**
 * The id of the topmost shape a tap at `at` lands on, or null. Later shapes
 * are on top. A line, a point and the edge of a polygon or circle are hit
 * within `tolerancePx`; with `interior` (the default) the inside of a polygon
 * or circle is hit too, and without it a tap inside an area passes through,
 * so a new shape can be started there.
 * @param placement - How the overlay places shapes on the screen, so a tap
 *   meets the same curves, the same copy of the world and the same horizon
 *   as the drawing. Nothing beyond the horizon of a globe is hit, and an
 *   area's inside counts only while all of its outline is in sight.
 */
export function pickShape(
  shapes: readonly DrawShape[],
  at: PixelPoint,
  placement: MapPlacement,
  tolerancePx: number,
  interior = true,
): string | null {
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index] as DrawShape;
    if (hits(shape, at, placement, tolerancePx, interior)) {
      return shape.id;
    }
  }
  return null;
}
