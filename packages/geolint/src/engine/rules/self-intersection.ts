// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { type Position, samePosition } from "../geometry/predicates.js";
import {
  findRingIntersections,
  findSegmentIntersections,
  type IntersectionKind,
  type RingIntersection,
  type Segment,
} from "../geometry/sweep.js";
import { leafGeometries, type RingRef, ringsOf } from "../geometry/walk.js";
import { pointer } from "../json.js";
import type { Finding, Rule } from "../types.js";

const RULE_ID = "self-intersection";

/** A ring needs a start, three more positions and a close to enclose anything; fewer is for the `structure` rule. */
const MIN_RING_POSITIONS = 4;

/** How many intersections one ring, or the crossings between a polygon's rings, may report. */
const MAX_REPORTED = 10;

/** Longitude and latitude are written to this many decimal places (about 0.1 mm). */
const COORDINATE_DECIMALS = 9;

/** An intersection of a ring, ready to become a finding. */
interface Spot {
  readonly kind: IntersectionKind;
  readonly point: readonly [number, number];
  readonly edges: readonly [number, number];
  /** Indices of the two rings within the polygon, for a crossing between two rings. */
  readonly rings?: readonly [number, number];
}

function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(COORDINATE_DECIMALS)));
}

function formatPoint(point: readonly [number, number]): string {
  return `${formatCoordinate(point[0])}, ${formatCoordinate(point[1])}`;
}

/** The ring's index among its polygon's rings in the document, read from its pointer. */
function ringIndex(ring: RingRef): number {
  return Number(ring.pointer.slice(ring.pointer.lastIndexOf("/") + 1));
}

function describeOwn(spot: Spot): string {
  const at = formatPoint(spot.point);
  switch (spot.kind) {
    case "cross":
      return `Ring crosses itself at ${at}.`;
    case "touch":
      return `Ring touches itself at ${at}.`;
    case "overlap":
      return `Ring overlaps itself along a segment starting at ${at}.`;
  }
}

function describe(spot: Spot): string {
  if (spot.rings !== undefined) {
    return `Ring crosses another ring of the same polygon at ${formatPoint(spot.point)}.`;
  }
  return describeOwn(spot);
}

function toFinding(path: string, spot: Spot, note: string): Finding {
  return {
    ruleId: RULE_ID,
    severity: spot.kind === "cross" ? "error" : "warning",
    confidence: "high",
    path,
    message: `${describe(spot)}${note}`,
    fixable: false,
    data: {
      point: [...spot.point],
      kind: spot.kind,
      edges: [...spot.edges],
      ...(spot.rings === undefined ? {} : { rings: [...spot.rings] }),
    },
  };
}

function spotKey(spot: Spot): string {
  const rings = spot.rings === undefined ? "" : spot.rings.join(",");
  return `${spot.kind}|${spot.point.join(",")}|${rings}`;
}

/**
 * The first spot at each distinct place and kind, so a vertex where many edges
 * meet is one finding and not one for every pair of edges.
 */
function distinctSpots(spots: readonly Spot[]): Spot[] {
  const seen = new Set<string>();
  return spots.filter((spot) => {
    const key = spotKey(spot);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Orders spots by ring, when they name two, then by edge. */
function bySpot(a: Spot, b: Spot): number {
  return (
    (a.rings?.[0] ?? 0) - (b.rings?.[0] ?? 0) ||
    (a.rings?.[1] ?? 0) - (b.rings?.[1] ?? 0) ||
    a.edges[0] - b.edges[0] ||
    a.edges[1] - b.edges[1]
  );
}

/** Puts proper crossings before the rest, and keeps the order of everything else (the sort is stable). */
function crossingsFirst(a: Spot, b: Spot): number {
  return Number(b.kind === "cross") - Number(a.kind === "cross");
}

/**
 * Turns what a sweep found into at most `MAX_REPORTED` findings in a stable
 * order. The last carries `moreNote` when the sweep stopped early or more
 * places were found than are listed.
 */
function toFindings(
  pathOf: (spot: Spot) => string,
  spots: readonly Spot[],
  stopped: boolean,
  moreNote: string,
): Finding[] {
  const distinct = distinctSpots([...spots].sort(bySpot));
  const shown = [...distinct]
    .sort(crossingsFirst)
    .slice(0, MAX_REPORTED)
    .sort(bySpot);
  const more = stopped || distinct.length > MAX_REPORTED;
  return shown.map((spot, index) =>
    toFinding(
      pathOf(spot),
      spot,
      more && index === shown.length - 1 ? moreNote : "",
    ),
  );
}

/**
 * What a sweep of one ring found, up to `MAX_REPORTED + 1` intersections of
 * any kind. When it stopped at that count without a crossing among them, the
 * ring may still cross itself further on, so the crossings are asked for on
 * their own and kept first: a proper crossing is an error and must not be
 * hidden behind touches and overlaps.
 */
function ringSpots(ring: RingRef): { spots: Spot[]; stopped: boolean } {
  const toSpot = (found: RingIntersection): Spot => ({
    kind: found.kind,
    point: found.point,
    edges: [found.first, found.second],
  });
  const all = findRingIntersections(ring.positions, {
    limit: MAX_REPORTED + 1,
  });
  const spots = all.intersections.map(toSpot);
  if (!all.stopped || spots.some((spot) => spot.kind === "cross")) {
    return { spots, stopped: all.stopped };
  }
  const crossings = findRingIntersections(ring.positions, {
    limit: MAX_REPORTED + 1,
    only: "cross",
  });
  return {
    spots: [...crossings.intersections.map(toSpot), ...spots],
    stopped: true,
  };
}

function ownFindings(ring: RingRef): {
  findings: Finding[];
  complete: boolean;
} {
  const { spots, stopped } = ringSpots(ring);
  return {
    findings: toFindings(
      () => ring.pointer,
      spots,
      stopped,
      " This ring has more intersections than are listed.",
    ),
    complete: !stopped,
  };
}

interface EdgeOwner {
  /** Position of the ring in the polygon's checked rings. */
  readonly ring: number;
  /** Index of the edge's first position in its ring. */
  readonly edge: number;
}

/**
 * The proper crossings between different rings of one polygon. Rings that only
 * touch are valid, and so are not reported; crossings within one ring were
 * reported already.
 */
function crossingFindings(rings: readonly RingRef[]): Finding[] {
  const segments: Segment[] = [];
  const owners: EdgeOwner[] = [];
  rings.forEach((ring, number) => {
    for (let edge = 0; edge + 1 < ring.positions.length; edge++) {
      const start = ring.positions[edge] as Position;
      const end = ring.positions[edge + 1] as Position;
      if (!samePosition(start, end)) {
        segments.push({ start, end });
        owners.push({ ring: number, edge });
      }
    }
  });
  const result = findSegmentIntersections(segments, {
    limit: MAX_REPORTED + 1,
    ignore: (first, second, kind) =>
      kind !== "cross" ||
      (owners[first] as EdgeOwner).ring === (owners[second] as EdgeOwner).ring,
  });
  const spots = result.intersections.map((found): Spot => {
    const low = owners[found.first] as EdgeOwner;
    const high = owners[found.second] as EdgeOwner;
    return {
      kind: found.kind,
      point: found.point,
      edges: [low.edge, high.edge],
      rings: [
        ringIndex(rings[low.ring] as RingRef),
        ringIndex(rings[high.ring] as RingRef),
      ],
    };
  });
  return toFindings(
    (spot) =>
      pointer(
        (rings[0] as RingRef).polygonPointer,
        (spot.rings as readonly [number, number])[1],
      ),
    spots,
    result.stopped,
    " This polygon has more crossings between its rings than are listed.",
  );
}

/** The checked rings of each polygon, polygon by polygon, in document order. */
function polygonsOf(rings: readonly RingRef[]): RingRef[][] {
  const polygons = new Map<string, RingRef[]>();
  for (const ring of rings) {
    if (ring.positions.length < MIN_RING_POSITIONS) {
      continue;
    }
    const group = polygons.get(ring.polygonPointer) ?? [];
    group.push(ring);
    polygons.set(ring.polygonPointer, group);
  }
  return [...polygons.values()];
}

function checkPolygon(rings: readonly RingRef[]): Finding[] {
  const findings: Finding[] = [];
  let complete = true;
  for (const ring of rings) {
    const own = ownFindings(ring);
    findings.push(...own.findings);
    complete = complete && own.complete;
  }
  if (complete && rings.length > 1) {
    findings.push(...crossingFindings(rings));
  }
  return findings;
}

/**
 * A polygon ring that crosses itself (an error), touches itself at a point or
 * runs back over itself (a warning), or a ring that crosses another ring of the
 * same polygon (an error). Rings that only touch each other, and polygons of a
 * `MultiPolygon` that touch, are valid and are not reported. A line that crosses
 * itself is valid and is not reported either.
 *
 * Findings are one for each distinct place, at most ten for a ring. When a
 * ring has more intersections than that, the check between the polygon's rings
 * is skipped: it would have to sweep every crossing of a ring that is already
 * a tangle, and the ring needs repairing first.
 */
export const selfIntersectionRule: Rule = {
  id: RULE_ID,
  severity: "error",
  confidence: "high",
  summary:
    "A polygon ring crosses, touches or overlaps itself, or crosses another ring.",
  fixable: false,
  needsRegion: false,
  check(feature) {
    const findings: Finding[] = [];
    for (const leaf of leafGeometries(feature)) {
      if (leaf.type !== "Polygon" && leaf.type !== "MultiPolygon") {
        continue;
      }
      for (const polygon of polygonsOf(ringsOf(leaf))) {
        findings.push(...checkPolygon(polygon));
      }
    }
    return findings;
  },
};
