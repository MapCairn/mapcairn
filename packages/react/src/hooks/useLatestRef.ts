// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * Keeps a ref synced to the latest committed value of something an effect or
 * event listener needs to read at the moment it actually fires, rather than
 * at the moment it was bound.
 * @remarks The ref is set in a layout effect, not during render. A render that
 *   React throws away (for example a transition that suspends and is never
 *   committed) therefore never leaves a value in the ref that was not
 *   committed. The layout effect runs before any passive effect of the same
 *   commit and before any event that follows the commit, so a listener bound
 *   once by a library (one that only re-runs its own setup on some other
 *   value's change), a passive effect, an event handler or a timer reads the
 *   current value. A layout effect of the same component declared after this
 *   hook sees it too. In the commit that changes the value, two readers still
 *   see the previous one: a layout effect of the same component declared
 *   before this hook, and anything a child's layout effect runs, such as a
 *   callback it invokes or an event it fires. While a Suspense boundary hides
 *   an already mounted tree, React tears down that tree's layout effects, so
 *   the ref keeps its last committed value while the tree's passive effects
 *   and engine listeners stay live. The first render's value is in the ref
 *   from the start.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
