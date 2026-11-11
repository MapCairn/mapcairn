import type { MapProjection } from "../ports/map";
import type { UrlStateValue } from "../ports/url";
import type { SurfaceKind } from "../surface/surface";

/**
 * What finishes a tour step when the person does it.
 * - `layer-on`: more data layers are on than when the step began.
 * - `projection-changed`: the map shape differs from when the step began.
 * - `surface`: the named surface is open (for example `search`, which opens
 *   when the search field takes focus).
 */
export type TourAdvance =
  | { readonly kind: "layer-on" }
  | { readonly kind: "projection-changed" }
  | { readonly kind: "surface"; readonly surface: SurfaceKind };

/** The app state a tour step's {@link TourAdvance} reads. */
export interface TourSnapshot {
  /** How many data layers are on. */
  readonly layersOn: number;
  readonly projection: MapProjection;
  readonly surface: SurfaceKind;
}

/**
 * Where the tour is: off, showing the welcome card, on a step, or showing
 * the ending card. `step` is the index of the current step while running.
 */
export type TourState =
  | { readonly status: "off" | "welcome" | "ended"; readonly step: 0 }
  | {
      readonly status: "running";
      readonly step: number;
      /** How many steps the running tour has. */
      readonly steps: number;
    };

/** An event that may move the tour. */
export type TourAction =
  | { readonly type: "offer" }
  | { readonly type: "start"; readonly steps: number }
  | { readonly type: "next" }
  | { readonly type: "close" };

/** No tour on screen. */
export const initialTourState: TourState = { status: "off", step: 0 };

const ENDED: TourState = { status: "ended", step: 0 };

/**
 * Applies an action to the tour. Pure: an action that changes nothing
 * returns the same state. `start` always begins at the first step, so Help
 * can restart a running tour; `next` past the last step shows the ending.
 */
export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "offer":
      return state.status === "off" ? { status: "welcome", step: 0 } : state;
    case "start":
      return { status: "running", step: 0, steps: action.steps };
    case "next":
      if (state.status !== "running") {
        return state;
      }
      return state.step + 1 < state.steps
        ? { ...state, step: state.step + 1 }
        : ENDED;
    case "close":
      return state.status === "off" ? state : initialTourState;
    default:
      return state;
  }
}

/**
 * Whether the person has done what a step asks, comparing the app state when
 * the step began with the state now.
 */
export function stepDone(
  advance: TourAdvance,
  atStart: TourSnapshot,
  now: TourSnapshot,
): boolean {
  switch (advance.kind) {
    case "layer-on":
      return now.layersOn > atStart.layersOn;
    case "projection-changed":
      return now.projection !== atStart.projection;
    case "surface":
      return now.surface === advance.surface;
    default:
      return false;
  }
}

/**
 * Whether to offer the tour on this page load: the person has not answered
 * this version, storage will remember the answer, and the address carries no
 * shared view, layers or shapes (a person following a link wants the map they
 * were sent). A link with only a basemap still gets the offer.
 * @param input.link - The address state read once at start.
 */
export function shouldOfferTour(input: {
  readonly seen: number | null;
  readonly version: number;
  readonly link: UrlStateValue;
  readonly persistent: boolean;
}): boolean {
  const { seen, version, link, persistent } = input;
  if (!persistent || (seen !== null && seen >= version)) {
    return false;
  }
  return (
    link.view === undefined &&
    link.layers === undefined &&
    link.shapes === undefined
  );
}
