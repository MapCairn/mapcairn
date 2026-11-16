// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import { leafGeometries, matchingPositions } from "../geometry/walk.js";
import type { Finding, Rule } from "../types.js";
import { capFindings } from "./findingCap.js";

function check(feature: unknown): Finding[] {
  const found = leafGeometries(feature).flatMap((leaf) => {
    const { positions: hits, first } = matchingPositions(
      leaf,
      (position) => position[0] === 0 && position[1] === 0,
    );
    if (first === undefined) {
      return [];
    }
    const isPoint = leaf.type === "Point" || leaf.type === "MultiPoint";
    return [
      {
        ruleId: "null-island",
        severity: isPoint ? "warning" : "info",
        confidence: isPoint ? "medium" : "low",
        path: first.pointer,
        message:
          hits.length === 1
            ? "A position is exactly 0, 0 (Null Island, in the Gulf of Guinea), which is often a default written when a real location was missing."
            : `${hits.length} positions are exactly 0, 0 (Null Island, in the Gulf of Guinea), which is often a default written when a real location was missing.`,
        fixable: false,
        data: { count: hits.length },
      } satisfies Finding,
    ];
  });
  return capFindings(found, nullIslandRule, feature);
}

/** Reports a position that is exactly longitude 0, latitude 0, a common stand-in for a missing location. */
export const nullIslandRule: Rule = {
  id: "null-island",
  severity: "warning",
  confidence: "medium",
  summary: "A position at exactly 0, 0, often a default for a missing location",
  fixable: false,
  needsRegion: false,
  check,
};
