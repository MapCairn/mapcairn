/** Priority used when map labels overlap. */
export type LabelCollisionPriority = "major" | "primary" | "secondary";

/** Pixel bounds used to test whether two rendered map labels overlap. */
export interface LabelCollisionBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** One rendered label candidate and its cartographic importance. */
export interface LabelCollisionCandidate {
  id: string;
  priority: LabelCollisionPriority;
  bounds: LabelCollisionBounds;
}

const PRIORITY_RANK: Record<LabelCollisionPriority, number> = {
  major: 0,
  primary: 1,
  secondary: 2,
};

/**
 * Returns label ids that can be shown without overlapping a higher-priority
 * label. Input order breaks ties, keeping placement stable across redraws.
 */
export function resolveNonOverlappingLabels(
  candidates: readonly LabelCollisionCandidate[],
): string[] {
  const orderedCandidates = candidates
    .map((candidate, order) => ({ candidate, order }))
    .sort(
      (left, right) =>
        PRIORITY_RANK[left.candidate.priority] -
          PRIORITY_RANK[right.candidate.priority] || left.order - right.order,
    );
  const visible: LabelCollisionCandidate[] = [];

  for (const { candidate } of orderedCandidates) {
    const overlaps = visible.some(
      (placed) =>
        candidate.bounds.left < placed.bounds.right &&
        candidate.bounds.right > placed.bounds.left &&
        candidate.bounds.top < placed.bounds.bottom &&
        candidate.bounds.bottom > placed.bounds.top,
    );
    if (!overlaps) {
      visible.push(candidate);
    }
  }

  return visible.map((candidate) => candidate.id);
}
