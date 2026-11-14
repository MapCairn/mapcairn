// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceDetailError,
  announceDetailShown,
  announceFeaturesFound,
  announceIdentified,
  announceLayerOn,
  announceLayersTurnedBackOn,
  announceLayersTurnedOff,
  announceTilesRecovered,
  announceTilesSlow,
  announceTilesUnavailable,
  type Bounds,
  type CatalogueState,
  type ControlValues,
  describeChosenTime,
  type FieldValue,
  type IdentifyTarget,
  isFeedLayer,
  isQueryLayer,
  isRasterTileLayer,
  type LayerAttribution,
  type LayerDefinition,
  type LayerFeature,
  type LayersUrlState,
  loadsFeatures,
  parseTime,
  readyLayers,
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
  useSyncExternalStore,
} from "react";
import { useServices } from "../services";
import { useAnnounce } from "../ui/LiveRegion";
import { type CatalogueMessage, catalogueNotice } from "./catalogueNotice";
import { type Link, type Reconciled, reconcile } from "./catalogueReconcile";
import { type CatalogueView, catalogueView, loadFailed } from "./catalogueView";
import {
  askableLayers,
  type IdentifiedEntry,
  IdentifyRun,
  identifiableLayers,
  MAX_IDENTIFY_LAYERS,
  outcomeOf,
  stillCurrent,
} from "./identifyRun";
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

export { IDENTIFY_TIMEOUT_MS, MAX_IDENTIFY_LAYERS } from "./identifyRun";
export type { CatalogueView, LayerStatus };

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

/** What a tap that asked raster layers came to. */
export interface IdentifyResult {
  /** How many layers were asked. Zero when none could be, and then nothing was requested. */
  readonly asked: number;
  /** How many features the layers that answered found, in all. */
  readonly found: number;
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
  /** Every registered layer, in catalogue order. Empty while the catalogue is loading or has failed. */
  readonly layers: readonly DataLayerState[];
  /** What the catalogue is doing besides holding layers: loading, failed, how many definitions it skipped, and how a refresh went. */
  readonly catalogue: CatalogueView;
  /**
   * Asks the catalogue to load again after a failed load or a failed refresh,
   * which the section's Try again does. It does nothing in any other state:
   * only the host refreshes a catalogue that is working.
   */
  retryCatalogue(): void;
  readonly selected: SelectedFeature | null;
  /**
   * The features a tap or the keyboard found together, when there were
   * several, so one can be chosen. Null when no list is open. The open card
   * offers a way back to it while it is.
   */
  readonly choices: readonly SelectedFeature[] | null;
  readonly detail: DetailState | null;
  /** Grows each time opening a card asks for it to take focus (a tap on the map). */
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
  /**
   * The layers part of the permalink: the layers that are on, and the
   * link's layers still waiting for a catalogue that is loading or has
   * failed, so writing the address does not erase them.
   */
  readonly urlValue: LayersUrlState;
  /** The credits of the layers that are on, for the map credits. */
  readonly credits: readonly LayerAttribution[];
  /** The clock the hook uses, for relative times in cards and lists. */
  readonly now: () => number;
  setEnabled(id: string, enabled: boolean): void;
  /**
   * Turns several layers off as one change: one state update, so one redraw
   * and one address update, and one announcement ("3 layers turned off. Undo available"). Ids
   * that are not on, or not known, are ignored, and nothing happens when none
   * is on. Each layer's open card, list of choices and affected area
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
   * Records that a tile layer has had tiles asked for and none has loaded for
   * a long while, which `MapDataLayers` calls from the adapter's report. `tiles`
   * is the template those tiles came from: a report for anything but the
   * layer's current tiles, or for a layer that is off, is ignored, as is one
   * for tiles the layer already reported as slow or unavailable. The layer then
   * says it is still waiting, and announces it once in a message that is kept,
   * because the person turned the layer on and would otherwise see nothing,
   * until its tiles change, it is turned off, or a tile loads later (see
   * {@link DataLayers.reportTilesRecovered}).
   */
  reportTilesSlow(id: string, tiles: string): void;
  /**
   * Records that the map settled with none of a tile layer's tiles loaded,
   * which `MapDataLayers` calls from the adapter's report. `tiles` is the
   * template those tiles came from: a report for anything but the layer's
   * current tiles, or for a layer that is off, is ignored. The layer then
   * says so and announces it once, until its tiles change, it is turned off, or
   * a tile loads later (see {@link DataLayers.reportTilesRecovered}). It
   * replaces the status of a layer reported slow for the same tiles.
   */
  reportTilesUnavailable(id: string, tiles: string): void;
  /**
   * Records that a tile loaded for the `tiles` a layer had reported slow or
   * with no tiles, which `MapDataLayers` calls from the adapter's report. The
   * layer's status goes and the layer says so once, politely. A recovery for
   * any other tiles, or for a layer that is not showing the status, is ignored.
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
  /**
   * Asks the raster layers that answer a tap what is at a place, and opens
   * what they find: one feature opens its card, several open the list to
   * choose from, and none leaves an open card alone.
   *
   * It asks each layer that is on, has an `identify` block, shows imagery and
   * whose `bounds` hold the place, at most {@link MAX_IDENTIFY_LAYERS} in
   * catalogue order. The requests start together, each with
   * {@link IDENTIFY_TIMEOUT_MS} to answer. It waits for all of them, changes
   * the state once and says one message: how many were found, which layers
   * did not answer, and how many it asked when the cap held some back. A
   * layer that did not answer leaves what it showed before as it was.
   *
   * Resolves with how many layers were asked and how many features they
   * found, or with null when this tap was replaced or cancelled before it
   * settled, which opens and says nothing. When no layer can be asked it
   * resolves at once with `asked` of zero, changes nothing and says nothing,
   * so the caller can fall back to its own message. Starting a tap cancels the
   * one in flight.
   */
  identifyAt(
    target: IdentifyTarget,
    options?: { readonly focus?: boolean },
  ): Promise<IdentifyResult | null>;
  /**
   * Cancels the tap in flight, if there is one: its requests are aborted and it
   * opens and says nothing. Returns whether there was one. The host calls it
   * when the person leaves the plain map (another surface opens, taps stop
   * meaning "look here", a long press), and Escape calls it before it closes
   * anything. A layer turned off, whose tiles change, or an unmount cancels
   * what concerns it without a call, and so does opening a card or a list
   * with {@link DataLayers.select} or {@link DataLayers.choose}.
   */
  cancelIdentify(): boolean;
  /**
   * True from the start of {@link DataLayers.identifyAt} until it settles or is
   * cancelled. It is the status data for a "looking up" line, which waits a
   * moment before it shows so a quick answer never flickers.
   */
  readonly identifying: boolean;
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
  /**
   * Layers and control values from a permalink. Control values are resolved
   * against each layer's definition, so an invalid one becomes the default.
   * A layer the catalogue has not got is dropped. A catalogue that is still
   * loading has no layers yet, so the link's layers wait for its first list
   * and stay in {@link DataLayers.urlValue} meanwhile; one that is not there
   * when the list arrives is dropped then, and said once, for good. The ids
   * the link carried past its limit (`initial.dropped`) are said in the same
   * message.
   */
  readonly initial?: LayersUrlState;
  /** The clock. Defaults to `Date.now`. */
  readonly now?: () => number;
}

interface State {
  readonly enabled: readonly string[];
  /** Every listed layer's control values. */
  readonly controls: Readonly<Record<string, ControlValues>>;
  /** The link's layers that no list has answered for yet. */
  readonly link: Link;
  /** The list the choices were last reconciled with. */
  readonly known: readonly LayerDefinition[];
  /** The catalogue state last reconciled, so each change is applied once. */
  readonly reconciled: CatalogueState | null;
  /** What the last change to the catalogue asks the hook to say and forget once it is committed. */
  readonly notice: CatalogueNotice | null;
  readonly sorts: Readonly<Record<string, string>>;
  readonly results: Readonly<Record<string, LoadResult>>;
  readonly retries: Readonly<Record<string, number>>;
  /** The tiles each tile layer found no imagery for, by layer id (see `reportTilesUnavailable`). */
  readonly tilesUnavailable: Readonly<Record<string, string>>;
  /** The tiles each tile layer is still waiting for its first of, by layer id (see `reportTilesSlow`). */
  readonly tilesSlow: Readonly<Record<string, string>>;
  /**
   * What each tile layer found at the last tap that answered for it. It sits
   * apart from `results`, which feeds the list and the drawing, because these
   * features are neither listed nor drawn and their ids are not stable.
   */
  readonly identified: Readonly<Record<string, IdentifiedEntry>>;
  /** A tap is waiting for the layers it asked. */
  readonly identifying: boolean;
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

/** A change to the catalogue that is to be said aloud, and the layers that went with it. */
interface CatalogueNotice extends CatalogueMessage {
  /** The ids of the enabled layers that went. */
  readonly gone: readonly string[];
}

/**
 * The offer without the layers a refresh removed from the catalogue, so a
 * layer that is listed again later is not one Undo would turn on. Null when
 * nothing is left.
 */
function withoutRemoved(
  offer: UndoOffer | null,
  removed: readonly string[],
): UndoOffer | null {
  if (!offer || removed.length === 0) {
    return offer;
  }
  const ids = offer.ids.filter((id) => !removed.includes(id));
  return ids.length > 0 ? { ...offer, ids } : null;
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

/**
 * The state at mount: the link's layers wait, and are resolved at once when
 * the catalogue is ready already (a static one), as they are when a list
 * arrives later. `awaited` says the catalogue was not ready at mount, so its
 * list arrives later: only then is a link layer the list lacks said aloud, and
 * an empty list, because a host whose layers are there from the start has no
 * list to wait for.
 */
function initialState(
  initial: LayersUrlState | undefined,
  catalogue: CatalogueState,
  awaited: boolean,
  now: number,
): State {
  return applyCatalogue(
    {
      enabled: [],
      controls: {},
      link: {
        waiting: initial?.enabled ?? [],
        controls: initial?.controls ?? {},
        dropped: initial?.dropped,
      },
      known: [],
      reconciled: null,
      notice: null,
      sorts: {},
      results: {},
      retries: {},
      tilesUnavailable: {},
      tilesSlow: {},
      identified: {},
      identifying: false,
      selection: null,
      choices: null,
      view: null,
      focusRequest: 0,
      focusHandled: 0,
      detail: null,
      undo: null,
    },
    catalogue,
    awaited,
    now,
  );
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

/** The state with the open card, the entries in a list of choices and the affected area of these layers closed. */
function withoutOpenIn(state: State, ids: ReadonlySet<string>): State {
  const choices = state.choices?.filter((choice) => !ids.has(choice.layerId));
  return {
    ...state,
    selection:
      state.selection && ids.has(state.selection.layerId)
        ? null
        : state.selection,
    choices: choices && choices.length > 0 ? choices : null,
    detail: state.detail && ids.has(state.detail.layerId) ? null : state.detail,
  };
}

/**
 * The state with what belongs to these layers cleared, for layers that are
 * turning on or off: what they loaded, what a tap found, tiles known to have
 * failed, their open card, their entries in a list of choices and their
 * affected area.
 */
function withoutTraces(state: State, ids: ReadonlySet<string>): State {
  return {
    ...withoutOpenIn(state, ids),
    results: without(state.results, ids),
    identified: without(state.identified, ids),
    tilesUnavailable: without(state.tilesUnavailable, ids),
    tilesSlow: without(state.tilesSlow, ids),
  };
}

/** A feature to open, by its layer and its id. */
type FeatureHit = {
  readonly layerId: string;
  readonly featureId: string;
};

/**
 * The state with these features open: one opens its card, several open the
 * list to choose from. `focus` asks for the card or list to take focus.
 */
function withOpened(
  state: State,
  hits: readonly FeatureHit[],
  focus: boolean,
): State {
  const [only] = hits;
  return {
    ...state,
    selection: hits.length === 1 && only ? { ...only } : null,
    choices: hits.length > 1 ? hits : null,
    focusRequest: state.focusRequest + (focus ? 1 : 0),
  };
}

/**
 * The state once a tap settled: the layers that answered keep what they
 * found, replacing what an earlier tap found, and what was found opens. When
 * nothing was found the card that is open stays, unless it points into a
 * layer that answered, whose features it was a feature of before.
 */
function withIdentified(
  state: State,
  entries: Readonly<Record<string, IdentifiedEntry>>,
  hits: readonly FeatureHit[],
  focus: boolean,
): State {
  const settled = {
    ...state,
    identified: { ...state.identified, ...entries },
    identifying: false,
  };
  return hits.length === 0
    ? withoutOpenIn(settled, new Set(Object.keys(entries)))
    : withOpened(settled, hits, focus);
}

/**
 * The state without what a tap found for a layer, once the tiles it asked
 * about are not the ones it shows now: the answer describes other imagery.
 * `tiles` is the URL the layer shows now, or null for a layer without tiles.
 */
function withoutStaleIdentified(
  state: State,
  id: string,
  tiles: string | null,
): State {
  const entry = state.identified[id];
  return entry === undefined || entry.tiles === tiles
    ? state
    : {
        ...withoutOpenIn(state, new Set([id])),
        identified: without(state.identified, new Set([id])),
      };
}

/** The features a layer has: those a tap found for it, else the `loaded` ones (a feed's or a query's). */
function featuresFor(
  identified: State["identified"],
  layerId: string,
  loaded: readonly LayerFeature[] | undefined,
): readonly LayerFeature[] | undefined {
  return identified[layerId]?.features ?? loaded;
}

/**
 * Takes a ready list in, when it is a new one or a link layer is waiting for
 * it: the choices `reconcile` works out, the layers that went cleared as
 * turning them off clears them, and the list remembered as the one the
 * choices match. Anything else (the list already taken in, a loading or
 * failed catalogue) changes no choice, and has no result.
 */
function takeIn(
  state: State,
  catalogue: CatalogueState,
  now: number,
): { readonly taken: State; readonly result: Reconciled | null } {
  if (
    catalogue.status !== "ready" ||
    (catalogue.layers === state.known && state.link.waiting.length === 0)
  ) {
    return { taken: state, result: null };
  }
  const result = reconcile({
    chosen: { enabled: state.enabled, controls: state.controls },
    link: state.link,
    known: state.known,
    next: catalogue.layers,
    now,
  });
  const gone = result.switchedOff.map(({ id }) => id);
  return {
    taken: {
      ...(gone.length > 0 ? withoutTraces(state, new Set(gone)) : state),
      ...result.chosen,
      link: result.link,
      known: catalogue.layers,
      undo: withoutRemoved(state.undo, result.removed),
    },
    result,
  };
}

/**
 * The state once it has taken in a catalogue state. Only a ready list changes
 * the choices (see `takeIn`): while the catalogue loads or has failed the
 * link's layers keep waiting. A list that is the one already taken in changes
 * no choice, though its skipped count or refresh state may. Whatever the state
 * says aloud is kept as a notice for the effect that says it (see
 * `catalogueNotice`), so every transition is said once.
 */
function applyCatalogue(
  state: State,
  catalogue: CatalogueState,
  awaited: boolean,
  now: number,
): State {
  const { taken, result } = takeIn(state, catalogue, now);
  const message = catalogueNotice({
    previous: state.reconciled,
    next: catalogue,
    linkWaiting: state.link.waiting.length,
    awaited,
    change: result,
  });
  return {
    ...taken,
    reconciled: catalogue,
    notice: message
      ? { ...message, gone: result?.switchedOff.map(({ id }) => id) ?? [] }
      : taken.notice,
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

/** The status of a tile layer that is on: unavailable outranks slow, which outranks nothing reported. */
function tileStatusKind(
  state: State,
  id: string,
): "on" | "tiles-slow" | "tiles-unavailable" {
  if (state.tilesUnavailable[id] !== undefined) {
    return "tiles-unavailable";
  }
  return state.tilesSlow[id] === undefined ? "on" : "tiles-slow";
}

/**
 * What is known of reported tiles (slow or unavailable) once the layer asks for
 * `tiles`: nothing, if they are not the ones that were reported.
 */
function reportedTilesFor(
  reported: State["tilesUnavailable"],
  id: string,
  tiles: string | null,
): State["tilesUnavailable"] {
  if (reported[id] === undefined || reported[id] === tiles) {
    return reported;
  }
  const rest = { ...reported };
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
 * the definitions in the catalogue: nothing here names a layer. It reads the
 * catalogue as a store, so the layers appear when a catalogue that loads
 * becomes ready; while it is loading or has failed there are none, and the
 * layers a link names wait for the first list. Each list that arrives is
 * reconciled with the choices in the same render, before anything is drawn
 * or requested: a layer that arrives has its controls' defaults, one that
 * changed keeps the values that are still valid, and an enabled one that went
 * is turned off as `setEnabled(id, false)` turns it off and said once.
 *
 * @remarks Nothing is requested until a layer is turned on. A feed layer is
 *   loaded on enable, on a control change and on retry; the request for the
 *   previous URL is cancelled. Tile layers need no request here: the map
 *   draws their tiles, and says through `reportTilesSlow` when none has
 *   loaded for a long while, `reportTilesUnavailable` when the map settled
 *   with none loaded and `reportTilesRecovered` when one loads later. Loads,
 *   empty feeds and failures are announced once each through the shared live
 *   region, failures assertively and a tile layer that is slow or has no
 *   tiles, and its recovery, politely. Turning a layer off clears its features, its open card
 *   and its affected area.
 */
export function useDataLayers(options: UseDataLayersOptions = {}): DataLayers {
  const { layers: catalogue, layerSource } = useServices();
  const announce = useAnnounce();
  const now = useCallback(() => (options.now ?? Date.now)(), [options.now]);
  const catalogueState = useSyncExternalStore(
    catalogue.subscribe,
    catalogue.getState,
    catalogue.getState,
  );
  const definitions = readyLayers(catalogueState);
  // Fixed at mount: only a catalogue that was not ready then makes a note of a
  // link layer it does not have, or says its first list is empty.
  const [awaited] = useState(catalogueState.status !== "ready");
  const [stored, setState] = useState(() =>
    initialState(options.initial, catalogueState, awaited, now()),
  );
  // A new catalogue state is taken in during this render, so no render sees
  // its layers before their controls and choices are in step with them.
  let state = stored;
  if (stored.reconciled !== catalogueState) {
    state = applyCatalogue(stored, catalogueState, awaited, now());
    setState(state);
  }
  const statusView = useMemo(
    () => catalogueView(catalogueState, awaited),
    [catalogueState, awaited],
  );
  const retryCatalogue = useCallback(() => {
    if (loadFailed(catalogue.getState())) {
      void catalogue.refresh();
    }
  }, [catalogue]);
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
  /** The tap in flight, if there is one. */
  const identifyRun = useRef<IdentifyRun | null>(null);

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

  // A tap's request for a layer that has been turned off, left the catalogue or
  // changed its tiles in the meantime is aborted: what it would find describes
  // imagery that is no longer shown.
  const identifiable = identifiableLayers({
    definitions,
    enabled: state.enabled,
    controls: state.controls,
    now: now(),
  });
  const identifiableSignature = identifiable
    .map(({ definition, tiles }) => `${definition.id} ${tiles}`)
    .join("\n");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature is the trigger; everything else is read through refs or is stable.
  useEffect(() => {
    identifyRun.current?.abortStale(
      new Map(
        identifiable.map(({ definition, tiles }) => [definition.id, tiles]),
      ),
    );
  }, [identifiableSignature]);

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
        // A load that was cancelled or replaced meanwhile is neither shown nor said.
        if (!outcome || requests.current.get(id)?.controller !== controller) {
          return;
        }
        requests.current.delete(id);
        loadedKeys.current.set(id, key);
        setState((current) => ({
          ...current,
          results: { ...current.results, [id]: outcome.result },
        }));
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
      identifyRun.current?.cancel();
      identifyRun.current = null;
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

  // Says a change to the catalogue, once, and lets go of what the layers that
  // went had in flight. The change is in the state, not in the render that
  // found it, so a render that React repeats or throws away says nothing.
  const spokenNotice = useRef<CatalogueNotice | null>(null);
  const notice = state.notice;
  useEffect(() => {
    if (!notice || spokenNotice.current === notice) {
      return;
    }
    spokenNotice.current = notice;
    // The change already closed the affected area of a layer that went, so no
    // request for an area should stay open.
    if (stateRef.current.detail === null) {
      detailRequest.current?.abort();
    }
    forgetLayers(new Set(notice.gone));
    announce(notice.message, {
      priority: notice.priority,
      keep: notice.keep,
    });
  }, [notice, forgetLayers, announce]);

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
        announce(announceLayerOn(definition.name), {
          priority: "polite",
          keep: true,
        });
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
      announce(announceLayersTurnedOff(leaving.size), {
        priority: "polite",
        keep: true,
      });
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
        keep: true,
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
        const tiles = tilesOf(definition, controls, now());
        return withoutStaleIdentified(
          {
            ...previous,
            controls: { ...previous.controls, [id]: controls },
            tilesUnavailable: reportedTilesFor(
              previous.tilesUnavailable,
              id,
              tiles,
            ),
            tilesSlow: reportedTilesFor(previous.tilesSlow, id, tiles),
          },
          id,
          tiles,
        );
      });
    },
    [byId, now],
  );

  const reportTilesSlow = useCallback(
    (id: string, tiles: string) => {
      const definition = byId.get(id);
      const current = stateRef.current;
      if (
        !definition ||
        !current.enabled.includes(id) ||
        current.tilesSlow[id] === tiles ||
        current.tilesUnavailable[id] === tiles
      ) {
        return;
      }
      if (tilesOf(definition, current.controls[id] ?? {}, now()) !== tiles) {
        return;
      }
      setState((previous) => ({
        ...previous,
        tilesSlow: { ...previous.tilesSlow, [id]: tiles },
      }));
      announce(announceTilesSlow(definition.name), {
        priority: "polite",
        keep: true,
      });
    },
    [announce, byId, now],
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
        tilesSlow: reportedTilesFor(previous.tilesSlow, id, null),
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
      const current = stateRef.current;
      if (
        !definition ||
        (current.tilesUnavailable[id] !== tiles &&
          current.tilesSlow[id] !== tiles)
      ) {
        return;
      }
      setState((previous) => ({
        ...previous,
        tilesUnavailable: reportedTilesFor(previous.tilesUnavailable, id, null),
        tilesSlow: reportedTilesFor(previous.tilesSlow, id, null),
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

  /** Cancels the tap in flight, and reports whether there was one. */
  const cancelIdentify = useCallback((): boolean => {
    const run = identifyRun.current;
    if (!run) {
      return false;
    }
    identifyRun.current = null;
    run.cancel();
    setState((previous) =>
      previous.identifying ? { ...previous, identifying: false } : previous,
    );
    return true;
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
      // A card opened another way wins over a lookup still waiting: its late
      // answer must not replace the card or take focus from it.
      if (featureId !== null) {
        cancelIdentify();
      }
      setState((previous) => {
        const snapshot =
          featureId === null
            ? undefined
            : featuresFor(
                previous.identified,
                layerId,
                previous.results[layerId]?.features,
              )?.find((item) => item.id === featureId);
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
    [cancelIdentify],
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
      cancelIdentify();
      setState((previous) =>
        withOpened(previous, found, chooseOptions.focus === true),
      );
      announce(announceFeaturesFound(found.length), {
        priority: "polite",
        keep: true,
      });
    },
    [announce, cancelIdentify, select],
  );

  const identifyAt = useCallback(
    async (
      target: IdentifyTarget,
      identifyOptions: { readonly focus?: boolean } = {},
    ): Promise<IdentifyResult | null> => {
      cancelIdentify();
      const current = stateRef.current;
      const available = askableLayers(
        identifiableLayers({
          definitions,
          enabled: current.enabled,
          controls: current.controls,
          now: now(),
        }),
        current.tilesUnavailable,
        target.latlng,
      );
      const asking = available.slice(0, MAX_IDENTIFY_LAYERS);
      if (asking.length === 0) {
        return { asked: 0, found: 0 };
      }
      const run = new IdentifyRun();
      identifyRun.current = run;
      setState((previous) => ({ ...previous, identifying: true }));
      const answers = await Promise.all(
        asking.map((layer) => run.ask(layerSource, layer, target, now())),
      );
      if (identifyRun.current !== run) {
        return null;
      }
      identifyRun.current = null;
      // A layer turned off or re-timed while another was still held may have
      // answered before the change, and its answer no longer describes the map.
      const latest = stateRef.current;
      const shown = new Map(
        identifiableLayers({
          definitions,
          enabled: latest.enabled,
          controls: latest.controls,
          now: now(),
        }).map(({ definition, tiles }) => [definition.id, tiles]),
      );
      const outcome = outcomeOf(stillCurrent(answers, shown), available.length);
      if (!outcome) {
        setState((previous) => ({ ...previous, identifying: false }));
        return null;
      }
      setState((previous) =>
        withIdentified(
          previous,
          outcome.entries,
          outcome.hits,
          identifyOptions.focus === true,
        ),
      );
      const said = announceIdentified(outcome.report);
      if (said) {
        announce(said.message, { priority: said.priority, keep: true });
      }
      return { asked: outcome.report.asked, found: outcome.report.found };
    },
    [announce, cancelIdentify, definitions, layerSource, now],
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
                  status: { kind: tileStatusKind(state, id) },
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
      featuresFor(
        state.identified,
        layer?.definition.id ?? "",
        layer?.features,
      )?.find((item) => item.id === selection?.featureId) ??
      (layer?.enabled && isQueryLayer(layer.definition)
        ? selection?.snapshot
        : undefined);
    return layer && feature ? { layer, feature } : null;
  }, [layers, state.identified, state.selection]);

  const choices = useMemo<readonly SelectedFeature[] | null>(() => {
    if (!state.choices) {
      return null;
    }
    const found = state.choices.flatMap((choice) => {
      const layer = layers.find(
        (item) => item.definition.id === choice.layerId,
      );
      const feature = featuresFor(
        state.identified,
        choice.layerId,
        layer?.features,
      )?.find((item) => item.id === choice.featureId);
      return layer && feature ? [{ layer, feature }] : [];
    });
    return found.length > 0 ? found : null;
  }, [layers, state.identified, state.choices]);

  const turnedOff = useMemo<TurnedOff | null>(() => {
    const count = offer ? stillOff(offer, state.enabled, byId).length : 0;
    return offer && count > 0 ? { count, group: offer.group } : null;
  }, [offer, state.enabled, byId]);

  const urlValue = useMemo<LayersUrlState>(() => {
    const { waiting, controls: linked } = state.link;
    return {
      enabled: [...state.enabled, ...waiting],
      controls: Object.fromEntries([
        ...state.enabled.map((id) => [id, state.controls[id] ?? {}]),
        ...waiting.map((id) => [id, linked[id] ?? {}]),
      ]),
    };
  }, [state.enabled, state.controls, state.link]);

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
    catalogue: statusView,
    retryCatalogue,
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
    reportTilesSlow,
    reportTilesUnavailable,
    reportTilesRecovered,
    select,
    choose,
    identifyAt,
    cancelIdentify,
    identifying: state.identifying,
    backToChoices,
    setView,
    showDetail,
    hideDetail,
  };
}
