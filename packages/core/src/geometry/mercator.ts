import type { LatLng } from "../ports/geometry";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import { GeometryError } from "./errors";

/** The radius, in metres, of the sphere Web Mercator (EPSG:3857) uses. */
const EARTH_RADIUS = 6_378_137;

/** Half the width of the world square, in metres: the easting at 180 degrees. */
export const WEB_MERCATOR_HALF_WORLD = Math.PI * EARTH_RADIUS;

const DEGREES = Math.PI / 180;

/** A position in Web Mercator (EPSG:3857), in metres. */
export interface WebMercatorPoint {
  readonly x: number;
  readonly y: number;
}

function assertFinite(first: number, second: number, what: string): void {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    throw new GeometryError("invalid", `${what} must be finite numbers.`);
  }
}

function clampLatitude(lat: number): number {
  return Math.min(MAX_MERCATOR_LATITUDE, Math.max(-MAX_MERCATOR_LATITUDE, lat));
}

/**
 * Projects a WGS 84 position (EPSG:4326) to Web Mercator (EPSG:3857).
 * Latitude is clamped to ±{@link MAX_MERCATOR_LATITUDE}, so a pole gives the
 * edge of the world square rather than infinity. Longitude is not wrapped:
 * a longitude past 180 degrees lands in the next world copy, and projects
 * back to the same value.
 * @throws {GeometryError} `invalid` when a coordinate is not finite.
 */
export function wgs84ToWebMercator(position: LatLng): WebMercatorPoint {
  assertFinite(position.lat, position.lng, "A position's coordinates");
  return {
    x: EARTH_RADIUS * position.lng * DEGREES,
    y:
      EARTH_RADIUS *
      Math.log(
        Math.tan(Math.PI / 4 + (clampLatitude(position.lat) * DEGREES) / 2),
      ),
  };
}

/**
 * Converts a Web Mercator point (EPSG:3857) to a WGS 84 position
 * (EPSG:4326). The latitude is clamped to ±{@link MAX_MERCATOR_LATITUDE}.
 * @throws {GeometryError} `invalid` when a coordinate is not finite.
 */
export function webMercatorToWgs84(point: WebMercatorPoint): LatLng {
  assertFinite(point.x, point.y, "A point's coordinates");
  const lat =
    (2 * Math.atan(Math.exp(point.y / EARTH_RADIUS)) - Math.PI / 2) / DEGREES;
  return {
    lat: clampLatitude(lat),
    lng: point.x / EARTH_RADIUS / DEGREES,
  };
}
