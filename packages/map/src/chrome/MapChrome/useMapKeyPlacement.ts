// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type RefObject, useLayoutEffect } from "react";
import { CHROME_GAP_PX } from "../chromeSpacing";
import { chromeVars } from "./chromeVars";

/**
 * The least room, in CSS pixels, the map key needs to show: its minimised
 * chip, a 44 px target inside the panel's 1 px border, rounded up to the 48 px
 * control size. With less, the key's slot gives way.
 */
const MAP_KEY_MIN_ROOM_PX = 48;

/** The edges the map key is placed from, in px from the chrome container's top. */
export interface MapKeyMeasurements {
  /** Bottom edge of the key's slot before any shift, or null while it has no size. */
  readonly mapKeyBottom: number | null;
  /** Top of the bottom row before any lift. */
  readonly bottomRowTop: number;
  /** Bottom edge of the search pill's slot. */
  readonly topStartBottom: number;
}

/** What {@link placeMapKey} works out. */
export interface MapKeyPlacement {
  /** The most the key may be tall: the room between its top and bottom edges. */
  readonly room: number;
  /** How far its resting place must move, negative is up, to put its bottom edge there. */
  readonly shift: number;
}

/**
 * Where the map key sits and how tall it may be. Its bottom edge rides a gap
 * above the bottom row once that row has been lifted by `lift` (zero or
 * negative); its top stays a gap below the search pill, or below the tour card
 * while `tourBottom` says one shows. Null while the key has no size.
 *
 * @remarks The shift is measured from where the grid rests the key, not
 *   taken from the bottom row's lift, because a taller bottom row (a toolbar)
 *   has already moved the resting place.
 */
export function placeMapKey(
  m: MapKeyMeasurements,
  lift: number,
  tourBottom: number | null,
): MapKeyPlacement | null {
  if (m.mapKeyBottom === null) {
    return null;
  }
  const bottomEdge = m.bottomRowTop + lift - CHROME_GAP_PX;
  const topEdge = Math.max(m.topStartBottom, tourBottom ?? 0) + CHROME_GAP_PX;
  return {
    room: Math.max(0, bottomEdge - topEdge),
    shift: bottomEdge - m.mapKeyBottom,
  };
}

/**
 * Writes the map key's height cap and shift onto the chrome root, and says
 * whether the key has too little room to show.
 *
 * @param placement - From {@link placeMapKey}, or null while the key has no size.
 * @returns True when the room is smaller than the key's chip.
 */
export function useMapKeyPlacement(
  rootRef: RefObject<HTMLElement | null>,
  placement: MapKeyPlacement | null,
): boolean {
  const room = placement?.room ?? null;
  const shift = placement?.shift ?? null;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || room === null || shift === null) {
      return;
    }
    // A key that has given way keeps the height of its chip, so its slot
    // still measures and it can come back when the room does.
    const cap = Math.max(MAP_KEY_MIN_ROOM_PX, room);
    root.style.setProperty(chromeVars.mapKeyRoom, `${cap}px`);
    root.style.setProperty(chromeVars.mapKeyLift, `${shift}px`);
  }, [rootRef, room, shift]);
  return room !== null && room < MAP_KEY_MIN_ROOM_PX;
}
