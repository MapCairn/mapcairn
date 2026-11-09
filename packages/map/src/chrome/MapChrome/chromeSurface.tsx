import type { SheetDetent } from "@karta/core";
import { createContext, useContext } from "react";

/**
 * Facts that pass between `MapChrome` and the chrome components it lays out,
 * beyond the public `ChromeLayoutValue`. Internal to the chrome directory.
 *
 * @remarks `computeBottomSlotLayout` needs the sheet's detent (to hide the
 *   bottom slots at full) and, in the panel layout, the panel's right edge
 *   (to move bottom-start clear of it). The `Sheet` publishes both here,
 *   next to the top edge it publishes through `useChromeLayout()`. Going the
 *   other way, `MapChrome` tells the `EndStack` how tall it may be, so the
 *   zoom group can yield on short screens.
 */
export interface ChromeSurfaceValue {
  /** The sheet publishes its detent while open in the sheet layout, else null. */
  publishSheetDetent(detent: SheetDetent | null): void;
  /**
   * The side panel publishes its right edge (px from the container's left)
   * while open in the panel layout, else null.
   */
  publishPanelEdge(px: number | null): void;
  /** The tallest the end stack may be, or null before the first measurement. */
  readonly endStackMaxHeight: number | null;
}

const defaultValue: ChromeSurfaceValue = {
  publishSheetDetent() {},
  publishPanelEdge() {},
  endStackMaxHeight: null,
};

/** Provided by `MapChrome` only. */
export const ChromeSurfaceContext =
  createContext<ChromeSurfaceValue>(defaultValue);

/**
 * Reads the internal chrome surface value. Outside a `MapChrome` it returns
 * no-op publishers and an unmeasured end stack, so components test alone.
 */
export function useChromeSurface(): ChromeSurfaceValue {
  return useContext(ChromeSurfaceContext);
}
