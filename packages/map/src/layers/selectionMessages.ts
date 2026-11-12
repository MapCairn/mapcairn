// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceFeatureDeselected,
  announceFeatureSelected,
  announceFeaturesDeselected,
  announceFeaturesSelected,
  announceSelectionCleared,
  announceSelectionFull,
  type FeatureRef,
} from "@mapcairn/core";
import type { AnnounceOptions } from "../ui/LiveRegion";
import { selectionKey } from "./selectionResolve";

/** What to say about one change to the selection, and how urgently. */
export interface SelectionAnnouncement {
  readonly message: string;
  readonly options: AnnounceOptions;
}

/** The title to say for a reference, or null when it has none to give (it is not shown). */
export type TitleOf = (ref: FeatureRef) => string | null;

function keysOf(refs: readonly FeatureRef[]): ReadonlySet<string> {
  return new Set(refs.map(selectionKey));
}

/** The references of `refs` whose keys are not in `held`. */
function missingFrom(
  held: ReadonlySet<string>,
  refs: readonly FeatureRef[],
): readonly FeatureRef[] {
  return refs.filter((ref) => !held.has(selectionKey(ref)));
}

/**
 * What an addition did, from the set before and after it: one message with
 * the new total when something was added, naming the feature when exactly one
 * was and it has a title. When nothing was added but `requested` held a
 * reference that was not already selected, the store refused the batch for
 * its `limit`, which is announced assertively, as a refused import is, so a
 * later polite message cannot replace it. When every reference was already
 * selected nothing changed, and nothing is said.
 */
export function addedAnnouncement(
  requested: readonly FeatureRef[],
  before: readonly FeatureRef[],
  after: readonly FeatureRef[],
  limit: number,
  titleOf: TitleOf,
): SelectionAnnouncement | null {
  const held = keysOf(before);
  const added = missingFrom(held, after);
  if (added.length === 0) {
    return missingFrom(held, requested).length > 0
      ? {
          message: announceSelectionFull(limit),
          options: { priority: "assertive" },
        }
      : null;
  }
  const [only] = added;
  const title = added.length === 1 && only ? titleOf(only) : null;
  return {
    message:
      title === null
        ? announceFeaturesSelected(added.length, after.length)
        : announceFeatureSelected(title, after.length),
    options: { priority: "polite" },
  };
}

/** What a removal did, from the set before and after it: one message with the new total, or null when nothing was removed. */
export function removedAnnouncement(
  before: readonly FeatureRef[],
  after: readonly FeatureRef[],
  titleOf: TitleOf,
): SelectionAnnouncement | null {
  const removed = missingFrom(keysOf(after), before);
  if (removed.length === 0) {
    return null;
  }
  const [only] = removed;
  const title = removed.length === 1 && only ? titleOf(only) : null;
  return {
    message:
      title === null
        ? announceFeaturesDeselected(removed.length, after.length)
        : announceFeatureDeselected(title, after.length),
    options: { priority: "polite" },
  };
}

/** What emptying the set did: "Selection cleared.", or null when it was already empty. */
export function clearedAnnouncement(
  before: readonly FeatureRef[],
): SelectionAnnouncement | null {
  return before.length === 0
    ? null
    : { message: announceSelectionCleared(), options: { priority: "polite" } };
}
