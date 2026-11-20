// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  HandleGesture,
  HandlePointer,
  MapEditHandle,
  MapEvents,
} from "@mapcairn/core";
import {
  dragHandle,
  handleReach,
  hitTestHandle,
  type MapPlacement,
  placePoint,
  pressHandle,
} from "@mapcairn/core";
import { positionOf } from "./positionOf";

/** The parts of a MapLibre mouse or touch event the edit handle gestures read. */
export interface PointerLikeEvent {
  readonly point: { readonly x: number; readonly y: number };
  readonly lngLat: { readonly lat: number; readonly lng: number };
  preventDefault(): void;
}

/** What the controller reads from, and reports to, the adapter that owns the map. */
export interface EditHandleHost {
  /** How the ui places its overlay marks, so a press lands on the handle the overlay draws. */
  placement(): MapPlacement;
  /** Reports a step of a drag to the ui as `handleDrag`. */
  emitDrag(drag: MapEvents["handleDrag"]): void;
  /** Reports the handle under the mouse, or none, to the ui as `handleHover`. */
  emitHover(id: MapEvents["handleHover"]): void;
}

/**
 * Turns the pointer events on the map into the edit handle events of the
 * port. The handles live here, not in the engine's style, so a basemap swap
 * keeps them. A press on a handle is the handle's: the engine is told not to
 * start a pan or rotate for it, and the click that follows is dropped.
 */
export class EditHandleController {
  /** The edit handles the ui last set. */
  private handles: readonly MapEditHandle[] = [];
  /** The press on an edit handle that has not been released. */
  private gesture: HandleGesture | null = null;
  private hovered: string | null = null;
  /** True after a press on a handle ends, until the next press: the click that follows it is dropped. */
  private swallowClick = false;

  constructor(private readonly host: EditHandleHost) {}

  /** Replaces the handles; a hover over one that is gone ends. */
  setHandles(handles: readonly MapEditHandle[]): void {
    this.handles = [...handles];
    if (
      this.hovered !== null &&
      !this.handles.some((handle) => handle.id === this.hovered)
    ) {
      this.hovered = null;
      this.host.emitHover(null);
    }
  }

  /**
   * A press on the map. When it lands on an edit handle it is the handle's:
   * `preventDefault` stops MapLibre starting a pan or rotate for this press,
   * and the click that follows it is dropped.
   */
  press(event: PointerLikeEvent, pointer: HandlePointer): void {
    this.swallowClick = false;
    this.gesture = pressHandle(
      this.projectedHandles(),
      { x: event.point.x, y: event.point.y },
      pointer,
    );
    if (!this.gesture) {
      return;
    }
    event.preventDefault();
    this.host.emitDrag({
      id: this.gesture.id,
      phase: "start",
      latlng: positionOf(event.lngLat),
      moved: false,
    });
  }

  /** The pointer moving: a drag of the pressed handle, or, for the mouse, the hover over one. */
  move(event: PointerLikeEvent, pointer: HandlePointer): void {
    const point = { x: event.point.x, y: event.point.y };
    if (this.gesture) {
      this.gesture = dragHandle(this.gesture, point);
      if (this.gesture.moved) {
        this.host.emitDrag({
          id: this.gesture.id,
          phase: "move",
          latlng: positionOf(event.lngLat),
          moved: true,
        });
      }
      return;
    }
    if (pointer !== "mouse" || this.handles.length === 0) {
      return;
    }
    const id =
      hitTestHandle(this.projectedHandles(), point, handleReach("mouse"))?.id ??
      null;
    if (id !== this.hovered) {
      this.hovered = id;
      this.host.emitHover(id);
    }
  }

  /** The pointer going up, or the touch being cancelled: ends the press in progress. */
  release(event: PointerLikeEvent): void {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) {
      return;
    }
    this.swallowClick = true;
    this.host.emitDrag({
      id: gesture.id,
      phase: "end",
      latlng: positionOf(event.lngLat),
      moved: gesture.moved,
    });
  }

  /**
   * Whether a click is the one that follows a press on a handle, and so is
   * dropped. Asking clears it, so only that one click is dropped.
   */
  dropsClick(): boolean {
    const drops = this.swallowClick;
    this.swallowClick = false;
    return drops;
  }

  /** Forgets the press in progress and the hover, when the map goes away. */
  reset(): void {
    this.gesture = null;
    this.hovered = null;
  }

  /** The handles that can be pressed: each where the overlay draws it, none beyond the horizon. */
  private projectedHandles() {
    const placement = this.host.placement();
    return this.handles.flatMap((handle) => {
      const point = placePoint(handle.position, placement);
      return point ? [{ id: handle.id, kind: handle.kind, point }] : [];
    });
  }
}
