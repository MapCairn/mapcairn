// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  type ControlValues,
  type FeedLayerDefinition,
  feedUrl,
  type HeatmapLayerDefinition,
  isQueryLayer,
  type LayerDefinition,
  layerZoomLimit,
  loadsFeatures,
  nextQueryWindow,
  type ZoomLimit,
} from "@mapcairn/core";

/** What the map last showed, which a query layer asks for features around. */
export interface QueryView {
  readonly area: Bounds;
  /** The normalised zoom. */
  readonly zoom: number;
}

/** A layer whose features are loaded, from a feed or a query. */
export type LoadableLayer = FeedLayerDefinition | HeatmapLayerDefinition;

/** One load a layer asks for, and the key that says when it has changed. */
export interface WantedLoad {
  readonly id: string;
  readonly definition: LoadableLayer;
  /** The request's URL and the layer's retry count: a new key is a new load. */
  readonly key: string;
  /** Every control's value, resolved against the definition. */
  readonly controls: ControlValues;
  /** The window a query layer asks for. Absent for a feed. */
  readonly area?: Bounds;
}

/** What {@link wantedLoads} reads to work out what the enabled layers ask for. */
export interface LoadInputs {
  /** The enabled layers' ids. */
  readonly enabled: readonly string[];
  readonly definitions: ReadonlyMap<string, LayerDefinition>;
  readonly controls: Readonly<Record<string, ControlValues>>;
  readonly retries: Readonly<Record<string, number>>;
  readonly view: QueryView | null;
  /** The window each query layer last asked for, kept while the view stays inside it. */
  readonly windows: ReadonlyMap<string, Bounds>;
  /** The clock, in epoch milliseconds. */
  readonly now: number;
}

/** What {@link planLoads} decides to do about the loads the layers want. */
export interface LoadPlan {
  /** Layers whose request in flight is for something that is no longer wanted. */
  readonly cancel: readonly string[];
  /** Layers whose settled request is for something that is no longer wanted. */
  readonly forget: readonly string[];
  /** Layers with no request in flight or settled for what they want now. */
  readonly start: readonly WantedLoad[];
}

/** Whether a query layer is too far out for the view to ask for features. */
export function isTooFarOut(
  definition: LayerDefinition,
  view: QueryView | null,
): boolean {
  return isQueryLayer(definition) && viewZoomLimit(definition, view) !== null;
}

/**
 * Which way to zoom, and to which level, for a layer to show what the view is
 * at, or null when the view is inside its zoom window, it has none or the map
 * has not said where it is.
 */
export function viewZoomLimit(
  definition: LayerDefinition,
  view: QueryView | null,
): ZoomLimit | null {
  return view === null ? null : layerZoomLimit(definition, view.zoom);
}

/**
 * What each enabled layer that loads features asks for. A query layer asks
 * for a window around the map's view, kept while the view stays inside it,
 * and for nothing until the map has said where it is or while it is too far
 * out. Pure: the window it chose is remembered with {@link rememberWindows}.
 */
export function wantedLoads(inputs: LoadInputs): WantedLoad[] {
  const { definitions, view, windows, now } = inputs;
  return inputs.enabled.flatMap((id): WantedLoad[] => {
    const definition = definitions.get(id);
    if (!definition || !loadsFeatures(definition)) {
      return [];
    }
    const controls = inputs.controls[id] ?? {};
    const retries = inputs.retries[id] ?? 0;
    if (!isQueryLayer(definition)) {
      const key = `${feedUrl(definition, controls, now)}#${retries}`;
      return [{ id, definition, key, controls }];
    }
    if (!view || isTooFarOut(definition, view)) {
      return [];
    }
    const area = nextQueryWindow(windows.get(id) ?? null, view.area);
    const key = `${feedUrl(definition, controls, now, area)}#${retries}`;
    return [{ id, definition, key, controls, area }];
  });
}

/**
 * Keeps the window of each query layer that asks for one, and forgets the
 * window of any layer that no longer does (too far out, or off), so it asks
 * afresh when it next has to.
 */
export function rememberWindows(
  windows: Map<string, Bounds>,
  wanted: readonly WantedLoad[],
): void {
  windows.clear();
  for (const { id, area } of wanted) {
    if (area) {
      windows.set(id, area);
    }
  }
}

/**
 * Works out what has to change for the layers to have what they want. A
 * request is cancelled, or a settled one forgotten, when its key is no
 * longer wanted (including a layer that is no longer wanted at all). A load
 * starts for each wanted request that is neither in flight nor settled, so
 * a layer that has settled is not loaded again because another was turned
 * on or off.
 */
export function planLoads(
  wanted: readonly WantedLoad[],
  inFlight: ReadonlyMap<string, { readonly key: string }>,
  settled: ReadonlyMap<string, string>,
): LoadPlan {
  const wantedKeys = new Map(wanted.map((load) => [load.id, load.key]));
  const isStale = (id: string, key: string) => wantedKeys.get(id) !== key;
  return {
    cancel: [...inFlight]
      .filter(([id, request]) => isStale(id, request.key))
      .map(([id]) => id),
    forget: [...settled]
      .filter(([id, key]) => isStale(id, key))
      .map(([id]) => id),
    start: wanted.filter(
      (load) =>
        inFlight.get(load.id)?.key !== load.key &&
        settled.get(load.id) !== load.key,
    ),
  };
}
