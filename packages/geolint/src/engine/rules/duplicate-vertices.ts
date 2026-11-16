// SPDX-License-Identifier: Apache-2.0
// Copyright MapCairn contributors
import type { Position } from "../geometry/predicates.js";
import { leafGeometries, linesOf, ringsOf } from "../geometry/walk.js";
import { pointer } from "../json.js";
import type { Finding, Rule } from "../types.js";
import {
  fixLeaves,
  identicalPositions,
  MIN_LINE_POSITIONS,
  MIN_RING_POSITIONS,
  mapRuns,
  type RunKind,
} from "./fixSupport.js";

const RULE_ID = "duplicate-vertices";

const MINIMUM_POSITIONS: Readonly<Record<RunKind, number>> = {
  line: MIN_LINE_POSITIONS,
  ring: MIN_RING_POSITIONS,
};

/** A stretch of positions that each repeat the one before: where it starts and how many repeats it holds. */
interface Repeats {
  readonly index: number;
  readonly count: number;
}

/** The runs of consecutive identical positions, in order. `index` is the first repeated position. */
function repeatsIn(positions: readonly Position[]): Repeats[] {
  const repeats: Repeats[] = [];
  for (let start = 1; start < positions.length; start++) {
    if (
      !identicalPositions(
        positions[start] as Position,
        positions[start - 1] as Position,
      )
    ) {
      continue;
    }
    let end = start;
    while (
      end + 1 < positions.length &&
      identicalPositions(
        positions[end + 1] as Position,
        positions[end] as Position,
      )
    ) {
      end++;
    }
    repeats.push({ index: start, count: end - start + 1 });
    start = end;
  }
  return repeats;
}

/** The positions without the ones that repeat the one before; the same array when none does. */
function withoutRepeats(positions: readonly Position[]): readonly Position[] {
  const kept = positions.filter(
    (position, index) =>
      index === 0 ||
      !identicalPositions(position, positions[index - 1] as Position),
  );
  return kept.length === positions.length ? positions : kept;
}

/**
 * Whether the repeats can go without leaving too few positions for a line (two)
 * or a ring (four).
 */
function canRemoveRepeats(
  positions: readonly Position[],
  kind: RunKind,
): boolean {
  return withoutRepeats(positions).length >= MINIMUM_POSITIONS[kind];
}

function messageFor(count: number): string {
  return count === 1
    ? "A position is repeated straight after itself."
    : `A position is repeated ${count} times in a row.`;
}

/**
 * Consecutive identical positions in a line or a polygon ring. The closing
 * position of a ring repeating the first is not a duplicate. A run of repeats
 * is one finding. When removing the repeats would leave a line with fewer than
 * two positions or a ring with fewer than four, the geometry is left alone and
 * the finding is not fixable.
 */
export const duplicateVerticesRule: Rule = {
  id: RULE_ID,
  severity: "warning",
  confidence: "high",
  summary: "A line or ring repeats a position straight after itself.",
  fixable: true,
  needsRegion: false,
  check(feature) {
    const findings: Finding[] = [];
    for (const leaf of leafGeometries(feature)) {
      const runs = [
        ...linesOf(leaf).map((run) => ({ run, kind: "line" as const })),
        ...ringsOf(leaf).map((run) => ({ run, kind: "ring" as const })),
      ];
      for (const { run, kind } of runs) {
        const fixable = canRemoveRepeats(run.positions, kind);
        for (const { index, count } of repeatsIn(run.positions)) {
          findings.push({
            ruleId: RULE_ID,
            severity: "warning",
            confidence: "high",
            path: pointer(run.pointer, index),
            message: messageFor(count),
            fixable,
            data: { count },
          });
        }
      }
    }
    return findings;
  },
  fix(feature) {
    return fixLeaves(feature, (leaf) =>
      mapRuns(leaf, (run, info) =>
        canRemoveRepeats(run, info.kind) ? withoutRepeats(run) : run,
      ),
    );
  },
};
