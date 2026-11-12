// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceDetailError,
  announceDetailShown,
  announceFeaturesFound,
  announceLayerOn,
  announceLayersTurnedBackOn,
  announceLayersTurnedOff,
  announceTilesRecovered,
  announceTilesUnavailable,
  type Bounds,
  type ControlValues,
  describeChosenTime,
  type FieldValue,
  isFeedLayer,
  isQueryLayer,
  isRasterTileLayer,
  type LayerAttribution,
  type LayerDefinition,
  type LayerFeature,
  type LayersUrlState,
  loadsFeatures,
  parseTime,
  resolveControlValues,
  tileUrl,
} from "@mapcairn/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useServices } from "../services";
import { useAnnounce } from "../ui/LiveRegion";
import { errorKind, type LayerStatus } from "./layerStatus";
import { type LoadResult, loadOutcome } from "./loadOutcome";
import { type AnnouncedStates, reportLoad, reportZoomIn } from "./loadReport";
import {
  isTooFarOut,
  planLoads,
  type QueryView,
  rememberWindows,
  type WantedLoad,
  wantedLoads,
} from "./loadRequests";

export type { LayerStatus };

/**
 * How long the Undo after turning layers off stays on offer, in milliseconds.
 * It is not shorter than a status message's shortest stay, so there is time to
 * read it and to reach Undo by keyboard.
 */
export const UNDO_TIMEOUT_MS = 10_000;

/** One layer as the ui shows it. */
export interface DataLayerState {
  readonly definition: LayerDefinition;
  readonly enabled: boolean;
  /** Every control's value, resolved against the definition. */
  readonly controls: ControlValues;
  readonly status: LayerStatus;
  /** The loaded features, in the order the provider sent them. */
  readonly features: readonly LayerFeature[];
  /** The id of the list's sort option. */
  readonly sortId: string;
  /** The features in list order. */
  readonly sorted: readonly LayerFeature[];
}

/** The feature whose card is open, with its layer. */
export interface SelectedFeature {
  readonly layer: DataLayerState;
  readonly feature: LayerFeature;
}

/** A feature's affected area, loaded on request. */
export interface DetailState {
  readonly layerId: string;
  readonly featureId: string;
  readonly status: "loading" | "shown" | "error";
  readonly shapes: readonly LayerFeature[];
}

/** What can hold the countdown to an Undo offer's expiry: the pointer over its status, or focus inside it. */
export type UndoHolder = "pointer" | "focus";

/** The batch of layers that was last turned off at once, which Undo would turn back on. */
export interface TurnedOff {
  /** How many layers Undo would turn back on: those of the batch that are still off and still in the catalogue. */
  readonly count: number;
  /** The group whose action turned them off, or null when the action covered every layer. */
  readonly group: string | null;
}

/** What {@link useDataLayers} returns: the layers' state and every action on them. */
export interface DataLayers {
  /** Every registered layer, in registry order. */
  readonly layers: readonly DataLayerState[];
  readonly selected: SelectedFeature | null;
  /**
   * The features a tap or the keyboard found together, when there were
   * several, so one can be chosen. Null when no list is open. The open card
   * offers a way back to it while it is.
   */
  readonly choices: readonly SelectedFeature[] | null;
  readonly detail: DetailState | null;
  /** Grows each time a selection asks for its card to take focus (a tap on the map). */
  readonly focusRequest: number;
  /**
   * True from a request for the card to take focus until
   * {@link DataLayers.consumeFocus}. The section that shows the card is
   * unmounted whenever the sheet closes, so what has been acted on is kept
   * here: reopening the sheet later must not repeat it.
   */
  readonly focusPending: boolean;
  /** Marks the latest focus request as acted on. */
  readonly consumeFocus: () => void;
  /** The layers part of the permalink. */
  readonly urlValue: LayersUrlState;
  /** The credits of the layers that are on, for the map credits. */
  readonly credits: readonly LayerAttribution[];
  /** The clock the hook uses, for relative times in cards and lists. */
  readonly now: () => number;
  setEnabled(id: string, enabled: boolean): void;
  /**
   * Turns several layers off as one change: one state update, so one redraw
   * and one address update, and one announcement ("3 layers turned off"). Ids
   * that are not on, or not known, are ignored, and nothing happens when none
   * is on. Each layer's selected feature, list of choices and affected area
   * close as they do for a single layer. It offers {@link DataLayers.turnedOff}
   * for {@link UNDO_TIMEOUT_MS}, replacing any earlier offer. `group` says
   * which group's action asked, so the ui can show the Undo beside it.
   */
  turnOff(ids: readonly string[], options?: { readonly group?: string }): void;
  /** The batch Undo would turn back on, or null when none is on offer (none yet, used, replaced, expired or every layer of it already on again). */
  readonly turnedOff: TurnedOff | null;
  /**
   * Turns back on the layers of the last {@link DataLayers.turnOff}, in one
   * change and one announcement. A layer's control values stay while it is
   * off, so they come back as they are. A layer that is on again, or no
   * longer in the catalogue, is skipped; the rest of what the person changed
   * meanwhile is left as it is. Does nothing when no offer is open.
   */
  undoTurnOff(): void;
  /** Pauses the offer's countdown while `by` is on its status. The countdown waits until every holder has released. */
  holdUndo(by: UndoHolder): void;
  /** Ends `by`'s hold; once none is left the countdown starts again, in full. */
  releaseUndo(by: UndoHolder): void;
  setControl(id: string, controlId: string, value: string): void;
  setSort(id: string, sortId: string): void;
  retry(id: string): void;
  /**
   * Records that the map settled with none of a tile layer's tiles loaded,
   * which `MapDataLayers` calls from the adapter's report. `tiles` is the
   * template those tiles came from: a report for anything but the layer's
   * current tiles, or for a layer that is off, is ignored. The layer then
   * says so and announces it once, until its tiles change, it is turned off, or
   * a tile loads later (see {@link DataLayers.reportTilesRecovered}).
   */
  reportTilesUnavailable(id: string, tiles: string): void;
  /**
   * Records that a tile loaded for the `tiles` a layer had reported no tiles
   * for, which `MapDataLayers` calls from the adapter's report. The layer's
   * status goes and the layer says so once, politely. A recovery for any other
   * tiles, or for a layer that is not showing the status, is ignored.
   */
  reportTilesRecovered(id: string, tiles: string): void;
  /**
   * Opens a feature's card, or closes it (and any list) with `null`. A card
   * opened without `keepChoices` also closes the list of features found
   * together.
   */
  select(
    layerId: string,
    featureId: string | null,
    options?: {
      readonly focus?: boolean;
      /** Keeps the list of features found together open behind the card. */
      readonly keepChoices?: boolean;
    },
  ): void;
  /**
   * Handles several features found at once (a tap or the keyboard route):
   * with one it opens its card, with more it opens the list to choose from,
   * and with none it does nothing. Features no loaded layer has are dropped.
   */
  choose(
    hits: readonly { readonly layerId: string; readonly featureId: string }[],
    options?: { readonly focus?: boolean },
  ): void;
  /** Closes the open card and returns to the list of features found together. */
  backToChoices(options?: { readonly focus?: boolean }): void;
  /**
   * Tells query layers what the map shows, once it has settled: the visible
   * box and the normalised zoom. A query layer asks for the features in a
   * window around it, and says to zoom in below its own `minzoom`.
   */
  setView(area: Bounds, zoom: number): void;
  showDetail(layerId: string, featureId: string): void;
  hideDetail(): void;
}

/** Options for {@link useDataLayers}. */
export interface UseDataLayersOptions {
  /** Layers and control values from a permalink. Unknown ids and values are dropped. */
  readonly initial?: LayersUrlState;
  /** The clock. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface State {
  readonly enabled: readonly string[];
  readonly controls: Readonly<Record<string, ControlValues>>;
  readonly sorts: Readonly<Record<string, string>>;
  readonly results: Readonly<Record<string, LoadResult>>;
  readonly retries: Readonly<Record<string, number>>;
  /** The tiles each tile layer found no imagery for, by layer id (see `reportTilesUnavailable`). */
  readonly tilesUnavailable: Readonly<Record<string, string>>;
  /**
   * The open card's feature. Its snapshot keeps the card open when a query
   * layer refreshes for another part of the map and no longer lists it.
   */
  readonly selection: {
    readonly layerId: string;
    readonly featureId: string;
    readonly snapshot?: LayerFeature;
  } | null;
  readonly choices:
    | readonly { readonly layerId: string; readonly featureId: string }[]
    | null;
  /** What the map last showed, for query layers. */
  readonly view: QueryView | null;
  readonly focusRequest: number;
  /** The `focusRequest` that has been acted on. */
  readonly focusHandled: number;
  readonly detail: DetailState | null;
  /** The last batch turned off at once, for Undo. */
  readonly undo: UndoOffer | null;
}

/** The layers a batch turned off, and the group whose action asked, if any. */
interface UndoOffer {
  readonly ids: readonly string[];
  readonly group: string | null;
}

/** The layers of an offer that Undo would turn on: still off, and still in the catalogue. */
function stillOff(
  offer: UndoOffer,
  enabled: readonly string[],
  known: ReadonlyMap<string, LayerDefinition>,
): string[] {
  return offer.ids.filter((id) => known.has(id) && !enabled.includes(id));
}

const OFF: LoadResult = { status: { kind: "off" }, features: [] };

function initialState(
  definitions: readonly LayerDefinition[],
  initial: LayersUrlState | undefined,
  now: number,
): State {
  const known = new Set(definitions.map((definition) => definition.id));
  return {
    enabled: (initial?.enabled ?? []).filter((id) => known.has(id)),
    controls: Object.fromEntries(
      definitions.map((definition) => [
        definition.id,
        resolveControlValues(definition, initial?.controls[definition.id], now),
      ]),
    ),
    sorts: {},
    results: {},
    retries: {},
    tilesUnavailable: {},
    selection: null,
    choices: null,
    view: null,
    focusRequest: 0,
    focusHandled: 0,
    detail: null,
    undo: null,
  };
}

/** The record without these layers' entries. */
function without<T>(
  record: Readonly<Record<string, T>>,
  ids: ReadonlySet<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([id]) => !ids.has(id)),
  );
}

/**
 * The state with what belongs to these layers cleared, for layers that are
 * turning on or off: what they loaded, tiles known to have failed, their
 * selected feature, their entries in a list of choices and their affected area.
 */
function withoutTraces(state: State, ids: ReadonlySet<string>): State {
  const choices = state.choices?.filter((choice) => !ids.has(choice.layerId));
  return {
    ...state,
    results: without(state.results, ids),
    tilesUnavailable: without(state.tilesUnavailable, ids),
    selection:
      state.selection && ids.has(state.selection.layerId)
        ? null
        : state.selection,
    choices: choices && choices.length > 0 ? choices : null,
    detail: state.detail && ids.has(state.detail.layerId) ? null : state.detail,
  };
}

/**
 * The state with a layer loading. A query layer keeps what it draws while the
 * next window loads; a feed clears its features.
 */
function withLoading(state: State, load: WantedLoad): State {
  const { id, definition } = load;
  const kept = isQueryLayer(definition)
    ? (state.results[id]?.features ?? [])
    : [];
  return {
    ...state,
    results: {
      ...state.results,
      [id]: { status: { kind: "loading" }, features: kept },
    },
  };
}

/** The tiles a raster tile layer asks for with these controls, or null for any other layer. */
function tilesOf(
  definition: LayerDefinition,
  controls: ControlValues,
  now: number,
): string | null {
  return isRasterTileLayer(definition)
    ? tileUrl(definition, controls, now)
    : null;
}

/** What is known of failed tiles once the layer asks for `tiles`: nothing, if they are not the ones that failed. */
function tilesUnavailableFor(
  failed: State["tilesUnavailable"],
  id: string,
  tiles: string | null,
): State["tilesUnavailable"] {
  if (failed[id] === undefined || failed[id] === tiles) {
    return failed;
  }
  const rest = { ...failed };
  delete rest[id];
  return rest;
}

/** A value to sort by: numbers and readable times as numbers, else text. */
function sortable(value: FieldValue | undefined): number | string | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return parseTime(value) ?? value;
  }
  return null;
}

function compare(a: FieldValue | undefined, b: FieldValue | undefined): number {
  const left = sortable(a);
  const right = sortable(b);
  if (left === null || right === null) {
    return left === right ? 0 : left === null ? 1 : -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function sortFeatures(
  definition: LayerDefinition,
  features: readonly LayerFeature[],
  sortId: string,
): readonly LayerFeature[] {
  if (!isFeedLayer(definition)) {
    return features;
  }
  const sorts = definition.list.sorts;
  const sort = sorts.find((item) => item.id === sortId) ?? sorts[0];
  if (!sort) {
    return features;
  }
  const direction = sort.direction === "desc" ? -1 : 1;
  return [...features].sort((a, b) => {
    const order = compare(a.fields[sort.field], b.fields[sort.field]);
    // Missing values stay last whichever way the list runs.
    const missing =
      a.fields[sort.field] == null || b.fields[sort.field] == null;
    return missing ? order : order * direction;
  });
}

/**
 * The state of every data layer and the actions on it, driven entirely by
 * the definitions in the registry: nothing here names a layer.
 *
 * @remarks Nothing is requested until a layer is turned on. A feed layer is
 *   loaded on enable, on a control change and on retry; the request for the
 *   previous URL is cancelled. Tile layers need no request here: the map
 *   draws their tiles, and says through `reportTilesUnavailable` when none
 *   loaded and `reportTilesRecovered` when one loads later. Loads, empty
 *   feeds and failures are announced once each through the shared live
 *   region, failures assertively and a tile layer with no tiles, and its
 *   recovery, politely. Turning a layer off clears its features, its selection
 *   and its affected area.
 */
export function useDataLayers(options: UseDataLayersOptions = {}): DataLayers {
  const { layers: registry, layerSource } = useServices();
  const announce = useAnnounce();
  const now = useCallback(() => (options.now ?? Date.now)(), [options.now]);
  const definitions = registry.list();
  const [state, setState] = useState(() =>
    initialState(definitions, options.initial, now()),
  );
  /**
   * What the handlers below read. It follows the last committed state, set in
   * a layout effect so a render React throws away (a transition that
   * suspends) never leaves its state here, and before any effect of the
   * same commit runs. A layout effect of a child that calls a handler in the
   * same commit would still see the previous state; the handlers are only
   * called from events and the map's callbacks.
   */
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const requests = useRef(
    new Map<string, { key: string; controller: AbortController }>(),
  );
  /** The request key each layer last settled for, so a settled layer is not loaded again. */
  const loadedKeys = useRef(new Map<string, string>());
  /** The window each query layer last asked for, remembered once its request is committed. */
  const queryWindows = useRef(new Map<string, Bounds>());
  const announcedStates = useRef<AnnouncedStates>(new Map());
  const detailRequest = useRef<AbortController | null>(null);

  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  const wanted = wantedLoads({
    enabled: state.enabled,
    definitions: byId,
    controls: state.controls,
    retries: state.retries,
    view: state.view,
    windows: queryWindows.current,
    now: now(),
  });
  const signature = wanted.map(({ id, key }) => `${id} ${key}`).join("\n");

  // Query layers that are too far out, so each is told once to zoom in.
  const tooFar = state.enabled.filter((id) => {
    const definition = byId.get(id);
    return definition !== undefined && isTooFarOut(definition, state.view);
  });
  const tooFarSignature = tooFar.join(" ");

  // Remembers the windows asked for, and forgets those of layers that no
  // longer ask (turned off, or too far out). It runs after every commit: that
  // is cheap, and it needs no dependency list to keep in step with `wanted`.
  useEffect(() => {
    rememberWindows(queryWindows.current, wanted);
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the signatures are the triggers; everything else is read through refs or is stable.
  useEffect(() => {
    for (const id of tooFar) {
      reportZoomIn(
        byId.get(id) as LayerDefinition,
        announcedStates.current,
        announce,
      );
    }
  }, [tooFarSignature]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature is the trigger; everything else is read through refs or is stable.
  useEffect(() => {
    /** Starts one load, shows the layer as loading, and settles it when the source answers. */
    const startLoad = (load: WantedLoad) => {
      const { id, key, definition } = load;
      const controller = new AbortController();
      requests.current.set(id, { key, controller });
      setState((current) => withLoading(current, load));
      loadOutcome(layerSource, load, now, controller.signal).then((outcome) => {
        if (!outcome) {
          return;
        }
        if (requests.current.get(id)?.key === key) {
          requests.current.delete(id);
          loadedKeys.current.set(id, key);
          setState((current) => ({
            ...current,
            results: { ...current.results, [id]: outcome.result },
          }));
        }
        // A load that was replaced meanwhile is not shown but is still said (#81).
        reportLoad(
          definition,
          outcome.spoken,
          announcedStates.current,
          announce,
        );
      });
    };

    const plan = planLoads(wanted, requests.current, loadedKeys.current);
    for (const id of plan.cancel) {
      requests.current.get(id)?.controller.abort();
      requests.current.delete(id);
    }
    for (const id of plan.forget) {
      loadedKeys.current.delete(id);
    }
    for (const load of plan.start) {
      startLoad(load);
    }
  }, [signature]);

  // The offer to undo lets go after UNDO_TIMEOUT_MS, counted from when it was
  // made, and waits while the person is on it. It is state, not a ui timer:
  // the section unmounts when the sheet closes, and a stale offer must not
  // be there when it opens again.
  const offer = state.undo;
  const [undoHolds, setUndoHolds] = useState<Record<UndoHolder, boolean>>({
    pointer: false,
    focus: false,
  });
  const undoHeld = undoHolds.pointer || undoHolds.focus;
  useEffect(() => {
    if (!offer || undoHeld) {
      return;
    }
    const timer = setTimeout(
      () =>
        setState((previous) =>
          previous.undo === offer ? { ...previous, undo: null } : previous,
        ),
      UNDO_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [offer, undoHeld]);

  useEffect(
    () => () => {
      for (const request of requests.current.values()) {
        request.controller.abort();
      }
      requests.current.clear();
      detailRequest.current?.abort();
    },
    [],
  );

  /** Drops what the hook holds outside the state for these layers: their open request for an affected area, and what they last said. */
  const forgetLayers = useCallback((ids: ReadonlySet<string>) => {
    const detail = stateRef.current.detail;
    if (detail && ids.has(detail.layerId)) {
      detailRequest.current?.abort();
    }
    for (const id of ids) {
      announcedStates.current.delete(id);
    }
  }, []);

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const definition = byId.get(id);
      const current = stateRef.current;
      if (!definition || current.enabled.includes(id) === enabled) {
        return;
      }
      const ids = new Set([id]);
      forgetLayers(ids);
      setState((previous) => ({
        ...withoutTraces(previous, ids),
        enabled: enabled
          ? [...previous.enabled, id]
          : previous.enabled.filter((item) => item !== id),
      }));
      if (enabled && !loadsFeatures(definition)) {
        announce(announceLayerOn(definition.name), { priority: "polite" });
      }
    },
    [announce, byId, forgetLayers],
  );

  const turnOff = useCallback(
    (ids: readonly string[], offOptions: { readonly group?: string } = {}) => {
      const current = stateRef.current;
      const leaving = new Set(
        ids.filter((id) => byId.has(id) && current.enabled.includes(id)),
      );
      if (leaving.size === 0) {
        return;
      }
      forgetLayers(leaving);
      setState((previous) => ({
        ...withoutTraces(previous, leaving),
        enabled: previous.enabled.filter((id) => !leaving.has(id)),
        undo: { ids: [...leaving], group: offOptions.group ?? null },
      }));
      announce(announceLayersTurnedOff(leaving.size), { priority: "polite" });
    },
    [announce, byId, forgetLayers],
  );

  const undoTurnOff = useCallback(() => {
    const { undo, enabled } = stateRef.current;
    if (!undo) {
      return;
    }
    const returning = stillOff(undo, enabled, byId);
    forgetLayers(new Set(returning));
    setState((previous) => ({
      ...previous,
      // Read from `previous`, so two calls before a render add nothing twice.
      enabled: [...previous.enabled, ...stillOff(undo, previous.enabled, byId)],
      undo: null,
    }));
    if (returning.length > 0) {
      announce(announceLayersTurnedBackOn(returning.length), {
        priority: "polite",
      });
    }
  }, [announce, byId, forgetLayers]);

  const holdUndo = useCallback(
    (by: UndoHolder) => setUndoHolds((holds) => ({ ...holds, [by]: true })),
    [],
  );
  const releaseUndo = useCallback(
    (by: UndoHolder) => setUndoHolds((holds) => ({ ...holds, [by]: false })),
    [],
  );

  const setControl = useCallback(
    (id: string, controlId: string, value: string) => {
      const definition = byId.get(id);
      if (!definition) {
        return;
      }
      setState((previous) => {
        const controls = resolveControlValues(
          definition,
          { ...previous.controls[id], [controlId]: value },
          now(),
        );
        return {
          ...previous,
          controls: { ...previous.controls, [id]: controls },
          tilesUnavailable: tilesUnavailableFor(
            previous.tilesUnavailable,
            id,
            tilesOf(definition, controls, now()),
          ),
        };
      });
    },
    [byId, now],
  );

  const reportTilesUnavailable = useCallback(
    (id: string, tiles: string) => {
      const definition = byId.get(id);
      const current = stateRef.current;
      if (
        !definition ||
        !current.enabled.includes(id) ||
        current.tilesUnavailable[id] === tiles
      ) {
        return;
      }
      const controls = current.controls[id] ?? {};
      if (tilesOf(definition, controls, now()) !== tiles) {
        return;
      }
      setState((previous) => ({
        ...previous,
        tilesUnavailable: { ...previous.tilesUnavailable, [id]: tiles },
      }));
      announce(
        announceTilesUnavailable(
          definition.name,
          describeChosenTime(definition, controls),
        ),
        { priority: "polite" },
      );
    },
    [announce, byId, now],
  );

  const reportTilesRecovered = useCallback(
    (id: string, tiles: string) => {
      const definition = byId.get(id);
      if (!definition || stateRef.current.tilesUnavailable[id] !== tiles) {
        return;
      }
      setState((previous) => ({
        ...previous,
        tilesUnavailable: tilesUnavailableFor(
          previous.tilesUnavailable,
          id,
          null,
        ),
      }));
      announce(announceTilesRecovered(definition.name), {
        priority: "polite",
      });
    },
    [announce, byId],
  );

  const setSort = useCallback((id: string, sortId: string) => {
    setState((previous) => ({
      ...previous,
      sorts: { ...previous.sorts, [id]: sortId },
    }));
  }, []);

  const retry = useCallback((id: string) => {
    setState((previous) => ({
      ...previous,
      retries: { ...previous.retries, [id]: (previous.retries[id] ?? 0) + 1 },
    }));
  }, []);

  const select = useCallback(
    (
      layerId: string,
      featureId: string | null,
      selectOptions: {
        readonly focus?: boolean;
        readonly keepChoices?: boolean;
      } = {},
    ) => {
      setState((previous) => {
        const snapshot =
          featureId === null
            ? undefined
            : previous.results[layerId]?.features.find(
                (item) => item.id === featureId,
              );
        return {
          ...previous,
          selection:
            featureId === null
              ? null
              : { layerId, featureId, ...(snapshot ? { snapshot } : {}) },
          choices:
            featureId !== null && selectOptions.keepChoices
              ? previous.choices
              : null,
          focusRequest: previous.focusRequest + (selectOptions.focus ? 1 : 0),
        };
      });
    },
    [],
  );

  const choose = useCallback(
    (
      hits: readonly { readonly layerId: string; readonly featureId: string }[],
      chooseOptions: { readonly focus?: boolean } = {},
    ) => {
      const { results } = stateRef.current;
      const seen = new Set<string>();
      const found = hits.filter((hit) => {
        const key = `${hit.layerId}\u0000${hit.featureId}`;
        if (
          seen.has(key) ||
          !results[hit.layerId]?.features.some(
            (item) => item.id === hit.featureId,
          )
        ) {
          return false;
        }
        seen.add(key);
        return true;
      });
      const [only] = found;
      if (!only) {
        return;
      }
      if (found.length === 1) {
        select(only.layerId, only.featureId, chooseOptions);
        return;
      }
      setState((previous) => ({
        ...previous,
        selection: null,
        choices: found,
        focusRequest: previous.focusRequest + (chooseOptions.focus ? 1 : 0),
      }));
      announce(announceFeaturesFound(found.length), { priority: "polite" });
    },
    [announce, select],
  );

  const backToChoices = useCallback(
    (backOptions: { readonly focus?: boolean } = {}) => {
      setState((previous) =>
        previous.choices
          ? {
              ...previous,
              selection: null,
              detail: null,
              focusRequest: previous.focusRequest + (backOptions.focus ? 1 : 0),
            }
          : previous,
      );
    },
    [],
  );

  const setView = useCallback((area: Bounds, zoom: number) => {
    setState((previous) => {
      const last = previous.view;
      return last &&
        last.zoom === zoom &&
        last.area.west === area.west &&
        last.area.south === area.south &&
        last.area.east === area.east &&
        last.area.north === area.north
        ? previous
        : { ...previous, view: { area, zoom } };
    });
  }, []);

  const consumeFocus = useCallback(() => {
    setState((previous) =>
      previous.focusHandled === previous.focusRequest
        ? previous
        : { ...previous, focusHandled: previous.focusRequest },
    );
  }, []);

  const hideDetail = useCallback(() => {
    detailRequest.current?.abort();
    detailRequest.current = null;
    setState((previous) => ({ ...previous, detail: null }));
  }, []);

  const showDetail = useCallback(
    (layerId: string, featureId: string) => {
      const definition = byId.get(layerId);
      const feature = stateRef.current.results[layerId]?.features.find(
        (item) => item.id === featureId,
      );
      if (!definition || !feature) {
        return;
      }
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      const finish = (detail: Partial<DetailState>) => {
        if (detailRequest.current !== controller) {
          return;
        }
        setState((previous) =>
          previous.detail
            ? { ...previous, detail: { ...previous.detail, ...detail } }
            : previous,
        );
      };
      setState((previous) => ({
        ...previous,
        detail: { layerId, featureId, status: "loading", shapes: [] },
      }));
      layerSource
        .loadDetail({ definition, feature, signal: controller.signal })
        .then(
          (shapes) => {
            finish({ status: "shown", shapes });
            announce(announceDetailShown(String(feature.fields.title ?? "")), {
              priority: "polite",
            });
          },
          (error: unknown) => {
            if (errorKind(error) === "aborted" || controller.signal.aborted) {
              return;
            }
            finish({ status: "error", shapes: [] });
            announce(announceDetailError(), { priority: "assertive" });
          },
        );
    },
    [announce, byId, layerSource],
  );

  const layers = useMemo(
    () =>
      definitions.map((definition): DataLayerState => {
        const id = definition.id;
        const enabled = state.enabled.includes(id);
        let result = OFF;
        if (enabled && isTooFarOut(definition, state.view)) {
          result = { status: { kind: "zoom-in" }, features: [] };
        } else if (enabled) {
          result =
            state.results[id] ??
            (loadsFeatures(definition)
              ? { status: { kind: "loading" }, features: [] }
              : {
                  status: {
                    kind:
                      state.tilesUnavailable[id] === undefined
                        ? "on"
                        : "tiles-unavailable",
                  },
                  features: [],
                });
        }
        const sortId =
          state.sorts[id] ??
          (isFeedLayer(definition) ? (definition.list.sorts[0]?.id ?? "") : "");
        return {
          definition,
          enabled,
          controls: state.controls[id] ?? {},
          status: result.status,
          features: result.features,
          sortId,
          sorted: sortFeatures(definition, result.features, sortId),
        };
      }),
    [definitions, state],
  );

  const selected = useMemo(() => {
    const selection = state.selection;
    const layer = layers.find(
      (item) => item.definition.id === selection?.layerId,
    );
    // A query layer's card stays open when a refresh for another part of the
    // map no longer lists its feature. Other layers close it, as they reload.
    const feature =
      layer?.features.find((item) => item.id === selection?.featureId) ??
      (layer?.enabled && isQueryLayer(layer.definition)
        ? selection?.snapshot
        : undefined);
    return layer && feature ? { layer, feature } : null;
  }, [layers, state.selection]);

  const choices = useMemo<readonly SelectedFeature[] | null>(() => {
    if (!state.choices) {
      return null;
    }
    const found = state.choices.flatMap((choice) => {
      const layer = layers.find(
        (item) => item.definition.id === choice.layerId,
      );
      const feature = layer?.features.find(
        (item) => item.id === choice.featureId,
      );
      return layer && feature ? [{ layer, feature }] : [];
    });
    return found.length > 0 ? found : null;
  }, [layers, state.choices]);

  const turnedOff = useMemo<TurnedOff | null>(() => {
    const count = offer ? stillOff(offer, state.enabled, byId).length : 0;
    return offer && count > 0 ? { count, group: offer.group } : null;
  }, [offer, state.enabled, byId]);

  const urlValue = useMemo<LayersUrlState>(
    () => ({
      enabled: state.enabled,
      controls: Object.fromEntries(
        state.enabled.map((id) => [id, state.controls[id] ?? {}]),
      ),
    }),
    [state.enabled, state.controls],
  );

  // Several layers can share a provider; its credit is listed once. A
  // provider's notice that asks for the year gets the current one.
  const year = String(new Date(now()).getUTCFullYear());
  const credits = useMemo(() => {
    const byText = new Map<string, LayerAttribution>();
    for (const id of state.enabled) {
      for (const credit of byId.get(id)?.attribution ?? []) {
        const text = credit.text.replaceAll("{year}", year);
        if (!byText.has(text)) {
          byText.set(text, { ...credit, text });
        }
      }
    }
    return [...byText.values()];
  }, [state.enabled, byId, year]);

  return {
    layers,
    selected,
    choices,
    detail: state.detail,
    focusRequest: state.focusRequest,
    focusPending: state.focusRequest > state.focusHandled,
    consumeFocus,
    urlValue,
    credits,
    now,
    setEnabled,
    turnOff,
    turnedOff,
    undoTurnOff,
    holdUndo,
    releaseUndo,
    setControl,
    setSort,
    retry,
    reportTilesUnavailable,
    reportTilesRecovered,
    select,
    choose,
    backToChoices,
    setView,
    showDetail,
    hideDetail,
  };
}
