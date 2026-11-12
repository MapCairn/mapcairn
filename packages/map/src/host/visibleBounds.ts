// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  boundsOfPoints,
  type MapAdapter,
  type MapHostElement,
} from "@mapcairn/core";

/**
 * The latitude and longitude box the map shows now, from its four corners, so
 * a rotated map is covered too. Read it when needed (for example when a
 * search is submitted) rather than on every frame.
 * @returns `undefined` before the map is mounted or while the host has no size.
 */
export function visibleBounds(
  adapter: Pick<MapAdapter, "unproject"> | null,
  host: Pick<MapHostElement, "getBoundingClientRect"> | null,
): Bounds | undefined {
  if (!adapter || !host) {
    return undefined;
  }
  const { width, height } = host.getBoundingClientRect();
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return boundsOfPoints(
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: height },
      { x: width, y: height },
    ].map((corner) => adapter.unproject(corner)),
  );
}
