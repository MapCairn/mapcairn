import {
  announceDetailError,
  announceDetailShown,
  announceLayerEmpty,
  announceLayerError,
  announceLayerLoaded,
  announceLayerOn,
  type ControlValues,
  type FieldValue,
  feedUrl,
  isFeedLayer,
  type LayerAttribution,
  type LayerDefinition,
  LayerError,
  type LayerFeature,
  type LayersUrlState,
  parseTime,
  resolveControlValues,
} from "@karta/core";
import { useLatestRef } from "@karta/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "../services";
import { useAnnounce } from "../ui/LiveRegion";

/** Where a layer is: off, on (tiles), loading, loaded, empty or failed. */
export type LayerStatus =
  | { readonly kind: "off" }
  | { readonly kind: "on" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "ready";
      readonly count: number;
      readonly updatedAt: number;
    }
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
  readonly detail: DetailState | null;
  /** Grows each time a selection asks for its card to take focus (a tap on the map). */
  readonly focusRequest: number;
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
  select(
    layerId: string,
    featureId: string | null,
    options?: { readonly focus?: boolean },
  ): void;
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
  readonly selection: {
    readonly layerId: string;
    readonly featureId: string;
  } | null;
  readonly focusRequest: number;
  readonly detail: DetailState | null;
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
    selection: null,
    focusRequest: 0,
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
  const detailRequest = useRef<AbortController | null>(null);

  const byId = useMemo(
    () => new Map(definitions.map((definition) => [definition.id, definition])),
    [definitions],
  );

  // The key of each enabled feed layer's request; a change starts a new load.
  const wanted = state.enabled.flatMap((id) => {
    const definition = byId.get(id);
    if (!definition || !isFeedLayer(definition)) {
      return [];
    }
    const url = feedUrl(definition, state.controls[id] ?? {}, now());
    return [[id, `${url}#${state.retries[id] ?? 0}`] as const];
  });
  const signature = wanted.map(([id, key]) => `${id} ${key}`).join("\n");

  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature is the trigger; everything else is read through refs or is stable.
  useEffect(() => {
    const keys = new Map(wanted);
    for (const [id, request] of requests.current) {
      if (keys.get(id) !== request.key) {
        request.controller.abort();
        requests.current.delete(id);
      }
    }
    for (const [id, key] of keys) {
      if (requests.current.has(id)) {
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
        setState((current) => ({
          ...current,
          results: { ...current.results, [id]: result },
        }));
      };
      setState((current) => ({
        ...current,
        results: {
          ...current.results,
          [id]: { status: { kind: "loading" }, features: [] },
        },
      }));
      layerSource
        .load({
          definition,
          controls: stateRef.current.controls[id] ?? {},
          now: now(),
          signal: controller.signal,
        })
        .then(
          (features) => {
            settle({
              status: {
                kind: "ready",
                count: features.length,
                updatedAt: now(),
              },
              features,
            });
            announce(announceLayerLoaded(definition.name, features.length), {
              priority: "polite",
            });
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
              if (isFeedLayer(definition)) {
                announce(
                  announceLayerEmpty(definition.name, definition.emptyText),
                  {
                    priority: "polite",
                  },
                );
              }
              return;
            }
            settle({ status: { kind: "error", error: kind }, features: [] });
            announce(announceLayerError(definition.name, kind), {
              priority: "assertive",
            });
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
      setState((previous) => {
        const results = { ...previous.results };
        delete results[id];
        return {
          ...previous,
          enabled: enabled
            ? [...previous.enabled, id]
            : previous.enabled.filter((item) => item !== id),
          results,
          selection:
            previous.selection?.layerId === id ? null : previous.selection,
          detail: previous.detail?.layerId === id ? null : previous.detail,
        };
      });
      if (enabled && !isFeedLayer(definition)) {
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
      selectOptions: { readonly focus?: boolean } = {},
    ) => {
      setState((previous) => ({
        ...previous,
        selection: featureId === null ? null : { layerId, featureId },
        focusRequest: previous.focusRequest + (selectOptions.focus ? 1 : 0),
      }));
    },
    [],
  );

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
        const result = enabled
          ? (state.results[id] ??
            (isFeedLayer(definition)
              ? { status: { kind: "loading" } as const, features: [] }
              : { status: { kind: "on" } as const, features: [] }))
          : OFF;
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
    const feature = layer?.features.find(
      (item) => item.id === selection?.featureId,
    );
    return layer && feature ? { layer, feature } : null;
  }, [layers, state.selection]);

  const urlValue = useMemo<LayersUrlState>(
    () => ({
      enabled: state.enabled,
      controls: Object.fromEntries(
        state.enabled.map((id) => [id, state.controls[id] ?? {}]),
      ),
    }),
    [state.enabled, state.controls],
  );

  const credits = useMemo(
    () => state.enabled.flatMap((id) => byId.get(id)?.attribution ?? []),
    [state.enabled, byId],
  );

  return {
    layers,
    selected,
    detail: state.detail,
    focusRequest: state.focusRequest,
    urlValue,
    credits,
    now,
    setEnabled,
    setControl,
    setSort,
    retry,
    select,
    showDetail,
    hideDetail,
  };
}
