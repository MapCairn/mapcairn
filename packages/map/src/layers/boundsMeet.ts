// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Bounds } from "@mapcairn/core";

const WORLD_DEGREES = 360;

/**
 * Whether two boxes share any ground. A box across the antimeridian has an
 * east past 180, and a view of a wide map can reach past -180 or 180 as well,
 * so the second box is also tried one world to either side.
 */
export function boundsMeet(view: Bounds, other: Bounds): boolean {
  if (other.north < view.south || other.south > view.north) {
    return false;
  }
  return [-WORLD_DEGREES, 0, WORLD_DEGREES].some(
    (shift) =>
      other.east + shift >= view.west && other.west + shift <= view.east,
  );
}
