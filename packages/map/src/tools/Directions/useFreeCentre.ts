import type { LatLng, PixelPoint } from "@karta/core";
import { useCallback } from "react";
import { useChromeLayout } from "../../chrome/layoutContext";
import { useMap } from "../../host";
import { freeCentre } from "../../layers/reveal";

/** What {@link useFreeCentre} returns. */
export interface FreeCentre {
  /**
   * The middle of the part of the map the sheet or side panel leaves free, in
   * pixels, or the middle of the whole map before the chrome has measured.
   * Null before the map has mounted.
   */
  readonly pixel: PixelPoint | null;
  /** The place under {@link FreeCentre.pixel}, read when asked, or null before the map has mounted. */
  readonly position: () => LatLng | null;
}

/**
 * The target of "at the map centre" for a tool whose panel covers part of the
 * map: the middle of what is left uncovered, so it is never under the sheet.
 * Read it inside the map context and the chrome.
 */
export function useFreeCentre(): FreeCentre {
  const { adapter, view } = useMap();
  const { layout, viewport, panelEdge } = useChromeLayout();
  const covered = freeCentre({ layout, viewport, panelEdge });
  const pixel = adapter ? (covered ?? adapter.project(view.center)) : null;
  const position = useCallback(
    () => (adapter && pixel ? adapter.unproject(pixel) : null),
    [adapter, pixel],
  );
  return { pixel, position };
}
