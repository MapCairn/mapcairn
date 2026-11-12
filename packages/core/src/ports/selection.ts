// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapFeatureHit } from "./map";

/**
 * One selected feature: its layer's id and its own id, as a tap reports them.
 * An alias of {@link MapFeatureHit}, so a tap's hits can be selected as they
 * are. Two references are the same feature when both ids are equal. A store
 * keeps exactly those two ids, `layerId` and `featureId`, so a field that
 * `MapFeatureHit` gains later is not kept.
 */
export type FeatureRef = MapFeatureHit;

/**
 * A key that is equal for two references exactly when both ids are equal, for
 * a set or a map of references. Ids may hold any character, so the pair is
 * encoded, not joined with a separator. Every store and every reader of one
 * uses this key, so they cannot disagree on which references are the same.
 */
export function featureRefKey(ref: FeatureRef): string {
  return JSON.stringify([ref.layerId, ref.featureId]);
}

/** The most references a selection holds unless its host sets another limit. */
export const DEFAULT_SELECTION_LIMIT = 200;

/**
 * The set of features a person has picked, kept wherever the host likes: in
 * memory, on a server or in its own state. Optional on `Services`: a host that
 * supplies none offers no selection, and the ui must not require it.
 *
 * The port is synchronous so that `useSyncExternalStore` can read it, which
 * needs a snapshot of stable identity, so it has no loading or failed state. A
 * store that saves somewhere slow keeps a local copy, writes behind it and
 * calls its subscribers when the copy changes, when it hydrates, or when a
 * save fails and it restores the copy.
 *
 * Rules for every implementation:
 * - `getState()` returns the same array until a change, in selection order.
 *   `getState` and `subscribe` work when taken off the object, as React reads
 *   them.
 * - A duplicate is ignored, within a call and against what is already held.
 * - A call that changes the set tells every subscriber once. A call that
 *   changes nothing tells none.
 * - A call that would take the total past `limit` changes nothing, so a batch
 *   is refused whole. A refusal is silent and the methods return nothing, so a
 *   caller who needs to tell a refused batch from one of duplicates compares
 *   `getState()` before and after.
 * - A store may hold more than `limit` references, for example when it
 *   hydrates a longer list. It shows them all and refuses every addition, and
 *   removing is always allowed.
 * - No method throws, provided its input is well typed (every reference an
 *   object with both ids) and every listener returns without throwing.
 */
export interface FeatureSelection {
  /** The most references the set holds. */
  readonly limit: number;
  /** The selected references in selection order. It is also the server snapshot. */
  getState(): readonly FeatureRef[];
  /** Calls `listener` after each change and returns how to stop. */
  subscribe(listener: () => void): () => void;
  /** Appends the references that are not yet selected, in order. */
  add(refs: readonly FeatureRef[]): void;
  /** Removes the references that are selected, keeping the order of the rest. */
  remove(refs: readonly FeatureRef[]): void;
  /**
   * Makes the set exactly `refs`, in that order, without their duplicates.
   * Refused whole when the result would pass `limit`. The same members in
   * another order are a change.
   */
  replace(refs: readonly FeatureRef[]): void;
  /** Empties the set. */
  clear(): void;
}
