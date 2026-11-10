import type { SheetDetent } from "../sheet/sheet";

/** The one surface that is open over the map, or `"none"`. */
export type SurfaceKind =
  | "none"
  | "sheet"
  | "search"
  | "measure"
  | "draw"
  | "pin"
  | "directions";

/**
 * The sections of the sheet. `settings` and `help` open from the Settings
 * button and the rest from Map options, so each sheet shows only its own.
 */
export type SheetSection =
  | "basemap"
  | "pin"
  | "settings"
  | "help"
  | "layers"
  | "shapes";

/**
 * Whether a section belongs to the Settings sheet (Settings and Help) rather
 * than the Map options sheet. A closed sheet (`null`) is not a settings one.
 */
export function isSettingsSection(section: SheetSection | null): boolean {
  return section === "settings" || section === "help";
}

/** The control that should receive focus when a surface closes. */
export type FocusTarget =
  | "map-options"
  | "settings"
  | "search"
  | "measure"
  | "draw"
  | "draw-shapes"
  | "pin"
  | "directions";

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
  /**
   * True while the sheet is open over a drawing that was under way: closing
   * the sheet then goes back to the draw tool, with focus on its Shapes
   * button, rather than to nothing.
   */
  readonly resumeDraw: boolean;
  /**
   * True while the sheet is open over a measurement that was under way:
   * closing the sheet then goes back to the measure tool, with its points
   * kept and focus on the Measure button, rather than to nothing.
   */
  readonly resumeMeasure: boolean;
}

/** Nothing is open, no pin is dropped and focus belongs to the map. */
export const initialSurfaceState: SurfaceState = {
  surface: "none",
  sheetDetent: "half",
  sheetSection: null,
  returnFocusTo: null,
  hasPin: false,
  resumeDraw: false,
  resumeMeasure: false,
};

/** An event that may change which surface is open. */
export type SurfaceAction =
  | { readonly type: "openSheet"; readonly section: SheetSection }
  | { readonly type: "closeSurface" }
  | { readonly type: "openSearch" }
  | { readonly type: "startMeasure" }
  | { readonly type: "stopMeasure" }
  | { readonly type: "startDraw" }
  | { readonly type: "stopDraw" }
  | { readonly type: "startDirections" }
  | { readonly type: "stopDirections" }
  | { readonly type: "dropPin" }
  | { readonly type: "clearPin" }
  | { readonly type: "setDetent"; readonly detent: SheetDetent }
  | { readonly type: "escape" }
  | { readonly type: "blurSearch" };

/**
 * Opens the sheet at the half detent. Focus returns to Settings for the
 * `settings` and `help` sections and to Map options for the rest, except that
 * closing a sheet opened over a drawing goes back to the draw tool with focus
 * on its Shapes button, and over a measurement back to the measure tool with
 * focus on the Measure button.
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

/** Starts drawing shapes. It replaces any other surface, so one tool is active at a time. */
export function startDraw(): SurfaceAction {
  return { type: "startDraw" };
}

/** Stops drawing. Does nothing when draw is not the active surface. */
export function stopDraw(): SurfaceAction {
  return { type: "stopDraw" };
}

/** Opens the directions panel. */
export function startDirections(): SurfaceAction {
  return { type: "startDirections" };
}

/** Closes the directions panel. Does nothing when directions is not the active surface. */
export function stopDirections(): SurfaceAction {
  return { type: "stopDirections" };
}

/**
 * Records a dropped pin. The pin card opens unless measure, draw or
 * directions is active, in which case that tool stays the active surface.
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

function sheetFocusTarget(section: SheetSection): FocusTarget {
  return isSettingsSection(section) ? "settings" : "map-options";
}

function open(
  state: SurfaceState,
  surface: Exclude<SurfaceKind, "none" | "sheet">,
  focus: FocusTarget,
): SurfaceState {
  if (
    state.surface === surface &&
    state.returnFocusTo === focus &&
    !state.resumeDraw &&
    !state.resumeMeasure
  ) {
    return state;
  }
  return {
    ...state,
    surface,
    sheetDetent: initialSurfaceState.sheetDetent,
    sheetSection: null,
    returnFocusTo: focus,
    resumeDraw: false,
    resumeMeasure: false,
  };
}

function close(
  state: SurfaceState,
  returnFocusTo: FocusTarget | null = state.returnFocusTo,
): SurfaceState {
  if (state.surface === "none") {
    return state;
  }
  if (state.surface === "sheet" && state.resumeDraw) {
    return {
      ...state,
      surface: "draw",
      sheetDetent: initialSurfaceState.sheetDetent,
      sheetSection: null,
      returnFocusTo: "draw-shapes",
      resumeDraw: false,
    };
  }
  if (state.surface === "sheet" && state.resumeMeasure) {
    return {
      ...state,
      surface: "measure",
      sheetDetent: initialSurfaceState.sheetDetent,
      sheetSection: null,
      returnFocusTo: "measure",
      resumeMeasure: false,
    };
  }
  return {
    ...state,
    surface: "none",
    sheetDetent: initialSurfaceState.sheetDetent,
    sheetSection: null,
    returnFocusTo,
  };
}

/** The surfaces that take the map's taps, so a dropped pin leaves them open. */
const TAP_TOOLS: readonly SurfaceKind[] = ["measure", "draw", "directions"];

function dropPinState(state: SurfaceState): SurfaceState {
  // The pin is data, so it is recorded even when a tool that takes the
  // map's taps keeps the surface to itself.
  const withPin = state.hasPin ? state : { ...state, hasPin: true };
  return TAP_TOOLS.includes(state.surface)
    ? withPin
    : open(withPin, "pin", "pin");
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
        return {
          ...state,
          sheetSection: action.section,
          returnFocusTo: sheetFocusTarget(action.section),
        };
      }
      return {
        ...state,
        surface: "sheet",
        sheetDetent: initialSurfaceState.sheetDetent,
        sheetSection: action.section,
        returnFocusTo: sheetFocusTarget(action.section),
        // A drawing or measurement under way is picked up again when the
        // sheet closes.
        resumeDraw: state.surface === "draw",
        resumeMeasure: state.surface === "measure",
      };
    }
    case "openSearch":
      return open(state, "search", "search");
    case "startMeasure":
      return open(state, "measure", "measure");
    case "startDraw":
      return open(state, "draw", "draw");
    case "startDirections":
      return open(state, "directions", "directions");
    case "stopDirections":
      return state.surface === "directions" ? close(state) : state;
    case "dropPin":
      return dropPinState(state);
    case "clearPin": {
      if (!state.hasPin) {
        return state;
      }
      const withoutPin = { ...state, hasPin: false };
      return state.surface === "pin" ? close(withoutPin) : withoutPin;
    }
    case "stopMeasure":
      return state.surface === "measure" ? close(state) : state;
    case "stopDraw":
      return state.surface === "draw" ? close(state) : state;
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
