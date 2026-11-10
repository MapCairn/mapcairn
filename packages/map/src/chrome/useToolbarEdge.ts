import { useLatestRef } from "@mapcairn/react";
import { type RefObject, useLayoutEffect, useRef } from "react";
import { useChromeLayout } from "./layoutContext";

/**
 * Publishes the top edge of a bottom toolbar through
 * `useChromeLayout().publishToolbarTop`, so the slots below it ride above it,
 * and publishes `null` when the toolbar unmounts.
 *
 * @param rootRef - The toolbar's outer element, which is measured.
 * @remarks The published edge is `getBoundingClientRect().top`, in viewport
 *   pixels, which equals the chrome container's own coordinates when the
 *   container fills the viewport. It is measured again when the toolbar
 *   resizes and when the container does, which can move the toolbar without
 *   changing its own size. The same value is not published twice.
 */
export function useToolbarEdge(rootRef: RefObject<HTMLElement | null>): void {
  const { publishToolbarTop, viewport } = useChromeLayout();
  const publishRef = useLatestRef(publishToolbarTop);
  const lastTop = useRef<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the viewport size is the trigger, not a value read in the effect
  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }
    const publish = () => {
      const top = Math.round(element.getBoundingClientRect().top);
      if (top !== lastTop.current) {
        lastTop.current = top;
        publishRef.current(top);
      }
    };
    publish();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef, publishRef, viewport.width, viewport.height]);

  useLayoutEffect(
    () => () => {
      lastTop.current = null;
      publishRef.current(null);
    },
    [publishRef],
  );
}
