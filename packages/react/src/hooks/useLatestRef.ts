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
 *   committed. The layout effect runs before any passive effect of the
 *   same commit and before an event can fire, so a listener bound once by a
 *   library (one that only re-runs its own setup on some other value's change)
 *   still reads the current value. A layout effect of the same component that
 *   is declared after this hook sees the new value too. A layout effect of a
 *   child that reads the ref in the commit that changes it still sees the
 *   previous value, so read it from an event, a callback or a passive effect.
 *   The first render's value is in the ref from the start.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
