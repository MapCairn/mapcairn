// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFormatterRegistry,
  type FeatureRef,
  type FeatureSelection,
  type FormatterRegistry,
  featureRefKey,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSelectionStore } from "../services";
import { useAnnounce } from "../ui/LiveRegion";
import { featureTitle } from "./featureTitle";
import {
  addedAnnouncement,
  clearedAnnouncement,
  removedAnnouncement,
  type SelectionAnnouncement,
  type TitleOf,
} from "./selectionMessages";
import {
  reconcileSnapshots,
  resolveSelection,
  type SelectedEntry,
  type SelectionSnapshots,
  selectableRefs,
} from "./selectionResolve";
import type { DataLayers } from "./useDataLayers";

const DEFAULT_FORMATTERS = createFormatterRegistry();
const NO_SNAPSHOTS: SelectionSnapshots = new Map();
const NO_ENTRIES: readonly SelectedEntry[] = [];

/** A change that does nothing: the methods of {@link NO_STORE}. */
const DO_NOTHING = () => undefined;
const NO_REFS: readonly FeatureRef[] = Object.freeze([]);

/**
 * Stands in while the host supplies no store, so every hook below is called
 * either way. It holds nothing, refuses every addition (its limit is zero),
 * and the state built from it is never returned.
 */
const NO_STORE: FeatureSelection = {
  limit: 0,
  getState: () => NO_REFS,
  subscribe: () => DO_NOTHING,
  add: DO_NOTHING,
  remove: DO_NOTHING,
  replace: DO_NOTHING,
  clear: DO_NOTHING,
};

/** Options for {@link useFeatureSelection}. */
export interface UseFeatureSelectionOptions {
  /** The formatters card templates may name, for the titles in messages. Defaults to the built-ins. */
  readonly formatters?: FormatterRegistry;
}

/** What {@link useFeatureSelection} returns: the selected set as the ui shows it, and every action on it. */
export interface FeatureSelectionState {
  /** The selected references in selection order, each resolved against the layers (see {@link SelectedEntry}). */
  readonly entries: readonly SelectedEntry[];
  /** The most references the store holds. */
  readonly limit: number;
  /** Whether select mode is on. It is only a flag: nothing here reads it. */
  readonly selecting: boolean;
  /** Turns select mode on or off. */
  setSelecting(selecting: boolean): void;
  /** Selects the feature, or deselects it when it is selected. */
  toggle(ref: FeatureRef): void;
  /**
   * Selects the references that are not yet selected and belong to a feed
   * layer. The store refuses the whole batch when it would pass its limit.
   */
  add(refs: readonly FeatureRef[]): void;
  /** Deselects the references that are selected. Always allowed. */
  remove(refs: readonly FeatureRef[]): void;
  /** Empties the selection. */
  clear(): void;
}

/**
 * The selected set as the ui shows it: the host's `FeatureSelection` store,
 * resolved against the layers, with the select-mode flag and one message to
 * the live region for each change a person makes.
 *
 * Call it once, in the host beside `useDataLayers`, and hand the result down
 * with `SelectionProvider`: its state outlives the sheet's sections, which
 * unmount. It returns null when the host supplies no store, so a host without
 * one offers no selection.
 *
 * @remarks A reference shows its layer's loaded feature, else a snapshot kept
 *   while it was loaded, but only while its layer is on and is a feed layer.
 *   Otherwise it is not shown, and it stays in the store and counts. Turning a
 *   layer off, or a layer leaving the catalogue, drops nothing and says nothing
 *   here: `useDataLayers` announces the turning off itself, and its Undo brings
 *   the references back. A change made outside (hydration, a failed save)
 *   updates `entries` and is not announced. Each message carries the new
 *   total, because the live region coalesces messages that arrive within
 *   `THROTTLE_MS` of the last one sent to the latest of them. The refusal of
 *   a batch past the limit is assertive, the rest polite.
 */
export function useFeatureSelection(
  layers: DataLayers,
  options: UseFeatureSelectionOptions = {},
): FeatureSelectionState | null {
  const { formatters = DEFAULT_FORMATTERS } = options;
  const hostStore = useSelectionStore();
  const store = hostStore ?? NO_STORE;
  const announce = useAnnounce();
  const refs = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const [selecting, setSelecting] = useState(false);
  const [snapshots, setSnapshots] = useState(NO_SNAPSHOTS);
  const layerStates = layers.layers;

  useEffect(() => {
    if (!hostStore) {
      return;
    }
    setSnapshots((previous) => reconcileSnapshots(previous, refs, layerStates));
  }, [hostStore, refs, layerStates]);

  /**
   * The entries of the last render. Resolving against them keeps every entry
   * that did not change, so a map move, which makes new layer states with the
   * same features, leaves `entries` and the state built from it as they were.
   * A render React discards can leave a result here, which is harmless: it is
   * only compared with by value.
   */
  const keptEntries = useRef(NO_ENTRIES);
  const entries = useMemo(() => {
    if (!hostStore) {
      return NO_ENTRIES;
    }
    const next = resolveSelection(
      refs,
      layerStates,
      snapshots,
      keptEntries.current,
    );
    keptEntries.current = next;
    return next;
  }, [hostStore, refs, layerStates, snapshots]);

  const latest = useLatestRef({
    layerStates,
    snapshots,
    formatters,
    now: layers.now,
  });
  const titleOf = useCallback<TitleOf>(
    (ref) => {
      const { layerStates, snapshots, formatters, now } = latest.current;
      const [entry] = resolveSelection([ref], layerStates, snapshots);
      return entry?.status === "shown"
        ? featureTitle(entry.definition, entry.feature, formatters, {
            now: now(),
          })
        : null;
    },
    [latest],
  );

  /**
   * Changes the store, then says what the change did, worked out from the set
   * before and after it. The store gives no result, so a refused batch is told
   * from one of duplicates by comparing the two sets.
   */
  const change = useCallback(
    (
      mutate: (selection: FeatureSelection) => void,
      describe: (
        before: readonly FeatureRef[],
        after: readonly FeatureRef[],
        selection: FeatureSelection,
      ) => SelectionAnnouncement | null,
    ) => {
      const before = store.getState();
      mutate(store);
      const said = describe(before, store.getState(), store);
      if (said) {
        announce(said.message, said.options);
      }
    },
    [store, announce],
  );

  const add = useCallback(
    (requested: readonly FeatureRef[]) => {
      const wanted = selectableRefs(requested, latest.current.layerStates);
      change(
        (selection) => selection.add(wanted),
        (before, after, selection) =>
          addedAnnouncement(wanted, before, after, selection.limit, titleOf),
      );
    },
    [change, titleOf, latest],
  );

  const remove = useCallback(
    (removed: readonly FeatureRef[]) =>
      change(
        (selection) => selection.remove(removed),
        (before, after) => removedAnnouncement(before, after, titleOf),
      ),
    [change, titleOf],
  );

  const clear = useCallback(
    () =>
      change(
        (selection) => selection.clear(),
        (before) => clearedAnnouncement(before),
      ),
    [change],
  );

  const toggle = useCallback(
    (ref: FeatureRef) => {
      const key = featureRefKey(ref);
      const selected = store
        .getState()
        .some((held) => featureRefKey(held) === key);
      (selected ? remove : add)([ref]);
    },
    [store, add, remove],
  );

  return useMemo(
    () =>
      hostStore
        ? {
            entries,
            limit: hostStore.limit,
            selecting,
            setSelecting,
            toggle,
            add,
            remove,
            clear,
          }
        : null,
    [hostStore, entries, selecting, toggle, add, remove, clear],
  );
}
