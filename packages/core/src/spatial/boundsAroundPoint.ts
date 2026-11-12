import { clamp } from "../numbers/clamp";
import type { Bounds, LatLng } from "../ports/geometry";
import {
  EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0,
  MAX_MERCATOR_LATITUDE,
  NORMALISED_TILE_SIZE,
} from "../zoom/zoom";

/** Metres in one degree of latitude, on the sphere Web Mercator uses. */
const METRES_PER_DEGREE =
  (EQUATOR_METRES_PER_PIXEL_AT_ZOOM_0 * NORMALISED_TILE_SIZE) / 360;

/**
 * The latitude and longitude box around a circle: `radiusMetres` north,
 * south, east and west of `centre`. Used to fit a location fix's accuracy
 * circle on screen.
 *
 * @remarks Spherical, which is well within a pixel at the zooms a fix is
 *   shown at. A radius that is not a positive number gives the point itself.
 *   The box is clamped to the Web Mercator world, and the east-west span is
 *   computed at a latitude no nearer the pole than Web Mercator reaches, so
 *   it stays finite.
 */
export function boundsAroundPoint(
  centre: LatLng,
  radiusMetres: number,
): Bounds {
  // Not Math.max: it would pass NaN through.
  const radius = Number.isNaN(radiusMetres) ? 0 : Math.max(radiusMetres, 0);
  const latitude = clamp(
    centre.lat,
    -MAX_MERCATOR_LATITUDE,
    MAX_MERCATOR_LATITUDE,
  );
  const latSpan = radius / METRES_PER_DEGREE;
  const lngSpan =
    radius / (METRES_PER_DEGREE * Math.cos((latitude * Math.PI) / 180));
  return {
    south: clamp(
      latitude - latSpan,
      -MAX_MERCATOR_LATITUDE,
      MAX_MERCATOR_LATITUDE,
    ),
    west: clamp(centre.lng - lngSpan, -180, 180),
    north: clamp(
      latitude + latSpan,
      -MAX_MERCATOR_LATITUDE,
      MAX_MERCATOR_LATITUDE,
    ),
    east: clamp(centre.lng + lngSpan, -180, 180),
  };
}
