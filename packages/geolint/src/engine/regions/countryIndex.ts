// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import Flatbush from "flatbush";
import type { CountryIndex } from "../types.js";

/** One country in the artefact: polygons, each a list of rings of delta-encoded integers. */
export interface CountryRecord {
  /** ISO 3166-1 alpha-2 code. */
  readonly code: string;
  /** How far outside the outline a position may be and still count as inside, in 1/quantum degrees. */
  readonly tolerance: number;
  /** Each polygon is its exterior ring then its holes; a ring is `[x0, y0, dx, dy, ...]`. */
  readonly polygons: readonly (readonly (readonly number[])[])[];
}

/** The shape of `countries.json`, built by `scripts/build-countries.mjs`. */
export interface CountryArtefact {
  readonly format: number;
  /** Coordinates are whole multiples of `1 / quantum` degrees. */
  readonly quantum: number;
  readonly countries: readonly CountryRecord[];
}

/** A bounding box as west, south, east, north in degrees. */
type Bounds = readonly [number, number, number, number];

/** A ring as flat longitude, latitude pairs in degrees. */
type Ring = Float64Array;

interface DecodedPolygon {
  readonly code: string;
  readonly tolerance: number;
  readonly rings: readonly Ring[];
}

function decodeRing(flat: readonly number[], quantum: number): Ring {
  const ring = new Float64Array(flat.length);
  let x = 0;
  let y = 0;
  for (let i = 0; i < flat.length; i += 2) {
    x += flat[i] as number;
    y += flat[i + 1] as number;
    ring[i] = x / quantum;
    ring[i + 1] = y / quantum;
  }
  return ring;
}

/** Whether the point is inside the polygon by the even-odd rule over all its rings (a hole is outside). */
function insidePolygon(rings: readonly Ring[], x: number, y: number): boolean {
  let inside = false;
  for (const ring of rings) {
    const count = ring.length / 2;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const xi = ring[2 * i] as number;
      const yi = ring[2 * i + 1] as number;
      const xj = ring[2 * j] as number;
      const yj = ring[2 * j + 1] as number;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

/** The squared distance from the point to the segment, in squared degrees. */
function segmentDistanceSquared(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared),
        );
  const ex = ax + t * dx - x;
  const ey = ay + t * dy - y;
  return ex * ex + ey * ey;
}

function nearOutline(
  rings: readonly Ring[],
  x: number,
  y: number,
  toleranceSquared: number,
): boolean {
  for (const ring of rings) {
    const count = ring.length / 2;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const distance = segmentDistanceSquared(
        x,
        y,
        ring[2 * j] as number,
        ring[2 * j + 1] as number,
        ring[2 * i] as number,
        ring[2 * i + 1] as number,
      );
      if (distance <= toleranceSquared) {
        return true;
      }
    }
  }
  return false;
}

/** The bounding box of the first (exterior) ring, grown by `margin` degrees. */
function box(ring: Ring, margin: number): [number, number, number, number] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i] as number);
    maxX = Math.max(maxX, ring[i] as number);
    minY = Math.min(minY, ring[i + 1] as number);
    maxY = Math.max(maxY, ring[i + 1] as number);
  }
  return [minX - margin, minY - margin, maxX + margin, maxY + margin];
}

/**
 * Builds a country lookup from the artefact. Polygons are indexed by their
 * bounding boxes (grown by the country's tolerance) in an R-tree, so a lookup
 * touches only the polygons near the point.
 *
 * `contains` is true for a position inside a polygon of the country, or within
 * the country's tolerance of its outline. The tolerance exists because the
 * outlines are coarse: at 1:110m a real coastline can be tens of kilometres
 * from the drawn one.
 */
export function createCountryIndex(artefact: CountryArtefact): CountryIndex {
  const polygons: DecodedPolygon[] = [];
  for (const country of artefact.countries) {
    for (const rings of country.polygons) {
      const decoded = rings.map((ring) => decodeRing(ring, artefact.quantum));
      if (decoded.length > 0) {
        polygons.push({
          code: country.code,
          tolerance: country.tolerance / artefact.quantum,
          rings: decoded,
        });
      }
    }
  }
  const codes = new Set(artefact.countries.map((country) => country.code));
  const bounds = new Map<string, Bounds>();
  for (const polygon of polygons) {
    const [west, south, east, north] = box(polygon.rings[0] as Ring, 0);
    const known = bounds.get(polygon.code);
    bounds.set(
      polygon.code,
      known === undefined
        ? [west, south, east, north]
        : [
            Math.min(known[0], west),
            Math.min(known[1], south),
            Math.max(known[2], east),
            Math.max(known[3], north),
          ],
    );
  }
  const index = new Flatbush(Math.max(polygons.length, 1));
  for (const polygon of polygons) {
    const [minX, minY, maxX, maxY] = box(
      polygon.rings[0] as Ring,
      polygon.tolerance,
    );
    index.add(minX, minY, maxX, maxY);
  }
  if (polygons.length === 0) {
    index.add(0, 0, 0, 0);
  }
  index.finish();

  return {
    has: (code) => codes.has(code),
    bounds: (code) => bounds.get(code),
    locate: (longitude, latitude) => {
      if (polygons.length === 0) {
        return undefined;
      }
      const found = index
        .search(longitude, latitude, longitude, latitude)
        .map((id) => polygons[id] as DecodedPolygon)
        .find((polygon) => insidePolygon(polygon.rings, longitude, latitude));
      return found?.code;
    },
    contains: (code, longitude, latitude) => {
      if (polygons.length === 0) {
        return false;
      }
      return index
        .search(longitude, latitude, longitude, latitude)
        .some((id) => {
          const polygon = polygons[id] as DecodedPolygon;
          return (
            polygon.code === code &&
            (insidePolygon(polygon.rings, longitude, latitude) ||
              nearOutline(
                polygon.rings,
                longitude,
                latitude,
                polygon.tolerance * polygon.tolerance,
              ))
          );
        });
    },
  };
}
