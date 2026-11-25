// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { PixelPoint, PlacedPath } from "@mapcairn/core";

/**
 * The placed vertex of any of the paths that is in sight and nearest to
 * `centre`, or null when no vertex is in sight. It is a vertex the path was
 * given, not one a curve added, so a badge sits on the feature's own corner.
 */
export function nearestVisibleVertex(
  paths: readonly PlacedPath[],
  centre: PixelPoint,
): PixelPoint | null {
  let best: PixelPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const path of paths) {
    for (const index of path.vertices) {
      const pixel = path.pixels[index];
      if (!pixel || path.visible[index] !== true) {
        continue;
      }
      const distance = Math.hypot(pixel.x - centre.x, pixel.y - centre.y);
      if (distance < bestDistance) {
        best = pixel;
        bestDistance = distance;
      }
    }
  }
  return best;
}
