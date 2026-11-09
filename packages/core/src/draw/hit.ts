import type { LatLng, PixelPoint } from "../ports/geometry";
import type { MapEditHandleKind } from "../ports/map";
import { destinationPoint } from "./geo";
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
  closed: boolean,
  tolerancePx: number,
): boolean {
  const count = closed ? path.length : path.length - 1;
  for (let index = 0; index < count; index += 1) {
    const a = path[index] as PixelPoint;
    const b = path[(index + 1) % path.length] as PixelPoint;
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

function hits(
  shape: DrawShape,
  at: PixelPoint,
  project: (position: LatLng) => PixelPoint,
  tolerancePx: number,
): boolean {
  const pixels = shape.vertices.map(project);
  const first = pixels[0];
  if (!first) {
    return false;
  }
  if (shape.kind === "polygon" && pixels.length >= 3) {
    return insideRing(at, pixels) || nearPath(at, pixels, true, tolerancePx);
  }
  if (shape.kind === "circle" && shape.radiusMetres !== undefined) {
    const centre = shape.vertices[0] as LatLng;
    const edge = project(destinationPoint(centre, 90, shape.radiusMetres));
    return (
      Math.hypot(at.x - first.x, at.y - first.y) <=
      Math.hypot(edge.x - first.x, edge.y - first.y) + tolerancePx
    );
  }
  if (pixels.length >= 2) {
    return nearPath(at, pixels, false, tolerancePx);
  }
  return Math.hypot(at.x - first.x, at.y - first.y) <= tolerancePx;
}

/**
 * The id of the topmost shape a tap at `at` lands on, or null. Later shapes
 * are on top. A polygon or circle is hit anywhere inside or near its edge, a
 * line near it and a point near it, within `tolerancePx`.
 * @param project - Places a position on the screen, the map's `project`.
 */
export function pickShape(
  shapes: readonly DrawShape[],
  at: PixelPoint,
  project: (position: LatLng) => PixelPoint,
  tolerancePx: number,
): string | null {
  for (let index = shapes.length - 1; index >= 0; index -= 1) {
    const shape = shapes[index] as DrawShape;
    if (hits(shape, at, project, tolerancePx)) {
      return shape.id;
    }
  }
  return null;
}
