// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type RefObject, useEffect, useLayoutEffect } from "react";

/** Whether a scroll container has more to scroll to, and in which direction. */
export type ScrollMore = "none" | "above" | "below" | "both";

/** How far from an edge counts as being at it, for fractional scroll positions. */
const EDGE_SLACK_PX = 1;

/**
 * What is left to scroll to in `element`: `below` while the end is out of
 * sight, `above` once it has scrolled away from the start, `both` in between,
 * `none` when everything fits.
 */
export function scrollMoreOf(element: HTMLElement): ScrollMore {
  const above = element.scrollTop > EDGE_SLACK_PX;
  const below =
    element.scrollTop + element.clientHeight <
    element.scrollHeight - EDGE_SLACK_PX;
  if (above && below) {
    return "both";
  }
  if (above) {
    return "above";
  }
  return below ? "below" : "none";
}

/**
 * Keeps `data-scroll-more` on a scroll container up to date with
 * {@link scrollMoreOf}, so its style can fade the edge that has more behind it
 * (`scrollFade`) and a test can read it. It is set directly on the element, not
 * through state, because it changes on every scroll.
 *
 * @param ref - The scroll container.
 * @remarks It is read again after every render of the caller (the content
 *   changes with them), when the container or one of its children resizes, and
 *   on scroll. Where there is no `ResizeObserver`, the render and the scroll
 *   still keep it current.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (element) {
      element.dataset.scrollMore = scrollMoreOf(element);
    }
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const update = () => {
      element.dataset.scrollMore = scrollMoreOf(element);
    };
    element.addEventListener("scroll", update, { passive: true });
    if (typeof ResizeObserver === "undefined") {
      return () => element.removeEventListener("scroll", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) {
      observer.observe(child);
    }
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref]);
}
