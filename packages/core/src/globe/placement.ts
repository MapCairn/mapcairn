import type { LatLng, PixelPoint, ViewState } from "../ports/geometry";
import type { MapProjection } from "../ports/map";
import {
  densifyAlongGreatCircles,
  globeRadiusPixels,
  greatCircleInterpolate,
  greatCircleStepRadians,
} from "./greatCircle";
import { nearestLongitude, unwrapLongitudes } from "./longitude";

/**
 * What it takes to place marks drawn over the map (the pin, the measure line,
 * drawn shapes) on the screen: the map's shape, its view, and the adapter's
 * `project` and `isVisible`.
 */
export interface MapPlacement {
  readonly projection: MapProjection;
  readonly view: Pick<ViewState, "center" | "zoom">;
  project(position: LatLng): PixelPoint;
  isVisible(position: LatLng): boolean;
}

/** A path placed on the screen by {@link placePath}. */
export interface PlacedPath {
  /** The path on the screen, with the extra points of any curve. */
  readonly pixels: readonly PixelPoint[];
  /** Whether each pixel is on the side of the map the person can see. */
  readonly visible: readonly boolean[];
  /** True when every pixel is visible (always, on a flat map). */
  readonly whole: boolean;
  /** Whether the path joins its last position back to its first. */
  readonly closed: boolean;
  /** The index in `pixels` of each position the path was given, in order. */
  readonly vertices: readonly number[];
}

/**
 * Where one position is drawn, or null when it is beyond the horizon of a
 * globe. On a flat map the copy of the world nearest the view centre is
 * used, so a mark just across the antimeridian stays on the screen.
 */
export function placePoint(
  position: LatLng,
  placement: MapPlacement,
): PixelPoint | null {
  if (!placement.isVisible(position)) {
    return null;
  }
  return placement.project({
    lat: position.lat,
    lng: nearestLongitude(position.lng, placement.view.center.lng),
  });
}

/**
 * How many times a piece that crosses the horizon is halved to find where it
 * goes out of sight: 12 halvings place the end within 1/4096 of a piece,
 * well under a pixel.
 */
const HORIZON_BISECTIONS = 12;

/** The last visible position on the great circle from `inside` (visible) towards `outside` (hidden). */
function horizonPoint(
  inside: LatLng,
  outside: LatLng,
  isVisible: (position: LatLng) => boolean,
): LatLng {
  let low = 0;
  let high = 1;
  for (let step = 0; step < HORIZON_BISECTIONS; step += 1) {
    const middle = (low + high) / 2;
    if (isVisible(greatCircleInterpolate(inside, outside, middle))) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const edge = greatCircleInterpolate(inside, outside, low);
  return { lat: edge.lat, lng: nearestLongitude(edge.lng, inside.lng) };
}

/**
 * Places a path on the screen. Every segment goes the short way, across the
 * antimeridian when that is shorter, starting on the copy of the world
 * nearest the view centre. On a globe each segment is also cut into pieces
 * along its great circle, short enough to stay within
 * `GLOBE_CHORD_TOLERANCE_PX` of the curve, so long lines bend with the
 * sphere, and a piece that goes over the horizon gains a point where it
 * does, so the line reaches the edge of the disc. On a flat map segments
 * stay straight on the screen.
 */
export function placePath(
  positions: readonly LatLng[],
  closed: boolean,
  placement: MapPlacement,
): PlacedPath {
  const { projection, view } = placement;
  const densified =
    projection === "globe"
      ? densifyAlongGreatCircles(
          positions,
          closed,
          greatCircleStepRadians(globeRadiusPixels(view.zoom, view.center.lat)),
        )
      : { positions, vertices: positions.map((_, index) => index) };
  const unwrapped = unwrapLongitudes(densified.positions, view.center.lng);
  const seen = unwrapped.map((position) => placement.isVisible(position));
  const points: LatLng[] = [];
  const visible: boolean[] = [];
  const moved: number[] = [];
  const count = unwrapped.length;
  unwrapped.forEach((position, index) => {
    moved.push(points.length);
    points.push(position);
    visible.push(seen[index] as boolean);
    const next = index + 1 < count ? index + 1 : closed ? 0 : -1;
    if (next < 0 || next === index || seen[index] === seen[next]) {
      return;
    }
    const nextPosition = unwrapped[next] as LatLng;
    const [inside, outside] = seen[index]
      ? [position, nextPosition]
      : [nextPosition, position];
    points.push(horizonPoint(inside, outside, placement.isVisible));
    visible.push(true);
  });
  return {
    pixels: points.map((position) => placement.project(position)),
    visible,
    whole: visible.every(Boolean),
    closed,
    vertices: densified.vertices.map((index) => moved[index] as number),
  };
}

/**
 * The parts of a placed path to draw as lines, each with at least two
 * points: the runs of consecutive visible points, so a line that goes over
 * the horizon of a globe stops there instead of cutting across the disc. A
 * closed path that is wholly visible comes back as one run that ends where
 * it began; one that is partly hidden wraps round its closing segment.
 */
export function visibleRuns(path: PlacedPath): PixelPoint[][] {
  const { pixels, visible, closed, whole } = path;
  if (closed && whole) {
    const first = pixels[0];
    return first && pixels.length >= 2 ? [[...pixels, first]] : [];
  }
  const count = pixels.length;
  const hidden = visible.indexOf(false);
  // A partly hidden ring is read from just after a hidden point, so a run
  // that passes through the closing segment is not split in two.
  const start = closed && hidden >= 0 ? hidden + 1 : 0;
  const runs: PixelPoint[][] = [];
  let run: PixelPoint[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const index = (start + offset) % count;
    if (visible[index]) {
      run.push(pixels[index] as PixelPoint);
      continue;
    }
    if (run.length >= 2) {
      runs.push(run);
    }
    run = [];
  }
  if (run.length >= 2) {
    runs.push(run);
  }
  return runs;
}
