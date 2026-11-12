// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import type { FeatureRef, FeatureSelection } from "../ports/selection";

/** The limit the contract asks {@link FeatureSelectionSubject} factories for. */
export const CONTRACT_SELECTION_LIMIT = 3;

/** What the feature selection contract needs besides the store itself. */
export interface FeatureSelectionControls {
  /**
   * Changes the set from outside the ui, as a host does when it hydrates or
   * restores a set after a failed save: no limit applies, and subscribers
   * are told once if the set changed. Optional: the hydration cases are
   * skipped for a store that has no such way in.
   */
  replaceExternally?(refs: readonly FeatureRef[]): void;
}

/** One feature selection under test, with its controls. */
export interface FeatureSelectionSubject {
  readonly selection: FeatureSelection;
  readonly controls: FeatureSelectionControls;
}

/** Options the contract passes to the factory it is given. */
export interface FeatureSelectionSubjectOptions {
  /** The limit the store must have. */
  readonly limit: number;
}

function ref(layerId: string, featureId: string): FeatureRef {
  return { layerId, featureId };
}

const A = ref("gauges", "a");
const B = ref("gauges", "b");
const C = ref("quakes", "c");
const D = ref("quakes", "d");
const E = ref("quakes", "e");

function counter(selection: FeatureSelection): () => number {
  let calls = 0;
  selection.subscribe(() => {
    calls += 1;
  });
  return () => calls;
}

/**
 * Runs the shared behavioural suite for a {@link FeatureSelection}. Every test
 * calls `create` for a fresh, empty subject with a limit of
 * {@link CONTRACT_SELECTION_LIMIT}.
 */
export function runFeatureSelectionContract(
  name: string,
  create: (options: FeatureSelectionSubjectOptions) => FeatureSelectionSubject,
): void {
  const subject = (): FeatureSelectionSubject =>
    create({ limit: CONTRACT_SELECTION_LIMIT });

  describe(`FeatureSelection contract: ${name}`, () => {
    it("starts empty and has the limit it was built with", () => {
      const { selection } = subject();
      expect(selection.getState()).toEqual([]);
      expect(selection.limit).toBe(CONTRACT_SELECTION_LIMIT);
    });

    it("returns the same array until something changes", () => {
      const { selection } = subject();
      expect(selection.getState()).toBe(selection.getState());
      selection.add([A]);
      const held = selection.getState();
      expect(selection.getState()).toBe(held);
      selection.add([A]);
      selection.remove([B]);
      selection.replace([A]);
      expect(selection.getState()).toBe(held);
      selection.add([B]);
      expect(selection.getState()).not.toBe(held);
      expect(held).toEqual([A]);
    });

    it("keeps references in selection order", () => {
      const { selection } = subject();
      selection.add([B, A]);
      selection.add([C]);
      expect(selection.getState()).toEqual([B, A, C]);
      selection.remove([A]);
      expect(selection.getState()).toEqual([B, C]);
    });

    it("holds a copy of what it is given", () => {
      const { selection } = subject();
      const refs = [A];
      selection.add(refs);
      refs.push(B);
      expect(selection.getState()).toEqual([A]);
    });

    it("ignores a reference it already holds, and a duplicate within a call", () => {
      const { selection } = subject();
      selection.add([A, A, B]);
      selection.add([B, C]);
      expect(selection.getState()).toEqual([A, B, C]);
    });

    it("tells two references apart by both ids, and by value", () => {
      const { selection } = subject();
      selection.add([ref("a:b", "c"), ref("a", "b:c"), ref("a", "c")]);
      expect(selection.getState()).toHaveLength(3);
      selection.add([{ ...ref("a", "c") }]);
      expect(selection.getState()).toHaveLength(3);
      selection.remove([{ ...ref("a:b", "c") }]);
      expect(selection.getState()).toEqual([ref("a", "b:c"), ref("a", "c")]);
    });

    it("works through references taken off the object, as React reads it", () => {
      const { selection } = subject();
      const { getState, subscribe } = selection;
      const calls = vi.fn();
      const stop = subscribe(calls);
      selection.add([A]);
      expect(getState()).toEqual([A]);
      expect(calls).toHaveBeenCalledTimes(1);
      stop();
    });

    it("tells every subscriber once for a call that changes the set, however many it changes", () => {
      const { selection } = subject();
      const first = counter(selection);
      const second = counter(selection);
      selection.add([A, B, C]);
      expect([first(), second()]).toEqual([1, 1]);
      selection.remove([A, B]);
      expect([first(), second()]).toEqual([2, 2]);
      selection.replace([D, E]);
      expect([first(), second()]).toEqual([3, 3]);
      selection.clear();
      expect([first(), second()]).toEqual([4, 4]);
    });

    it("reads the new set when a subscriber is told", () => {
      const { selection } = subject();
      const seen: (readonly FeatureRef[])[] = [];
      selection.subscribe(() => seen.push(selection.getState()));
      selection.add([A]);
      expect(seen).toEqual([[A]]);
      expect(seen[0]).toBe(selection.getState());
    });

    it("tells nobody when a call changes nothing", () => {
      const { selection } = subject();
      selection.add([A, B]);
      const calls = counter(selection);
      selection.add([]);
      selection.add([A]);
      selection.add([B, A]);
      selection.remove([]);
      selection.remove([C]);
      selection.replace([A, B]);
      selection.replace([A, B, A]);
      expect(calls()).toBe(0);
      selection.clear();
      selection.clear();
      expect(calls()).toBe(1);
    });

    it("removes only what is selected", () => {
      const { selection } = subject();
      selection.add([A, B, C]);
      selection.remove([D, B]);
      expect(selection.getState()).toEqual([A, C]);
    });

    it("replaces the set with the references given, in their order and without duplicates", () => {
      const { selection } = subject();
      selection.add([A, B]);
      selection.replace([C, A, C]);
      expect(selection.getState()).toEqual([C, A]);
      selection.replace([]);
      expect(selection.getState()).toEqual([]);
    });

    it("counts the same members in another order as a change", () => {
      const { selection } = subject();
      selection.add([A, B]);
      const calls = counter(selection);
      selection.replace([B, A]);
      expect(selection.getState()).toEqual([B, A]);
      expect(calls()).toBe(1);
    });

    it("holds as many as its limit", () => {
      const { selection } = subject();
      selection.add([A, B, C]);
      expect(selection.getState()).toEqual([A, B, C]);
    });

    it("refuses a batch that would pass the limit whole, and tells nobody", () => {
      const { selection } = subject();
      selection.add([A, B]);
      const held = selection.getState();
      const calls = counter(selection);
      selection.add([C, D]);
      expect(selection.getState()).toBe(held);
      expect(calls()).toBe(0);
    });

    it("counts only the references that are new against the limit", () => {
      const { selection } = subject();
      selection.add([A, B]);
      selection.add([B, C, C]);
      expect(selection.getState()).toEqual([A, B, C]);
    });

    it("refuses a replacement that would pass the limit whole", () => {
      const { selection } = subject();
      selection.add([A]);
      const held = selection.getState();
      const calls = counter(selection);
      selection.replace([A, B, C, D]);
      expect(selection.getState()).toBe(held);
      expect(calls()).toBe(0);
      selection.replace([A, B, C, A]);
      expect(selection.getState()).toEqual([A, B, C]);
    });

    it("frees room when something is removed", () => {
      const { selection } = subject();
      selection.add([A, B, C]);
      selection.remove([A]);
      selection.add([D]);
      expect(selection.getState()).toEqual([B, C, D]);
    });

    describe("when it holds more than its limit", () => {
      const over = [A, B, C, D, E];

      function hydrated(): FeatureSelectionSubject | undefined {
        const made = subject();
        if (made.controls.replaceExternally === undefined) {
          return undefined;
        }
        made.controls.replaceExternally(over);
        return made;
      }

      it("shows every reference and tells subscribers once", () => {
        const made = subject();
        if (made.controls.replaceExternally === undefined) {
          return;
        }
        const calls = counter(made.selection);
        made.controls.replaceExternally(over);
        expect(made.selection.getState()).toEqual(over);
        expect(calls()).toBe(1);
        made.controls.replaceExternally(over);
        expect(calls()).toBe(1);
      });

      it("refuses every addition and replacement that would keep it over", () => {
        const made = hydrated();
        if (made === undefined) {
          return;
        }
        const { selection } = made;
        const held = selection.getState();
        const calls = counter(selection);
        selection.add([ref("quakes", "f")]);
        selection.replace([A, B, C, D]);
        expect(selection.getState()).toBe(held);
        expect(calls()).toBe(0);
      });

      it("still allows removing, and clearing", () => {
        const made = hydrated();
        if (made === undefined) {
          return;
        }
        const { selection } = made;
        selection.remove([A]);
        expect(selection.getState()).toEqual([B, C, D, E]);
        selection.remove([B, C]);
        expect(selection.getState()).toEqual([D, E]);
        selection.add([A]);
        expect(selection.getState()).toEqual([D, E, A]);
        selection.clear();
        expect(selection.getState()).toEqual([]);
      });
    });

    it("stops telling a subscriber after it unsubscribes, and unsubscribing twice is safe", () => {
      const { selection } = subject();
      const calls = vi.fn();
      const stop = selection.subscribe(calls);
      selection.add([A]);
      stop();
      expect(() => stop()).not.toThrow();
      selection.add([B]);
      expect(calls).toHaveBeenCalledTimes(1);
    });

    it("tells a subscriber added during a notification only about later changes", () => {
      const { selection } = subject();
      const late = vi.fn();
      selection.subscribe(() => {
        selection.subscribe(late);
      });
      selection.add([A]);
      expect(late).not.toHaveBeenCalled();
      selection.add([B]);
      expect(late).toHaveBeenCalledTimes(1);
    });

    it("never throws from any method", () => {
      const { selection } = subject();
      expect(() => {
        selection.add([A]);
        selection.add([A, B, C, D]);
        selection.remove([E]);
        selection.replace([A, B, C, D]);
        selection.replace([]);
        selection.clear();
        selection.subscribe(() => undefined)();
      }).not.toThrow();
    });
  });
}
