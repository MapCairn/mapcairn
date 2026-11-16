// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { type Position, ringOrientation } from "../geometry/predicates.js";
import { leafGeometries, ringsOf } from "../geometry/walk.js";
import type { Finding, Rule } from "../types.js";
import { FindingCap } from "./findingCap.js";
import { fixLeaves, MIN_RING_POSITIONS, mapRuns } from "./fixSupport.js";

const RULE_ID = "winding-order";

const COUNTER_CLOCKWISE = 1;
const CLOCKWISE = -1;

/** The winding RFC 7946 asks for: counter-clockwise outside, clockwise for a hole. */
function expectedWinding(isExterior: boolean): 1 | -1 {
  return isExterior ? COUNTER_CLOCKWISE : CLOCKWISE;
}

/** A step in longitude longer than this went round the globe the other way, as the `antimeridian` rule reads it. */
const JUMP_DEGREES = 180;

/** Whether a step between two consecutive positions is more than half a turn of longitude. */
function jumpsAcross(positions: readonly Position[]): boolean {
  return positions.some((position, index) => {
    const previous = positions[index - 1];
    return (
      previous !== undefined &&
      Math.abs((position[0] as number) - (previous[0] as number)) > JUMP_DEGREES
    );
  });
}

/**
 * Whether a ring winds the wrong way. A ring with too few positions, or with no
 * area, has no winding to get wrong, and neither has a ring that crosses the
 * antimeridian (`antimeridian` reports it): the planar test cannot say which way
 * it goes round the globe.
 */
function windsTheWrongWay(
  positions: readonly Position[],
  isExterior: boolean,
): boolean {
  if (positions.length < MIN_RING_POSITIONS || jumpsAcross(positions)) {
    return false;
  }
  const winding = ringOrientation(positions);
  return winding !== 0 && winding !== expectedWinding(isExterior);
}

/**
 * The ring reversed, when that gives it the winding RFC 7946 asks for. A ring
 * that touches itself at its lowest vertex has no single winding, and reversing
 * it can leave the turn there as it was; reversing it again and again would
 * never settle, so such a ring is left as it is.
 */
function reversedToTheRightWay(
  positions: readonly Position[],
  isExterior: boolean,
): readonly Position[] | undefined {
  const reversed = [...positions].reverse();
  return ringOrientation(reversed) === expectedWinding(isExterior)
    ? reversed
    : undefined;
}

function messageFor(isExterior: boolean): string {
  return isExterior
    ? "The outer ring runs clockwise, but RFC 7946 asks for counter-clockwise."
    : "A hole runs counter-clockwise, but RFC 7946 asks for clockwise.";
}

/**
 * RFC 7946 asks for counter-clockwise exterior rings and clockwise holes. It is
 * a SHOULD for parsers, so this is a warning. The winding is exact, so a very
 * thin ring is judged correctly. A wrong ring is fixed by reversing it, unless
 * that cannot give it the right winding (see `reversedToTheRightWay`). At most
 * twenty rings of a feature are reported and the rest are counted, but the fix
 * reverses every one.
 */
export const windingOrderRule: Rule = {
  id: RULE_ID,
  severity: "warning",
  confidence: "high",
  summary:
    "Polygon exterior rings should run counter-clockwise and holes clockwise (RFC 7946).",
  fixable: true,
  needsRegion: false,
  check(feature) {
    const found = new FindingCap(windingOrderRule, feature);
    for (const leaf of leafGeometries(feature)) {
      for (const ring of ringsOf(leaf)) {
        if (windsTheWrongWay(ring.positions, ring.isExterior)) {
          found.add(
            "warning",
            (): Finding => ({
              ruleId: RULE_ID,
              severity: "warning",
              confidence: "high",
              path: ring.pointer,
              message: messageFor(ring.isExterior),
              fixable:
                reversedToTheRightWay(ring.positions, ring.isExterior) !==
                undefined,
            }),
          );
        }
      }
    }
    return found.result();
  },
  fix(feature) {
    return fixLeaves(feature, (leaf) =>
      mapRuns(leaf, (run, info) => {
        if (info.kind !== "ring" || !windsTheWrongWay(run, info.isExterior)) {
          return run;
        }
        return reversedToTheRightWay(run, info.isExterior) ?? run;
      }),
    );
  },
};
