import type { LatLng } from "../ports/geometry";
import { MAX_MERCATOR_LATITUDE, NORMALISED_TILE_SIZE } from "../zoom/zoom";

const DEGREES = Math.PI / 180;

/**
 * The furthest, in pixels, a straight piece of a line drawn over a globe may
 * stray from the great circle it stands for. Half a pixel is below what the
 * eye can tell from an anti-aliased curve.
 */
export const GLOBE_CHORD_TOLERANCE_PX = 0.5;

/**
 * The most pieces one segment is cut into. It bounds the work for a very long
 * segment seen close up, where most of it is off the screen anyway. At
 * normalised zoom 13, where the engine has finished blending the globe into a
 * flat map, a half-turn segment needs 908 pieces to stay within
 * {@link GLOBE_CHORD_TOLERANCE_PX}, so the cap never shortens a curve the
 * globe draws.
 */
export const MAX_GREAT_CIRCLE_STEPS = 1024;

/**
 * The radius of the globe on the screen, in pixels, at a normalised zoom and
 * view centre latitude.
 * @remarks MapLibre GL JS 6.17 (`getGlobeRadiusPixels` in
 *   `src/geo/projection/globe_utils.ts`) sizes the globe as
 *   `worldSize / (2π) / planetScaleAtLatitude(centre)`, where
 *   `planetScaleAtLatitude` is the cosine of the centre latitude, clamped at
 *   Mercator's limit, so that a feature at the centre is the same size on the
 *   globe as on the flat map. MapLibre's `worldSize` is `512 * 2 ** zoom` in
 *   its own zoom, which is `256 * 2 ** zoom` in the normalised zoom.
 */
export function globeRadiusPixels(
  normalisedZoom: number,
  centreLatitude: number,
): number {
  const latitude = Math.min(Math.abs(centreLatitude), MAX_MERCATOR_LATITUDE);
  return (
    (NORMALISED_TILE_SIZE * 2 ** normalisedZoom) /
    (2 * Math.PI) /
    Math.cos(latitude * DEGREES)
  );
}

/**
 * The longest arc, in radians, that a straight line on the screen can stand
 * for on a globe of `radiusPixels` while straying at most `tolerancePixels`
 * from it.
 * @remarks A chord across an arc of angle θ on a sphere of radius R is at
 *   most R(1 - cos(θ/2)), about Rθ²/8, from the arc, and projecting it to the
 *   screen never makes that gap larger. So θ = √(8 · tolerance / R).
 */
export function greatCircleStepRadians(
  radiusPixels: number,
  tolerancePixels: number = GLOBE_CHORD_TOLERANCE_PX,
): number {
  return Math.sqrt((8 * tolerancePixels) / radiusPixels);
}

type Vector = readonly [number, number, number];

function toVector(position: LatLng): Vector {
  const lat = position.lat * DEGREES;
  const lng = position.lng * DEGREES;
  return [
    Math.cos(lat) * Math.cos(lng),
    Math.cos(lat) * Math.sin(lng),
    Math.sin(lat),
  ];
}

function toPosition([x, y, z]: Vector): LatLng {
  return {
    lat: Math.atan2(z, Math.hypot(x, y)) / DEGREES,
    lng: Math.atan2(y, x) / DEGREES,
  };
}

/** The angle at the centre of the Earth between two positions, in radians. */
export function centralAngle(from: LatLng, to: LatLng): number {
  const [ax, ay, az] = toVector(from);
  const [bx, by, bz] = toVector(to);
  const cross = Math.hypot(
    ay * bz - az * by,
    az * bx - ax * bz,
    ax * by - ay * bx,
  );
  return Math.atan2(cross, ax * bx + ay * by + az * bz);
}

/**
 * The positions along the great circle from `from` to `to`, both included,
 * no more than `maxStepRadians` apart (and at most
 * {@link MAX_GREAT_CIRCLE_STEPS} pieces). It goes the short way, so a segment
 * from 170 to -170 crosses the antimeridian. Two positions that are the same,
 * or exactly opposite (where no single great circle joins them), come back as
 * they are.
 */
export function greatCirclePoints(
  from: LatLng,
  to: LatLng,
  maxStepRadians: number,
): LatLng[] {
  const angle = centralAngle(from, to);
  const sine = Math.sin(angle);
  const steps = Math.min(
    MAX_GREAT_CIRCLE_STEPS,
    Math.ceil(angle / maxStepRadians),
  );
  if (!(steps > 1) || !(sine > 1e-12)) {
    return [from, to];
  }
  const points: LatLng[] = [from];
  for (let step = 1; step < steps; step += 1) {
    points.push(greatCircleInterpolate(from, to, step / steps));
  }
  points.push(to);
  return points;
}

/**
 * The position a fraction `t` (0 to 1) of the way along the great circle
 * from `from` to `to`. Two positions that are the same or exactly opposite
 * give `from`.
 */
export function greatCircleInterpolate(
  from: LatLng,
  to: LatLng,
  t: number,
): LatLng {
  const angle = centralAngle(from, to);
  const sine = Math.sin(angle);
  if (!(sine > 1e-12)) {
    return from;
  }
  const a = toVector(from);
  const b = toVector(to);
  const wa = Math.sin((1 - t) * angle) / sine;
  const wb = Math.sin(t * angle) / sine;
  return toPosition([
    wa * a[0] + wb * b[0],
    wa * a[1] + wb * b[1],
    wa * a[2] + wb * b[2],
  ]);
}

/** The point halfway along the great circle between two positions. */
export function greatCircleMidpoint(from: LatLng, to: LatLng): LatLng {
  const a = toVector(from);
  const b = toVector(to);
  const sum: Vector = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  if (Math.hypot(...sum) < 1e-12) {
    return from;
  }
  return toPosition(sum);
}

/** A path cut into short pieces, and where each given position ended up in it. */
export interface DensifiedPath {
  readonly positions: readonly LatLng[];
  /** The index in `positions` of each given position, in order. */
  readonly vertices: readonly number[];
}

/**
 * Cuts every segment of a path into pieces along its great circle (see
 * {@link greatCirclePoints}). A closed path's last segment, back to the
 * first position, is cut too, and its end is not repeated.
 */
export function densifyAlongGreatCircles(
  positions: readonly LatLng[],
  closed: boolean,
  maxStepRadians: number,
): DensifiedPath {
  const out: LatLng[] = [];
  const vertices: number[] = [];
  const count = positions.length;
  positions.forEach((position, index) => {
    vertices.push(out.length);
    out.push(position);
    const next = index + 1 < count ? positions[index + 1] : undefined;
    const end = next ?? (closed && count > 2 ? positions[0] : undefined);
    if (end) {
      out.push(
        ...greatCirclePoints(position, end, maxStepRadians).slice(1, -1),
      );
    }
  });
  return { positions: out, vertices };
}
