// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import {
  allUtmZones,
  type CandidateSystem,
  fitsArea,
  OTHER_SYSTEMS,
} from "../crs/systems.js";
import { leafGeometries, matchingPositions } from "../geometry/walk.js";
import type { Finding, Rule, RuleContext } from "../types.js";

/** The valid range of latitude, in degrees. */
const LATITUDE_LIMIT = 90;
/** Longitudes up to this far past 180 belong to the `antimeridian` rule. */
const UNWRAPPED_LIMIT = 360;
/** How many out-of-range positions of a geometry are tried against each system. */
const SAMPLE_SIZE = 16;
/** How many systems a finding names. */
const MAX_CANDIDATES = 3;
/** With a region, a system must put at least this share of the sample in it to be named. */
const MIN_REGION_SHARE = 0.5;

/** UTM eastings run from about 166,000 to 834,000 metres across a zone, and northings to about 9.4 million. */
const UTM_EASTING_RANGE = [100000, 900000] as const;
const UTM_NORTHING_LIMIT = 9400000;
const UTM_SOUTH_NORTHING_RANGE = [1000000, 10000000] as const;

interface Candidate {
  readonly code: string;
  readonly name: string;
  readonly reason: string;
  readonly share: number;
}

/** The largest a swapped (latitude, longitude) pair's second number can be and still be a longitude. */
const LONGITUDE_LIMIT = 180;

/**
 * Whether a position cannot be longitude and latitude in either order, and is
 * not merely a longitude a little past 180 (which the `antimeridian` rule
 * reports). A pair whose second number is too big for a latitude but which
 * would be valid with the two numbers swapped (a latitude, then a longitude) is
 * left to `coordinate-order`, because calling it projected would be wrong.
 */
function isProjected(position: readonly number[]): boolean {
  const first = Math.abs(position[0] as number);
  const second = Math.abs(position[1] as number);
  if (second > LATITUDE_LIMIT) {
    return !(first <= LATITUDE_LIMIT && second <= LONGITUDE_LIMIT);
  }
  return first > UNWRAPPED_LIMIT;
}

/** An evenly spaced sample of at most `size` items, always including the first. */
function sample<T>(items: readonly T[], size: number): T[] {
  if (items.length <= size) {
    return [...items];
  }
  return Array.from(
    { length: size },
    (_, i) => items[Math.floor((i * items.length) / size)] as T,
  );
}

function fitsUtmRange(points: readonly (readonly number[])[]): boolean {
  return points.every(([x, y]) => {
    const easting = x as number;
    const northing = y as number;
    const eastingFits =
      easting >= UTM_EASTING_RANGE[0] && easting <= UTM_EASTING_RANGE[1];
    const northFits = northing >= 0 && northing <= UTM_NORTHING_LIMIT;
    const southFits =
      northing >= UTM_SOUTH_NORTHING_RANGE[0] &&
      northing <= UTM_SOUTH_NORTHING_RANGE[1];
    return eastingFits && (northFits || southFits);
  });
}

/** Share of the sample that a system reprojects to a place inside its area of use. */
function fitShare(
  system: CandidateSystem,
  points: readonly (readonly number[])[],
): number {
  const fitting = points.filter(([x, y]) =>
    fitsArea(system, system.inverse(x as number, y as number)),
  );
  return fitting.length / points.length;
}

function candidatesWithoutRegion(
  points: readonly (readonly number[])[],
): Candidate[] {
  const found: Candidate[] = [];
  const [webMercator, ...nationalGrids] = OTHER_SYSTEMS;
  const ordered: (CandidateSystem | "utm")[] = [
    webMercator as CandidateSystem,
    "utm",
    ...nationalGrids,
  ];
  for (const system of ordered) {
    if (system === "utm") {
      if (fitsUtmRange(points)) {
        found.push({
          code: "EPSG:326xx or EPSG:327xx",
          name: "WGS 84 / UTM, zone not known",
          reason:
            "easting between 100,000 and 900,000 and a northing that fits a hemisphere; give --region to find the zone",
          share: 1,
        });
      }
    } else if (fitShare(system, points) === 1) {
      found.push({
        code: system.code,
        name: system.name,
        reason: system.describeRange,
        share: 1,
      });
    }
  }
  return found;
}

function candidatesWithRegion(
  points: readonly (readonly number[])[],
  context: RuleContext,
): Candidate[] {
  const countries = context.countries;
  if (countries === undefined) {
    return [];
  }
  const scored: Candidate[] = [];
  for (const system of [...OTHER_SYSTEMS, ...allUtmZones()]) {
    const inside = points.filter(([x, y]) => {
      const [longitude, latitude] = system.inverse(x as number, y as number);
      return (
        fitsArea(system, [longitude, latitude]) &&
        context.regions.some((code) =>
          countries.contains(code, longitude, latitude),
        )
      );
    });
    const share = inside.length / points.length;
    if (share >= MIN_REGION_SHARE) {
      scored.push({
        code: system.code,
        name: system.name,
        reason: `puts ${Math.round(share * 100)} per cent of the positions checked in ${context.regions.join(" or ")}`,
        share,
      });
    }
  }
  return scored.sort((a, b) => b.share - a.share);
}

function describeCandidates(
  candidates: readonly Candidate[],
  regions: readonly string[],
): string {
  if (candidates.length === 0) {
    const where =
      regions.length > 0 ? ` that put them in ${regions.join(" or ")}` : "";
    return `They fit none of the systems${where} that geolint tries (Web Mercator, UTM, British National Grid, Irish Transverse Mercator, Lambert-93).`;
  }
  const [best, ...others] = candidates as [Candidate, ...Candidate[]];
  const more =
    others.length > 0
      ? ` Also possible: ${others.map((c) => c.code).join(", ")}.`
      : "";
  return `The most likely system is ${best.name} (${best.code}): ${best.reason}.${more}`;
}

function check(feature: unknown, context: RuleContext): Finding[] {
  return leafGeometries(feature).flatMap((leaf) => {
    const { positions: projected, first } = matchingPositions(
      leaf,
      isProjected,
    );
    if (first === undefined) {
      return [];
    }
    const points = sample(projected, SAMPLE_SIZE);
    const candidates = (
      context.regions.length > 0
        ? candidatesWithRegion(points, context)
        : candidatesWithoutRegion(points)
    ).slice(0, MAX_CANDIDATES);
    return [
      {
        ruleId: "projected-coords",
        severity: "error",
        confidence: "high",
        path: first.pointer,
        message: `${projected.length === 1 ? "A position is" : `${projected.length} positions are`} outside the range of longitude (-180 to 180) and latitude (-90 to 90), so the coordinates are probably projected and not WGS 84. ${describeCandidates(candidates, context.regions)}`,
        fixable: false,
        data: {
          count: projected.length,
          candidates: candidates.map(({ code, name, reason }) => ({
            code,
            name,
            reason,
          })),
        },
      } satisfies Finding,
    ];
  });
}

/** Reports coordinates outside longitude and latitude range, and names the projected systems they most likely come from. */
export const projectedCoordsRule: Rule = {
  id: "projected-coords",
  severity: "error",
  confidence: "high",
  summary:
    "Coordinates outside -180 to 180 and -90 to 90, with the projected system they probably use (ranked by --region)",
  fixable: false,
  needsRegion: false,
  check,
};
