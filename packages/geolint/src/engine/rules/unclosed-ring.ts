// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { type Position, samePosition } from "../geometry/predicates.js";
import { leafGeometries, ringsOf } from "../geometry/walk.js";
import type { Finding, Rule } from "../types.js";
import { fixLeaves, identicalPositions, mapRuns } from "./fixSupport.js";

const RULE_ID = "unclosed-ring";

/** Fewer positions than this is not a ring at all, and is for the `structure` rule. */
const MIN_CHECKED_POSITIONS = 3;

function isOpen(positions: readonly Position[]): boolean {
  if (positions.length < MIN_CHECKED_POSITIONS) {
    return false;
  }
  const first = positions[0] as Position;
  const last = positions[positions.length - 1] as Position;
  return !identicalPositions(first, last);
}

/**
 * The ring with its closing position set to a copy of the first position. A
 * last position that already sits at the first one's longitude and latitude
 * (and differs only in altitude or in length) is replaced rather than followed
 * by a second copy, so the ring does not gain a zero-length segment.
 */
function closed(positions: readonly Position[]): readonly Position[] {
  const first = positions[0] as Position;
  const last = positions[positions.length - 1] as Position;
  const body = samePosition(first, last) ? positions.slice(0, -1) : positions;
  return [...body, [...first]];
}

/**
 * A polygon ring whose last position is not identical to its first. RFC 7946
 * requires a closed ring, and parsers differ in what they do with an open one.
 */
export const unclosedRingRule: Rule = {
  id: RULE_ID,
  severity: "error",
  confidence: "high",
  summary: "A polygon ring must end at the position where it starts.",
  fixable: true,
  needsRegion: false,
  check(feature) {
    const findings: Finding[] = [];
    for (const leaf of leafGeometries(feature)) {
      for (const ring of ringsOf(leaf)) {
        if (isOpen(ring.positions)) {
          findings.push({
            ruleId: RULE_ID,
            severity: "error",
            confidence: "high",
            path: ring.pointer,
            message:
              "The ring is not closed: its last position is not the same as its first.",
            fixable: true,
          });
        }
      }
    }
    return findings;
  },
  fix(feature) {
    return fixLeaves(feature, (leaf) =>
      mapRuns(leaf, (run, info) =>
        info.kind === "ring" && isOpen(run) ? closed(run) : run,
      ),
    );
  },
};
