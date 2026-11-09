import type { SheetDetent } from "../sheet/sheet";

/** The one surface that is open over the map, or `"none"`. */
export type SurfaceKind = "none" | "sheet" | "search" | "measure" | "pin";

/** The sections of the map options sheet. */
export type SheetSection = "basemap" | "pin" | "settings" | "help" | "data";

/** The control that should receive focus when a surface closes. */
export type FocusTarget = "map-options" | "search" | "measure" | "pin";

/**
 * Everything the chrome needs to know about which surface is open.
 * @remarks Exactly one surface is active at a time. `hasPin` is separate
 *   because a dropped pin is data on the map, not a surface: it can exist
 *   while the pin card is closed, or while another surface (measure, for
 *   example) is active.
 */
export interface SurfaceState {
  readonly surface: SurfaceKind;
  /** The sheet's detent. Meaningful only while `surface` is `"sheet"`. */
  readonly sheetDetent: SheetDetent;
  /** The open sheet section, or null when the sheet is closed. */
  readonly sheetSection: SheetSection | null;
  /**
   * Where focus should go when the surface closes. `null` means the map
   * region. The value is kept after the surface closes so the effect that
   * restores focus can read it; the next surface to open replaces it.
   */
  readonly returnFocusTo: FocusTarget | null;
  /** Whether a pin is on the map, whether or not its card is open. */
  readonly hasPin: boolean;
}

/** Nothing is open, no pin is dropped and focus belongs to the map. */
export const initialSurfaceState: SurfaceState = {
  surface: "none",
  sheetDetent: "half",
  sheetSection: null,
  returnFocusTo: null,
  hasPin: false,
};

/** An event that may change which surface is open. */
export type SurfaceAction =
  | { readonly type: "openSheet"; readonly section: SheetSection }
  | { readonly type: "closeSurface" }
  | { readonly type: "openSearch" }
  | { readonly type: "startMeasure" }
  | { readonly type: "stopMeasure" }
  | { readonly type: "dropPin" }
  | { readonly type: "clearPin" }
  | { readonly type: "setDetent"; readonly detent: SheetDetent }
  | { readonly type: "escape" }
  | { readonly type: "blurSearch" };

/**
 * Opens the map options sheet at the half detent.
 * @param section - The section to show. Defaults to the basemap picker.
 */
export function openSheet(section: SheetSection = "basemap"): SurfaceAction {
  return { type: "openSheet", section };
}

/** Closes whichever surface is open. */
export function closeSurface(): SurfaceAction {
  return { type: "closeSurface" };
}

/** Opens the search results surface. */
export function openSearch(): SurfaceAction {
  return { type: "openSearch" };
}

/** Starts measuring. */
export function startMeasure(): SurfaceAction {
  return { type: "startMeasure" };
}

/** Stops measuring. Does nothing when measure is not the active surface. */
export function stopMeasure(): SurfaceAction {
  return { type: "stopMeasure" };
}

/**
 * Records a dropped pin. The pin card opens unless measure is active, in
 * which case measure stays the active surface.
 */
export function dropPin(): SurfaceAction {
  return { type: "dropPin" };
}

/** Removes the pin, and closes its card if that is the active surface. */
export function clearPin(): SurfaceAction {
  return { type: "clearPin" };
}

/** Moves the sheet to a detent. Ignored unless the sheet is open. */
export function setDetent(detent: SheetDetent): SurfaceAction {
  return { type: "setDetent", detent };
}

/**
 * The Escape key. Closes the active surface entirely, including a sheet at
 * the full detent (it does not step down to half).
 */
export function pressEscape(): SurfaceAction {
  return { type: "escape" };
}

/** The search input lost focus. Closes search, and only search. */
export function blurSearch(): SurfaceAction {
  return { type: "blurSearch" };
}

function open(
  state: SurfaceState,
  surface: Exclude<SurfaceKind, "none" | "sheet">,
  focus: FocusTarget,
): SurfaceState {
  if (state.surface === surface && state.returnFocusTo === focus) {
    return state;
  }
  return {
    ...state,
    surface,
    sheetDetent: initialSurfaceState.sheetDetent,
    sheetSection: null,
    returnFocusTo: focus,
  };
}

function close(
  state: SurfaceState,
  returnFocusTo: FocusTarget | null = state.returnFocusTo,
): SurfaceState {
  if (state.surface === "none") {
    return state;
  }
  return {
    ...state,
    surface: "none",
    sheetDetent: initialSurfaceState.sheetDetent,
    sheetSection: null,
    returnFocusTo,
  };
}

/**
 * Applies an action to the surface state. Pure: unchanged states are
 * returned by reference so React can skip re-rendering.
 */
export function surfaceReducer(
  state: SurfaceState,
  action: SurfaceAction,
): SurfaceState {
  switch (action.type) {
    case "openSheet": {
      if (state.surface === "sheet") {
        if (state.sheetSection === action.section) {
          return state;
        }
        return { ...state, sheetSection: action.section };
      }
      return {
        ...state,
        surface: "sheet",
        sheetDetent: initialSurfaceState.sheetDetent,
        sheetSection: action.section,
        returnFocusTo: "map-options",
      };
    }
    case "openSearch":
      return open(state, "search", "search");
    case "startMeasure":
      return open(state, "measure", "measure");
    case "dropPin": {
      // The pin is data, so it is recorded even when measure keeps the
      // surface to itself.
      const withPin = state.hasPin ? state : { ...state, hasPin: true };
      if (state.surface === "measure") {
        return withPin;
      }
      return open(withPin, "pin", "pin");
    }
    case "clearPin": {
      if (!state.hasPin) {
        return state;
      }
      const withoutPin = { ...state, hasPin: false };
      return state.surface === "pin" ? close(withoutPin) : withoutPin;
    }
    case "stopMeasure":
      return state.surface === "measure" ? close(state) : state;
    case "setDetent":
      if (state.surface !== "sheet" || state.sheetDetent === action.detent) {
        return state;
      }
      return { ...state, sheetDetent: action.detent };
    case "closeSurface":
    case "escape":
      return close(state);
    case "blurSearch":
      // Focus has already moved on, so there is nothing to restore.
      return state.surface === "search" ? close(state, null) : state;
    default:
      return state;
  }
}
