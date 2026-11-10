import type { SheetDetent } from "../sheet/sheet";

/** How the map options surface is presented. */
export type ChromeLayout = "sheet" | "panel";

/** Width from which the surface is a side panel rather than a bottom sheet. */
export const PANEL_MIN_WIDTH = 768;

/** Height below which the surface is a side panel whatever the width. */
export const PANEL_MAX_HEIGHT_EXCLUSIVE = 500;

/**
 * Chooses the presentation for a viewport: a side panel from 768px wide or on
 * any screen shorter than 500px, otherwise a bottom sheet.
 */
export function chooseLayout(viewport: {
  width: number;
  height: number;
}): ChromeLayout {
  return viewport.width >= PANEL_MIN_WIDTH ||
    viewport.height < PANEL_MAX_HEIGHT_EXCLUSIVE
    ? "panel"
    : "sheet";
}

/** Offsets that keep the bottom slots clear of the surfaces above them. */
export interface BottomSlotLayout {
  /** Rightwards shift of bottom-start, in pixels. Never negative. */
  readonly bottomStartTranslateX: number;
  /** Vertical shift of bottom-start. Zero or negative (upwards). */
  readonly bottomStartTranslateY: number;
  /** Vertical shift of bottom-end. Zero or negative (upwards). */
  readonly bottomEndTranslateY: number;
  /** True when the bottom slots should be hidden (sheet at the full detent). */
  readonly hideBottomSlots: boolean;
}

/**
 * Where the bottom slots sit relative to their resting place, which is
 * `inset` above the bottom edge and `inset` in from the side.
 *
 * @param input.layout - `"none"` when no sheet or panel is shown (the measure
 *   toolbar may still be).
 * @param input.sheetTopEdge - Distance from the top of the viewport to the
 *   sheet's top edge. Used only in the `"sheet"` layout.
 * @param input.panelRightEdge - Distance from the left of the viewport to the
 *   panel's right edge. Used only in the `"panel"` layout.
 * @param input.measureToolbarTop - Distance from the top of the viewport to
 *   the measure toolbar, when it is showing.
 * @param input.restingInset - How far above the bottom edge the slots rest,
 *   when that is more than `inset` because a row sits below them. `inset`
 *   stays the gap kept above a surface. Defaults to `inset`.
 * @remarks Both bottom slots ride `inset` above the highest of the sheet's
 *   top edge and the toolbar's top. A side panel moves only bottom-start,
 *   sideways. The result never lifts further than the viewport is tall.
 */
export function computeBottomSlotLayout(input: {
  layout: ChromeLayout | "none";
  viewportWidth: number;
  viewportHeight: number;
  sheetTopEdge: number | null;
  sheetDetent: SheetDetent | null;
  panelRightEdge: number | null;
  measureToolbarTop: number | null;
  inset: number;
  restingInset?: number;
}): BottomSlotLayout {
  const {
    layout,
    viewportWidth,
    viewportHeight,
    sheetTopEdge,
    sheetDetent,
    panelRightEdge,
    measureToolbarTop,
    inset,
    restingInset = inset,
  } = input;

  const obstructions: number[] = [];
  if (layout === "sheet" && sheetTopEdge !== null) {
    obstructions.push(sheetTopEdge);
  }
  if (measureToolbarTop !== null) {
    obstructions.push(measureToolbarTop);
  }

  let lift = 0;
  if (obstructions.length > 0) {
    const restingBottom = viewportHeight - restingInset;
    const wantedBottom = Math.min(...obstructions) - inset;
    const offset = wantedBottom - restingBottom;
    // Only ever lift: a surface below the viewport edge must not push the
    // slots down, and a negative -0 would be a pointless "move".
    lift = offset < 0 ? Math.max(-viewportHeight, offset) : 0;
  }

  let shiftX = 0;
  if (layout === "panel" && panelRightEdge !== null) {
    const restingLeft = inset;
    const wantedLeft = panelRightEdge + inset;
    shiftX = Math.max(0, Math.min(viewportWidth, wantedLeft - restingLeft));
  }

  return {
    bottomStartTranslateX: shiftX,
    bottomStartTranslateY: lift,
    bottomEndTranslateY: lift,
    hideBottomSlots: layout === "sheet" && sheetDetent === "full",
  };
}

/**
 * The tallest the end stack may be before it scrolls.
 * @param input.topOffset - Distance from the top of the viewport to the
 *   stack's first control.
 * @param input.bottomReserved - Space below the stack that must stay clear,
 *   such as the bottom slots.
 * @param input.inset - Gap kept to the bottom edge.
 */
export function computeEndStackMaxHeight(input: {
  viewportHeight: number;
  topOffset: number;
  bottomReserved: number;
  inset: number;
}): number {
  const { viewportHeight, topOffset, bottomReserved, inset } = input;
  return Math.max(0, viewportHeight - topOffset - bottomReserved - inset);
}

/** Whether to show the zoom buttons, and whether height alone hid them. */
export interface ZoomButtonVisibility {
  readonly show: boolean;
  /** True when the device default would show them but the stack is too short. */
  readonly yieldedToHeight: boolean;
}

/**
 * Decides whether to show the zoom buttons.
 * @param input.setting - The user's setting. An explicit `true` always shows
 *   them (the stack scrolls instead of hiding them) and an explicit `false`
 *   never does. `null` uses the device default: shown for a fine pointer
 *   unless there is less than `minHeightForZoom` available.
 */
export function shouldShowZoomButtons(input: {
  setting: boolean | null;
  finePointer: boolean;
  availableHeight: number;
  minHeightForZoom: number;
}): ZoomButtonVisibility {
  const { setting, finePointer, availableHeight, minHeightForZoom } = input;
  if (setting !== null) {
    return { show: setting, yieldedToHeight: false };
  }
  if (!finePointer) {
    return { show: false, yieldedToHeight: false };
  }
  if (availableHeight < minHeightForZoom) {
    return { show: false, yieldedToHeight: true };
  }
  return { show: true, yieldedToHeight: false };
}
