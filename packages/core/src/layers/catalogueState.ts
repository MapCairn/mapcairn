// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  CatalogueRefresh,
  CatalogueState,
  LayerCatalogue,
  SkippedDefinition,
} from "../ports/layers";
import type { LayerDefinition } from "./definition";

/** The `ready` member of {@link CatalogueState}. */
export type ReadyCatalogueState = Extract<CatalogueState, { status: "ready" }>;

const NO_LAYERS: readonly LayerDefinition[] = Object.freeze([]);
const NO_SKIPPED: readonly SkippedDefinition[] = Object.freeze([]);

/**
 * A frozen `ready` state. The lists are used as given, so a caller that wants
 * them kept apart from its own passes copies.
 */
export function readyState(
  layers: readonly LayerDefinition[],
  skipped: readonly SkippedDefinition[] = NO_SKIPPED,
  refresh: CatalogueRefresh = "idle",
): ReadyCatalogueState {
  return Object.freeze({ status: "ready", layers, skipped, refresh });
}

/**
 * The layers a state offers: its list when `ready`, and none while the
 * catalogue is `loading` or has `failed`. The same array every time for a
 * state, so it is safe in a dependency list.
 */
export function readyLayers(state: CatalogueState): readonly LayerDefinition[] {
  return state.status === "ready" ? state.layers : NO_LAYERS;
}

const STOP_NOTHING = (): void => {};

/**
 * A {@link LayerCatalogue} that holds one state for good: it never changes,
 * so it tells no subscriber and a refresh resolves with nothing to do. The
 * static and the empty catalogue are this.
 */
export function createFixedCatalogue(state: CatalogueState): LayerCatalogue {
  return Object.freeze({
    getState: () => state,
    subscribe: () => STOP_NOTHING,
    refresh: () => Promise.resolve(),
  });
}

/** A catalogue's state and the people listening to it. */
export interface CatalogueStore {
  getState(): CatalogueState;
  /** Replaces the state and tells every subscriber once. */
  setState(next: CatalogueState): void;
  subscribe(listener: () => void): () => void;
}

/**
 * The store behind a catalogue that changes. Its methods are closures, not
 * class members, so `useSyncExternalStore(store.subscribe, store.getState)`
 * needs no binding. A listener added twice is called twice and removed once
 * for each unsubscribe.
 */
export function createCatalogueStore(initial: CatalogueState): CatalogueStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (next) => {
      state = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe: (listener) => {
      const entry = () => listener();
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
  };
}
