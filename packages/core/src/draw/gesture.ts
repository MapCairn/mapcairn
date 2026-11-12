// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { PixelPoint } from "../ports/geometry";
import {
  HANDLE_HIT_RADIUS_MOUSE_PX,
  HANDLE_HIT_RADIUS_TOUCH_PX,
  hitTestHandle,
  type ProjectedHandle,
} from "./hit";

/** What is pressing: a mouse or pen, or a finger. */
export type HandlePointer = "mouse" | "touch";

/**
 * How far, in CSS pixels, a pointer may wander after pressing a handle and
 * still count as a tap rather than a drag. A finger is allowed more.
 */
export const HANDLE_CLICK_TOLERANCE_PX: Readonly<
  Record<HandlePointer, number>
> = { mouse: 3, touch: 8 };

/** A press on an edit handle that has not been released. */
export interface HandleGesture {
  readonly id: string;
  /** Where the pointer went down. */
  readonly origin: PixelPoint;
  readonly pointer: HandlePointer;
  /** True once the pointer has left the click tolerance, for good. */
  readonly moved: boolean;
}

/** How far from a handle a press still lands on it. */
export function handleReach(pointer: HandlePointer): number {
  return pointer === "touch"
    ? HANDLE_HIT_RADIUS_TOUCH_PX
    : HANDLE_HIT_RADIUS_MOUSE_PX;
}

/**
 * Starts a gesture when a press at `at` lands on a handle, or returns null
 * for a press on the bare map. Both map adapters use this, so a press means
 * the same on either.
 */
export function pressHandle(
  handles: readonly ProjectedHandle[],
  at: PixelPoint,
  pointer: HandlePointer,
): HandleGesture | null {
  const hit = hitTestHandle(handles, at, handleReach(pointer));
  return hit ? { id: hit.id, origin: at, pointer, moved: false } : null;
}

/** The gesture after the pointer moves to `at`: a drag from then on if it left the tolerance. */
export function dragHandle(
  gesture: HandleGesture,
  at: PixelPoint,
): HandleGesture {
  if (gesture.moved) {
    return gesture;
  }
  const distance = Math.hypot(at.x - gesture.origin.x, at.y - gesture.origin.y);
  return distance > HANDLE_CLICK_TOLERANCE_PX[gesture.pointer]
    ? { ...gesture, moved: true }
    : gesture;
}
