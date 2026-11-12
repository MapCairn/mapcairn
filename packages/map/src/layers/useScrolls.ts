// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * Whether the element's content is taller than the element, so it scrolls.
 * Re-checked when the element or its content changes size: the content grows
 * without the element growing when something else caps its height.
 *
 * @param ref - The scrolling element. Its children are observed too, because
 *   a child changes size as content comes and goes while the element, capped,
 *   does not.
 * @param active - Whether the element is on the page. Nothing is observed, and
 *   the answer is false, while it is not.
 */
export function useScrolls(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): boolean {
  const [scrolls, setScrolls] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!(active && element) || typeof ResizeObserver === "undefined") {
      setScrolls(false);
      return;
    }
    const check = () => {
      setScrolls(element.scrollHeight > element.clientHeight);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    return () => {
      observer.disconnect();
    };
  }, [ref, active]);
  return scrolls;
}
