// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { clamp } from "../numbers/clamp";
import type { LatLng, PixelPoint } from "../ports/geometry";

/** Size in pixels of the tiles the normalised zoom number refers to. */
export const NORMALISED_TILE_SIZE = 256;

/** Ground resolution at the equator at normalised zoom 0, in metres per pixel. */
export const EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0 = 156_543.033_928_040_97;

/** The furthest latitude Web Mercator can show. */
export const MAX_MERCATOR_LATITUDE = 85.051_128_779_806_59;

/**
 * Add this to a normalised zoom to get MapLibre's own zoom number.
 * @remarks The normalised zoom follows the 256 px tile convention used by
 *   OpenStreetMap tile numbering, the URL and the saved view. MapLibre counts
 *   512 px tiles, so the same visual scale is one lower. A 256 px raster
 *   source in MapLibre still requests the tile level equal to the normalised
 *   zoom, so nothing else needs converting.
 */
export const ENGINE_ZOOM_OFFSET = -1;

/** Converts a normalised zoom to MapLibre's zoom number. */
export function toEngineZoom(normalisedZoom: number): number {
  return normalisedZoom + ENGINE_ZOOM_OFFSET;
}

/** Converts MapLibre's zoom number to the normalised zoom. */
export function toNormalisedZoom(engineZoom: number): number {
  return engineZoom - ENGINE_ZOOM_OFFSET;
}

/** Limits `zoom` to the range `[min, max]`. */
export function clampZoom(zoom: number, min: number, max: number): number {
  return clamp(zoom, min, max);
}

/**
 * Ground resolution at a latitude and normalised zoom, in metres per pixel.
 * The single implementation used by the scale bar, the accuracy circle and
 * measurement, on every engine.
 */
export function metresPerPixel(
  latitude: number,
  normalisedZoom: number,
): number {
  const clamped = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  return (
    (EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0 * Math.cos((clamped * Math.PI) / 180)) /
    2 ** normalisedZoom
  );
}

function worldSize(normalisedZoom: number): number {
  return NORMALISED_TILE_SIZE * 2 ** normalisedZoom;
}

/**
 * Projects a position to Web Mercator world pixels at a normalised zoom,
 * with the origin at the top-left of the world.
 */
export function mercatorProject(
  position: LatLng,
  normalisedZoom: number,
): PixelPoint {
  const size = worldSize(normalisedZoom);
  const latitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, position.lat),
  );
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((position.lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

/** The inverse of {@link mercatorProject}. */
export function mercatorUnproject(
  point: PixelPoint,
  normalisedZoom: number,
): LatLng {
  const size = worldSize(normalisedZoom);
  const n = Math.PI - (2 * Math.PI * point.y) / size;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    lng: (point.x / size) * 360 - 180,
  };
}
