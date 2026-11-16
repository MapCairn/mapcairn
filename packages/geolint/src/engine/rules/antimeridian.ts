// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import {
  type LeafGeometry,
  leafGeometries,
  linesOf,
  matchingPositions,
  ringsOf,
} from "../geometry/walk.js";
import { pointer } from "../json.js";
import type { Finding, Rule } from "../types.js";

/** A step between consecutive positions that is longer than this in longitude went the long way round. */
const JUMP_DEGREES = 180;
/** The full turn of longitude. A step of exactly this much along one latitude does not move at all. */
const FULL_TURN = 360;
/** Beyond this latitude (in magnitude) the meridians meet, so a long step in longitude is a step along the pole. */
const POLAR_LATITUDE = 89.99;
/** Longitudes up to this far past the antimeridian are read as a 0 to 360 scale or an unwrapped shape. */
const UNWRAPPED_LIMIT = 360;
/** The valid longitude range is plus and minus this. */
const LONGITUDE_LIMIT = 180;
const LATITUDE_LIMIT = 90;
/** How many jumps are reported for one geometry. */
const MAX_JUMPS_PER_GEOMETRY = 5;

function runs(leaf: LeafGeometry) {
  return leaf.type === "LineString" || leaf.type === "MultiLineString"
    ? linesOf(leaf)
    : ringsOf(leaf);
}

function format(value: number): string {
  return String(Number(value.toFixed(6)));
}

function jumps(leaf: LeafGeometry): Finding[] {
  const found: Finding[] = [];
  for (const run of runs(leaf)) {
    for (let i = 1; i < run.positions.length; i++) {
      const from = run.positions[i - 1] as readonly number[];
      const to = run.positions[i] as readonly number[];
      const step = Math.abs((to[0] as number) - (from[0] as number));
      const polar =
        Math.abs(from[1] as number) >= POLAR_LATITUDE &&
        Math.abs(to[1] as number) >= POLAR_LATITUDE;
      const sameMeridian = step === FULL_TURN && from[1] === to[1];
      if (step <= JUMP_DEGREES || polar || sameMeridian) {
        continue;
      }
      found.push({
        ruleId: "antimeridian",
        severity: "warning",
        confidence: "medium",
        path: pointer(run.pointer, i),
        message: `The longitude jumps from ${format(from[0] as number)} to ${format(to[0] as number)}, which crosses the antimeridian the long way round. Split the shape at 180 degrees, as RFC 7946 section 3.1.9 says.`,
        fixable: false,
        data: { from: [from[0], from[1]], to: [to[0], to[1]], step },
      });
      if (found.length >= MAX_JUMPS_PER_GEOMETRY) {
        return found;
      }
    }
  }
  return found;
}

function unwrapped(leaf: LeafGeometry): Finding[] {
  const { positions: hits, first } = matchingPositions(leaf, (position) => {
    const longitude = position[0] as number;
    return (
      Math.abs(longitude) > LONGITUDE_LIMIT &&
      Math.abs(longitude) <= UNWRAPPED_LIMIT &&
      Math.abs(position[1] as number) <= LATITUDE_LIMIT
    );
  });
  if (first === undefined) {
    return [];
  }
  return [
    {
      ruleId: "antimeridian",
      severity: "warning",
      confidence: "medium",
      path: first.pointer,
      message: `${hits.length === 1 ? "A longitude is" : `${hits.length} longitudes are`} beyond 180 degrees (${format(first.position[0] as number)}). That is either a 0 to 360 scale or a shape drawn straight across the antimeridian; GeoJSON wants longitudes from -180 to 180, with the shape split at 180.`,
      fixable: false,
      data: { count: hits.length },
    },
  ];
}

function check(feature: unknown): Finding[] {
  return leafGeometries(feature).flatMap((leaf) => [
    ...jumps(leaf),
    ...unwrapped(leaf),
  ]);
}

/** Reports shapes that cross the antimeridian without being split, and longitudes beyond plus or minus 180. */
export const antimeridianRule: Rule = {
  id: "antimeridian",
  severity: "warning",
  confidence: "medium",
  summary:
    "A shape that crosses 180 degrees of longitude unsplit, or a longitude beyond 180",
  fixable: false,
  needsRegion: false,
  check,
};
