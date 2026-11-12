// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  DEFAULT_SELECTION_LIMIT,
  type FeatureRef,
  type FeatureSelection,
} from "../ports/selection";

/** Options for {@link MemoryFeatureSelection}. */
export interface MemoryFeatureSelectionOptions {
  /**
   * The most references it holds: a whole number of at least zero. Defaults to
   * {@link DEFAULT_SELECTION_LIMIT}.
   */
  readonly limit?: number;
}

/** A key that is equal for two references exactly when both ids are equal. */
function refKey(ref: FeatureRef): string {
  return JSON.stringify([ref.layerId, ref.featureId]);
}

/** The references without repeats, in order, as frozen copies of their two ids. */
function uniqueRefs(refs: readonly FeatureRef[]): readonly FeatureRef[] {
  const seen = new Set<string>();
  const unique: FeatureRef[] = [];
  for (const { layerId, featureId } of refs) {
    const ref = Object.freeze({ layerId, featureId });
    const key = refKey(ref);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ref);
    }
  }
  return unique;
}

function sameSequence(
  left: readonly FeatureRef[],
  right: readonly FeatureRef[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (ref, index) => refKey(ref) === refKey(right[index] as FeatureRef),
    )
  );
}

/**
 * An in-memory {@link FeatureSelection}: the SDK's store and its fake in one
 * class, as {@link MemorySettingsStore} is. A host that wants the set kept
 * elsewhere supplies its own store instead.
 *
 * How to script it: pass `limit` to change how many references it holds, and
 * call `replaceExternally` to change the set from outside, as a host does when
 * it hydrates a saved set or restores one after a failed save. Its
 * `getState` and `subscribe` are arrow properties, so they work unbound.
 */
export class MemoryFeatureSelection implements FeatureSelection {
  readonly limit: number;

  #refs: readonly FeatureRef[] = Object.freeze([]);
  #listeners = new Set<() => void>();

  constructor(options: MemoryFeatureSelectionOptions = {}) {
    const limit = options.limit ?? DEFAULT_SELECTION_LIMIT;
    if (!Number.isInteger(limit) || limit < 0) {
      throw new RangeError(
        `A selection limit must be a whole number of at least zero, not ${limit}.`,
      );
    }
    this.limit = limit;
  }

  readonly getState = (): readonly FeatureRef[] => this.#refs;

  readonly subscribe = (listener: () => void): (() => void) => {
    const entry = () => listener();
    this.#listeners.add(entry);
    return () => {
      this.#listeners.delete(entry);
    };
  };

  add(refs: readonly FeatureRef[]): void {
    const held = new Set(this.#refs.map(refKey));
    const fresh = uniqueRefs(refs).filter((ref) => !held.has(refKey(ref)));
    if (fresh.length === 0 || this.#refs.length + fresh.length > this.limit) {
      return;
    }
    this.#publish([...this.#refs, ...fresh]);
  }

  remove(refs: readonly FeatureRef[]): void {
    const dropped = new Set(refs.map(refKey));
    this.#publish(this.#refs.filter((ref) => !dropped.has(refKey(ref))));
  }

  replace(refs: readonly FeatureRef[]): void {
    const next = uniqueRefs(refs);
    if (next.length > this.limit) {
      return;
    }
    this.#publish(next);
  }

  clear(): void {
    this.#publish([]);
  }

  /**
   * Makes the set exactly `refs`, without their duplicates and whatever the
   * limit, and tells the subscribers once if that changed it. For a test to
   * script a change from outside the ui.
   */
  replaceExternally(refs: readonly FeatureRef[]): void {
    this.#publish(uniqueRefs(refs));
  }

  /** Keeps `next` and tells every subscriber once, unless it is the set already held. */
  #publish(next: readonly FeatureRef[]): void {
    if (sameSequence(this.#refs, next)) {
      return;
    }
    this.#refs = Object.freeze(next);
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}
