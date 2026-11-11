import { wrapLongitude } from "../globe/longitude";
import type { LatLng } from "../ports/geometry";

/** Mean radius of the Earth in metres, the sphere every draw measure uses. */
export const EARTH_RADIUS_METRES = 6_371_008.8;

const DEGREES = Math.PI / 180;

/** The great-circle distance between two positions, in metres (haversine). */
export function distanceMetres(from: LatLng, to: LatLng): number {
  const dLat = (to.lat - from.lat) * DEGREES;
  const dLng = (to.lng - from.lng) * DEGREES;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * DEGREES) *
      Math.cos(to.lat * DEGREES) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The position reached by travelling `metres` from `from` along a great
 * circle on `bearing` (degrees clockwise from north). The longitude is
 * wrapped into [-180, 180].
 */
export function destinationPoint(
  from: LatLng,
  bearing: number,
  metres: number,
): LatLng {
  const angular = metres / EARTH_RADIUS_METRES;
  const theta = bearing * DEGREES;
  const phi1 = from.lat * DEGREES;
  const lambda1 = from.lng * DEGREES;
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(angular) +
    Math.cos(phi1) * Math.sin(angular) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angular) * Math.cos(phi1),
      Math.cos(angular) - Math.sin(phi1) * Math.sin(phi2),
    );
  return { lat: phi2 / DEGREES, lng: wrapLongitude(lambda2 / DEGREES) };
}

/**
 * The points of a circle of `radiusMetres` around `centre`, as an open ring
 * of `steps` positions that starts due east and runs anticlockwise.
 */
export function circleRing(
  centre: LatLng,
  radiusMetres: number,
  steps: number,
): LatLng[] {
  const ring: LatLng[] = [];
  for (let step = 0; step < steps; step += 1) {
    ring.push(
      destinationPoint(centre, 90 - (360 * step) / steps, radiusMetres),
    );
  }
  return ring;
}

/** The area of a circle of `radiusMetres` on the sphere (a spherical cap), in square metres. */
export function circleArea(radiusMetres: number): number {
  const angular = radiusMetres / EARTH_RADIUS_METRES;
  return 2 * Math.PI * EARTH_RADIUS_METRES ** 2 * (1 - Math.cos(angular));
}

/** The length of the edge of a circle of `radiusMetres` on the sphere, in metres. */
export function circleCircumference(radiusMetres: number): number {
  const angular = radiusMetres / EARTH_RADIUS_METRES;
  return 2 * Math.PI * EARTH_RADIUS_METRES * Math.sin(angular);
}

/**
 * The signed area of a ring in square degrees (shoelace, longitude as x):
 * positive when the ring runs anticlockwise on a map. Used for orientation
 * only, never as a measure.
 */
export function ringSignedArea(ring: readonly LatLng[]): number {
  if (ring.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index] as LatLng;
    const b = ring[(index + 1) % ring.length] as LatLng;
    sum += a.lng * b.lat - b.lng * a.lat;
  }
  return sum / 2;
}

type Segment = readonly [LatLng, LatLng];

function orientation(a: LatLng, b: LatLng, c: LatLng): number {
  const value =
    (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
  return Math.sign(value);
}

function inBox(a: LatLng, b: LatLng, point: LatLng): boolean {
  return (
    point.lng >= Math.min(a.lng, b.lng) &&
    point.lng <= Math.max(a.lng, b.lng) &&
    point.lat >= Math.min(a.lat, b.lat) &&
    point.lat <= Math.max(a.lat, b.lat)
  );
}

/** Whether two segments share any point, endpoints and overlaps included. */
function segmentsTouch([a, b]: Segment, [c, d]: Segment): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  return (
    (o1 === 0 && inBox(a, b, c)) ||
    (o2 === 0 && inBox(a, b, d)) ||
    (o3 === 0 && inBox(c, d, a)) ||
    (o4 === 0 && inBox(c, d, b))
  );
}

/**
 * Whether every position lies on one straight line (or there are fewer than
 * three), so no area can be enclosed.
 */
export function verticesCollinear(vertices: readonly LatLng[]): boolean {
  const [first, ...rest] = vertices;
  const second = rest.find(
    (vertex) => first && (vertex.lat !== first.lat || vertex.lng !== first.lng),
  );
  if (!first || !second) {
    return true;
  }
  return vertices.every((vertex) => orientation(first, second, vertex) === 0);
}

/** Whether two edges that share a vertex run back over each other (a spike). */
function edgesDoubleBack(shared: LatLng, a: LatLng, b: LatLng): boolean {
  const dot =
    (a.lng - shared.lng) * (b.lng - shared.lng) +
    (a.lat - shared.lat) * (b.lat - shared.lat);
  return orientation(shared, a, b) === 0 && dot > 0;
}

/**
 * Whether the closed ring through `vertices` crosses, touches or doubles back
 * over itself. Edges are compared in the plane of longitude and latitude,
 * which is exact for the question "do these edges meet" at the scales people
 * draw. Two edges that share only the vertex between them are fine, unless
 * they run back over each other.
 */
export function polygonSelfIntersects(vertices: readonly LatLng[]): boolean {
  const count = vertices.length;
  if (count < 3) {
    return false;
  }
  const edge = (index: number): Segment => [
    vertices[index] as LatLng,
    vertices[(index + 1) % count] as LatLng,
  ];
  for (let i = 0; i < count; i += 1) {
    const [a, b] = edge(i);
    for (let j = i + 1; j < count; j += 1) {
      const [c, d] = edge(j);
      if (j === i + 1) {
        if (edgesDoubleBack(b, a, d)) {
          return true;
        }
      } else if (i === 0 && j === count - 1) {
        if (edgesDoubleBack(a, b, c)) {
          return true;
        }
      } else if (segmentsTouch([a, b], [c, d])) {
        return true;
      }
    }
  }
  return false;
}
