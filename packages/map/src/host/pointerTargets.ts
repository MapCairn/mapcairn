// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * The `data-chrome` name of the cursor readout. `MapReadout` carries it, and
 * {@link usePointerPosition} keeps the last position when the pointer leaves
 * the map for an element inside it.
 */
export const CURSOR_READOUT_CHROME = "map-readout";

/** Matches the attribute `MapView` puts on its map host element. */
const MAP_HOST_SELECTOR = "[data-map-host]";

/** Matches the cursor readout. */
const CURSOR_READOUT_SELECTOR = `[data-chrome="${CURSOR_READOUT_CHROME}"]`;

/** Whether a pointer event's other target is inside the map host. */
export function isMapHost(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest(MAP_HOST_SELECTOR) !== null
  );
}

/** Whether a pointer event's other target is inside the cursor readout. */
export function isCursorReadout(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(CURSOR_READOUT_SELECTOR) !== null
  );
}
