import {
  announceDetailError,
  announceDetailShown,
  announceFeaturesFound,
  announceLayerCapped,
  announceLayerEmpty,
  announceLayerError,
  announceLayerLoaded,
  announceLayerOn,
  announceLayerZoomIn,
  type Bounds,
  type ControlValues,
  type FieldValue,
  feedUrl,
  isFeedLayer,
  isQueryLayer,
  type LayerAttribution,
  type LayerDefinition,
  LayerError,
  type LayerFeature,
  type LayersUrlState,
  loadsFeatures,
  nextQueryWindow,
  parseTime,
  resolveControlValues,
} from "@karta/core";
import { useLatestRef } from "@karta/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "../services";
import { useAnnounce } from "../ui/LiveRegion";

/**
 * Where a layer is: off, on (tiles), loading, loaded, empty, failed, or (a
 * query layer) too far out to ask for features.
 */
export type LayerStatus =
  | { readonly kind: "off" }
  | { readonly kind: "on" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      /** How many are drawn. */
      readonly count: number;
      readonly updatedAt: number;
      /** True when the query had more than its cap, so only the first are drawn. */
      readonly capped?: boolean;
    }
  | { readonly kind: "zoom-in" }
  | { readonly kind: "empty"; readonly updatedAt: number }
  | { readonly kind: "error"; readonly error: "network" | "invalid" };

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
  setControl(id: string, controlId: string, value: string): void;
  setSort(id: string, sortId: string): void;
  retry(id: string): void;
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

interface LoadResult {
  readonly status: LayerStatus;
  readonly features: readonly LayerFeature[];
}

interface State {
  readonly enabled: readonly string[];
  readonly controls: Readonly<Record<string, ControlValues>>;
  readonly sorts: Readonly<Record<string, string>>;
  readonly results: Readonly<Record<string, LoadResult>>;
  readonly retries: Readonly<Record<string, number>>;
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
  readonly view: { readonly area: Bounds; readonly zoom: number } | null;
  readonly focusRequest: number;
  /** The `focusRequest` that has been acted on. */
  readonly focusHandled: number;
  readonly detail: DetailState | null;
}

const OFF: LoadResult = { status: { kind: "off" }, features: [] };

/** A layer id, the key of the request it wants, and (for a query layer) the area it asks for. */
type WantedRequest = readonly [string, string, Bounds | undefined];

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
    selection: null,
    choices: null,
    view: null,
    focusRequest: 0,
    focusHandled: 0,
    detail: null,
  };
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

function errorKind(
  error: unknown,
): "network" | "invalid" | "aborted" | "empty" {
  return error instanceof LayerError ? error.kind : "invalid";
}

/**
 * The state of every data layer and the actions on it, driven entirely by
 * the definitions in the registry: nothing here names a layer.
 *
 * @remarks Nothing is requested until a layer is turned on. A feed layer is
 *   loaded on enable, on a control change and on retry; the request for the
 *   previous URL is cancelled. Tile layers need no request here: the map
 *   draws their tiles. Loads, empty feeds and failures are announced once
 *   each through the shared live region, failures assertively. Turning a
 *   layer off clears its features, its selection and its affected area.
 */
export function useDataLayers(options: UseDataLayersOptions = {}): DataLayers {
  const { layers: registry, layerSource } = useServices();
  const announce = useAnnounce();
  const now = useCallback(() => (options.now ?? Date.now)(), [options.now]);
  const definitions = registry.list();
  const [state, setState] = useState(() =>
    initialState(definitions, options.initial, now()),
  );
  const stateRef = useLatestRef(state);
  const requests = useRef(
    new Map<string, { key: string; controller: AbortController }>(),
  );
  /** The request key each layer last settled for, so a settled layer is not loaded again. */
  const loadedKeys = useRef(new Map<string, string>());
  /** The window each query layer last asked for. */
  const queryWindows = useRef(new Map<string, Bounds>());
  /**
   * What each query layer last said aloud, so a refresh for another part of
   * the map is not announced again, only a change in what it shows.
   */
  const announcedStates = useRef(
    new Map<string, "ready" | "capped" | "empty" | "error" | "zoom-in">(),
  );
  const detailRequest = useRef<AbortController | null>(null);

  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  // The key of each enabled feed layer's request; a change starts a new load.
  // A query layer asks for a window around the map's view, kept while the
  // view stays inside it, and for nothing until the map has said where it is.
  const wanted = state.enabled.flatMap((id): WantedRequest[] => {
    const definition = byId.get(id);
    if (!definition || !loadsFeatures(definition)) {
      return [];
    }
    const controls = state.controls[id] ?? {};
    const retries = state.retries[id] ?? 0;
    if (isQueryLayer(definition)) {
      const { view } = state;
      if (!view || view.zoom < (definition.source.minzoom ?? 0)) {
        queryWindows.current.delete(id);
        return [];
      }
      const area = nextQueryWindow(
        queryWindows.current.get(id) ?? null,
        view.area,
      );
      queryWindows.current.set(id, area);
      const url = feedUrl(definition, controls, now(), area);
      return [[id, `${url}#${retries}`, area]];
    }
    const url = feedUrl(definition, controls, now());
    return [[id, `${url}#${retries}`, undefined]];
  });
  const signature = wanted.map(([id, key]) => `${id} ${key}`).join("\n");

  // Query layers that are too far out, so each is told once to zoom in.
  const tooFar = state.enabled.filter((id) => {
    const definition = byId.get(id);
    return (
      definition !== undefined &&
      isQueryLayer(definition) &&
      state.view !== null &&
      state.view.zoom < (definition.source.minzoom ?? 0)
    );
  });
  const tooFarSignature = tooFar.join(" ");

  // biome-ignore lint/correctness/useExhaustiveDependencies: the signatures are the triggers; everything else is read through refs or is stable.
  useEffect(() => {
    for (const id of tooFar) {
      if (announcedStates.current.get(id) !== "zoom-in") {
        announcedStates.current.set(id, "zoom-in");
        announce(announceLayerZoomIn((byId.get(id) as LayerDefinition).name), {
          priority: "polite",
        });
      }
    }
  }, [tooFarSignature]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature is the trigger; everything else is read through refs or is stable.
  useEffect(() => {
    const keys = new Map(wanted.map(([id, key]) => [id, key]));
    const areas = new Map(wanted.map(([id, , area]) => [id, area]));
    for (const [id, request] of requests.current) {
      if (keys.get(id) !== request.key) {
        request.controller.abort();
        requests.current.delete(id);
      }
    }
    for (const [id, key] of loadedKeys.current) {
      if (keys.get(id) !== key) {
        loadedKeys.current.delete(id);
      }
    }
    for (const [id, key] of keys) {
      // A layer that has settled for this request is not loaded again because
      // another layer was turned on or off.
      if (requests.current.has(id) || loadedKeys.current.get(id) === key) {
        continue;
      }
      const definition = byId.get(id) as LayerDefinition;
      const controller = new AbortController();
      requests.current.set(id, { key, controller });
      const settle = (result: LoadResult) => {
        if (requests.current.get(id)?.key !== key) {
          return;
        }
        requests.current.delete(id);
        loadedKeys.current.set(id, key);
        setState((current) => ({
          ...current,
          results: { ...current.results, [id]: result },
        }));
      };
      const query = isQueryLayer(definition) ? definition : null;
      // A query layer says each state once: a pan to another window is not news.
      const say = (
        announced: "ready" | "capped" | "empty" | "error",
        message: string,
        priority: "polite" | "assertive",
      ) => {
        if (query && announcedStates.current.get(id) === announced) {
          return;
        }
        announcedStates.current.set(id, announced);
        announce(message, { priority });
      };
      setState((current) => ({
        ...current,
        results: {
          ...current.results,
          // A query layer keeps what it draws while the next window loads.
          [id]: {
            status: { kind: "loading" },
            features: query ? (current.results[id]?.features ?? []) : [],
          },
        },
      }));
      layerSource
        .load({
          definition,
          controls: stateRef.current.controls[id] ?? {},
          now: now(),
          signal: controller.signal,
          ...(areas.get(id) ? { area: areas.get(id) } : {}),
        })
        .then(
          (loaded) => {
            const capped =
              query !== null && loaded.length > query.source.maxFeatures;
            const features = capped
              ? loaded.slice(0, query.source.maxFeatures)
              : loaded;
            settle({
              status: {
                kind: "ready",
                count: features.length,
                updatedAt: now(),
                ...(capped ? { capped: true } : {}),
              },
              features,
            });
            say(
              capped ? "capped" : "ready",
              capped
                ? announceLayerCapped(definition.name, features.length)
                : announceLayerLoaded(definition.name, features.length),
              "polite",
            );
          },
          (error: unknown) => {
            const kind = errorKind(error);
            if (kind === "aborted" || controller.signal.aborted) {
              return;
            }
            if (kind === "empty") {
              settle({
                status: { kind: "empty", updatedAt: now() },
                features: [],
              });
              if (loadsFeatures(definition)) {
                say(
                  "empty",
                  announceLayerEmpty(definition.name, definition.emptyText),
                  "polite",
                );
              }
              return;
            }
            settle({ status: { kind: "error", error: kind }, features: [] });
            say(
              "error",
              announceLayerError(definition.name, kind),
              "assertive",
            );
          },
        );
    }
  }, [signature]);

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

  const setEnabled = useCallback(
    (id: string, enabled: boolean) => {
      const definition = byId.get(id);
      const current = stateRef.current;
      if (!definition || current.enabled.includes(id) === enabled) {
        return;
      }
      if (!enabled && current.detail?.layerId === id) {
        detailRequest.current?.abort();
      }
      announcedStates.current.delete(id);
      queryWindows.current.delete(id);
      setState((previous) => {
        const results = { ...previous.results };
        delete results[id];
        const choices =
          previous.choices?.filter((choice) => choice.layerId !== id) ?? null;
        return {
          ...previous,
          enabled: enabled
            ? [...previous.enabled, id]
            : previous.enabled.filter((item) => item !== id),
          results,
          selection:
            previous.selection?.layerId === id ? null : previous.selection,
          choices: choices && choices.length > 0 ? choices : null,
          detail: previous.detail?.layerId === id ? null : previous.detail,
        };
      });
      if (enabled && !loadsFeatures(definition)) {
        announce(announceLayerOn(definition.name), { priority: "polite" });
      }
    },
    [announce, byId, stateRef],
  );

  const setControl = useCallback(
    (id: string, controlId: string, value: string) => {
      const definition = byId.get(id);
      if (!definition) {
        return;
      }
      setState((previous) => ({
        ...previous,
        controls: {
          ...previous.controls,
          [id]: resolveControlValues(
            definition,
            { ...previous.controls[id], [controlId]: value },
            now(),
          ),
        },
      }));
    },
    [byId, now],
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
    [announce, select, stateRef],
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
    [announce, byId, layerSource, stateRef],
  );

  const layers = useMemo(
    () =>
      definitions.map((definition): DataLayerState => {
        const id = definition.id;
        const enabled = state.enabled.includes(id);
        const farOut =
          enabled &&
          isQueryLayer(definition) &&
          state.view !== null &&
          state.view.zoom < (definition.source.minzoom ?? 0);
        let result = OFF;
        if (farOut) {
          result = { status: { kind: "zoom-in" }, features: [] };
        } else if (enabled) {
          result =
            state.results[id] ??
            (loadsFeatures(definition)
              ? { status: { kind: "loading" }, features: [] }
              : { status: { kind: "on" }, features: [] });
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
    setControl,
    setSort,
    retry,
    select,
    choose,
    backToChoices,
    setView,
    showDetail,
    hideDetail,
  };
}
