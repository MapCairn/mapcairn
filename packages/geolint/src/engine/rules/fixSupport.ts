// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { Position } from "../geometry/predicates.js";
import {
  type LeafGeometry,
  leafGeometries,
  MAX_COLLECTION_DEPTH,
} from "../geometry/walk.js";
import { isObject, isPosition, pointer } from "../json.js";

/** The fewest positions a polygon ring has: three corners and the closing position. */
export const MIN_RING_POSITIONS = 4;

/** The fewest positions a line has. */
export const MIN_LINE_POSITIONS = 2;

/** What a run of positions is: a line, or a ring of a polygon. */
export type RunKind = "line" | "ring";

/** Where a run of positions sits, for a repair that depends on it. */
export interface RunInfo {
  readonly kind: RunKind;
  /** Whether the run is the first ring of its polygon. Always false for a line. */
  readonly isExterior: boolean;
}

const LINE_RUN: RunInfo = { kind: "line", isExterior: false };

/** Whether two positions hold exactly the same elements, altitude included. */
export function identicalPositions(a: Position, b: Position): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Maps the items of an array, giving back the same array when no item changed,
 * so a repair that finds nothing to do shares the whole input.
 */
function mapArray(
  items: readonly unknown[],
  map: (item: unknown, index: number) => unknown,
): readonly unknown[] {
  let changed = false;
  const mapped = items.map((item, index) => {
    const next = map(item, index);
    if (next !== item) {
      changed = true;
    }
    return next;
  });
  return changed ? mapped : items;
}

function mapEach(
  value: unknown,
  map: (item: unknown, index: number) => unknown,
): unknown {
  return Array.isArray(value) ? mapArray(value, map) : value;
}

function mapRun(
  value: unknown,
  info: RunInfo,
  transform: (run: readonly Position[], info: RunInfo) => readonly Position[],
): unknown {
  if (!Array.isArray(value) || !value.every(isPosition)) {
    return value;
  }
  return transform(value, info);
}

function mapPolygon(
  value: unknown,
  transform: (run: readonly Position[], info: RunInfo) => readonly Position[],
): unknown {
  return mapEach(value, (ring, index) =>
    mapRun(ring, { kind: "ring", isExterior: index === 0 }, transform),
  );
}

/**
 * Applies `transform` to every readable line or ring of a leaf geometry and
 * returns the new `coordinates`, or the same value when `transform` gave back
 * every run it was handed. Runs that are not arrays of positions are left as
 * they are, and a point geometry is returned unchanged. The runs are the ones
 * `linesOf` and `ringsOf` read.
 */
export function mapRuns(
  leaf: LeafGeometry,
  transform: (run: readonly Position[], info: RunInfo) => readonly Position[],
): unknown {
  const { coordinates } = leaf;
  switch (leaf.type) {
    case "LineString":
      return mapRun(coordinates, LINE_RUN, transform);
    case "MultiLineString":
      return mapEach(coordinates, (line) => mapRun(line, LINE_RUN, transform));
    case "Polygon":
      return mapPolygon(coordinates, transform);
    case "MultiPolygon":
      return mapEach(coordinates, (polygon) => mapPolygon(polygon, transform));
    case "Point":
    case "MultiPoint":
      return coordinates;
  }
}

/**
 * Applies `transform` to every readable position of a leaf geometry, the ones
 * `matchingPositions` reads, and returns the new `coordinates`, or the same
 * value when `transform` gave back every position it was handed.
 */
export function mapPositions(
  leaf: LeafGeometry,
  transform: (position: Position) => Position,
): unknown {
  const { coordinates } = leaf;
  if (leaf.type === "Point") {
    return isPosition(coordinates) ? transform(coordinates) : coordinates;
  }
  if (leaf.type === "MultiPoint") {
    return mapEach(coordinates, (position) =>
      isPosition(position) ? transform(position) : position,
    );
  }
  return mapRuns(
    leaf,
    (run) =>
      mapArray(run, (position) =>
        transform(position as Position),
      ) as Position[],
  );
}

function rebuild(
  node: unknown,
  at: string,
  depth: number,
  replacements: ReadonlyMap<string, unknown>,
): unknown {
  if (!isObject(node)) {
    return node;
  }
  if (replacements.has(at)) {
    return { ...node, coordinates: replacements.get(at) };
  }
  if (
    node.type !== "GeometryCollection" ||
    !Array.isArray(node.geometries) ||
    depth >= MAX_COLLECTION_DEPTH
  ) {
    return node;
  }
  const geometries = mapArray(node.geometries, (child, index) =>
    rebuild(child, pointer(at, "geometries", index), depth + 1, replacements),
  );
  return geometries === node.geometries ? node : { ...node, geometries };
}

/**
 * Repairs the coordinates of every leaf geometry of a feature (or of a bare
 * geometry), in document order, and returns a new feature that shares
 * everything the repair left alone. `repair` gets a leaf and returns its new
 * `coordinates`, or the very same value when there is nothing to repair; when
 * that holds for every leaf the feature itself is returned. The input is never
 * changed.
 */
export function fixLeaves(
  feature: unknown,
  repair: (leaf: LeafGeometry) => unknown,
): unknown {
  const replacements = new Map<string, unknown>();
  for (const leaf of leafGeometries(feature)) {
    const repaired = repair(leaf);
    if (repaired !== leaf.coordinates) {
      replacements.set(leaf.pointer, repaired);
    }
  }
  if (replacements.size === 0) {
    return feature;
  }
  if (isObject(feature) && feature.type === "Feature") {
    return {
      ...feature,
      geometry: rebuild(feature.geometry, "/geometry", 0, replacements),
    };
  }
  return rebuild(feature, "", 0, replacements);
}
