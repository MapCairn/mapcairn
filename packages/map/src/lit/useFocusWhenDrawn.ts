// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { useLatestRef } from "@mapcairn/react";
import { useEffect, useRef } from "react";
import { usePrivateElements } from "./usePrivateElements";

/**
 * Moves focus once, as soon as the private elements that hold its target have
 * drawn: at once on a page that has loaded them. When they load later, focus is
 * moved only if it is still where it was on mount or has been left on nothing,
 * so a person who has moved on is left alone.
 *
 * @param focus Moves focus, from an effect.
 */
export function useFocusWhenDrawn(focus: () => void): void {
  const drawn = usePrivateElements().status !== "loading";
  const focusRef = useLatestRef(focus);
  const mountedWith = useRef<Element | null>(null);
  const done = useRef(false);
  useEffect(() => {
    mountedWith.current ??= document.activeElement;
    if (!drawn || done.current) {
      return;
    }
    done.current = true;
    const now = document.activeElement;
    if (now === null || now === document.body || now === mountedWith.current) {
      focusRef.current();
    }
  }, [drawn, focusRef]);
}
