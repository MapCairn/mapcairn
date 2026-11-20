// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapAdapter,
  MapPlacement,
  MapProjection,
  PixelPoint,
  ViewState,
} from "@mapcairn/core";
import { useMap } from "../MapContext";

/**
 * The on-screen radius, in pixels, of a distance on the ground.
 * @param minimum - The smallest radius returned, so a tiny circle stays visible.
 * @returns `minimum` when the resolution is not a positive number or the
 *   distance is negative or not finite.
 */
export function screenRadiusForMetres(
  metres: number,
  metresPerPixel: number,
  minimum = 0,
): number {
  if (!(metresPerPixel > 0) || !(metres >= 0) || !Number.isFinite(metres)) {
    return minimum;
  }
  return Math.max(minimum, metres / metresPerPixel);
}

/** The part of the map port an overlay needs to place and hide its marks. */
export type OverlayMap = Pick<MapAdapter, "project" | "isVisible">;

/** How overlays place marks on a map of `projection` showing `view`. */
export function overlayPlacement(
  map: OverlayMap,
  view: Pick<ViewState, "center" | "zoom">,
  projection: MapProjection,
): MapPlacement {
  return {
    projection,
    view,
    project: (position) => map.project(position),
    isVisible: (position) => map.isVisible(position),
  };
}

/**
 * The placement every overlay uses: the live adapter, the current view and
 * the map shape, or null before the map has mounted. Read it inside the map
 * context.
 */
export function usePlacement(): MapPlacement | null {
  const { adapter, view, projection } = useMap();
  return adapter ? overlayPlacement(adapter, view, projection) : null;
}

/** Rounds a pixel coordinate to two decimals, to keep SVG attributes short. */
export function roundPixel(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Formats pixels for an SVG `points` attribute. */
export function toSvgPoints(points: readonly PixelPoint[]): string {
  return points
    .map((point) => `${roundPixel(point.x)},${roundPixel(point.y)}`)
    .join(" ");
}
