// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  CatalogueFailure,
  CatalogueState,
  LayerCatalogue,
  SkippedDefinition,
} from "../ports/layers";
import { createCatalogueStore, readyState } from "./catalogueState";
import {
  type PartitionedDefinitions,
  partitionDefinitions,
} from "./partitionDefinitions";
import type { ValidationOptions } from "./validate";

/** What {@link createRuntimeLayerCatalogue} needs from the host. */
export interface RuntimeLayerCatalogueOptions {
  /**
   * Fetches the host's definitions, as the list its server returns. The
   * catalogue treats the result as untrusted: a value that is not a list is a
   * failure, and each entry is validated on its own. Reject for a failed
   * request, including a session that has expired, rather than resolve with
   * an empty list. `signal` fires only when the catalogue is disposed.
   */
  readonly load: (signal: AbortSignal) => Promise<unknown>;
  /** The decoders and formatters the definitions may name. */
  readonly options: ValidationOptions;
  /**
   * Told which definitions were left out, and why, after each load that
   * skipped any, so the host can log them. A person sees only a count. Its
   * errors are ignored: a logging fault must not stop the catalogue.
   */
  readonly onSkipped?: (skipped: readonly SkippedDefinition[]) => void;
}

/** A {@link LayerCatalogue} that loads its definitions when the app runs. */
export interface RuntimeLayerCatalogue extends LayerCatalogue {
  /**
   * Aborts the signal given to `load` and ignores anything it still
   * returns, so the state stays as it was: a catalogue that was loading stays
   * loading, and a refresh or subscription afterwards starts no load. For the
   * host's teardown: unsubscribing never calls it.
   */
  dispose(): void;
}

const LOADING: CatalogueState = Object.freeze({ status: "loading" });

type Outcome =
  | { readonly loaded: true; readonly payload: unknown }
  | { readonly loaded: false };

/** The state a catalogue is in while it asks for its definitions. */
function loadingFrom(state: CatalogueState): CatalogueState {
  return state.status === "ready"
    ? readyState(state.layers, state.skipped, "loading")
    : LOADING;
}

/**
 * The state after a failed load: a catalogue with a list keeps it and says
 * the refresh failed, and one with none has failed.
 */
function failedFrom(
  state: CatalogueState,
  reason: CatalogueFailure,
): CatalogueState {
  return state.status === "ready"
    ? readyState(state.layers, state.skipped, "failed")
    : Object.freeze({ status: "failed", reason });
}

/**
 * A {@link LayerCatalogue} whose definitions come from the host's own
 * `load` function, so they can differ for each person and change without a
 * deploy. The SDK never fetches them itself.
 *
 * @remarks It is `loading` when built, on the server and before its first
 *   subscription, so a server render and the first client render agree.
 *   `load` is first called on the first subscription (or the first
 *   `refresh`), never at construction, and only once for that: a subscriber
 *   that leaves and another that arrives, as React's StrictMode does, make no
 *   second request. One request is in flight at a time, and a `refresh` made
 *   meanwhile gets the pending promise. There is no timer: it loads again
 *   only when the host calls `refresh`.
 *
 *   Each entry is validated alone (see `partitionDefinitions`), so a bad
 *   definition costs one layer. A rejected load is `failed` with `network`, a
 *   result that is not a list is `failed` with `invalid`, and either keeps
 *   the list a refresh already had.
 */
export function createRuntimeLayerCatalogue({
  load,
  options,
  onSkipped,
}: RuntimeLayerCatalogueOptions): RuntimeLayerCatalogue {
  const store = createCatalogueStore(LOADING);
  const controller = new AbortController();
  let started = false;
  let inFlight: Promise<void> | null = null;
  let previous: PartitionedDefinitions | undefined;

  function publish(next: CatalogueState): void {
    if (next !== store.getState()) {
      store.setState(next);
    }
  }

  function report(skipped: readonly SkippedDefinition[]): void {
    try {
      onSkipped?.(skipped);
    } catch {
      // A host's logging fault must not stop the catalogue.
    }
  }

  function partition(payload: unknown): PartitionedDefinitions | null {
    if (!Array.isArray(payload)) {
      return null;
    }
    try {
      return partitionDefinitions(payload, options, previous);
    } catch {
      // The payload is the server's: one that cannot even be read is invalid.
      return null;
    }
  }

  function accept(payload: unknown): CatalogueState {
    const partitioned = partition(payload);
    if (partitioned === null) {
      return failedFrom(store.getState(), "invalid");
    }
    previous = partitioned;
    if (partitioned.skipped.length > 0) {
      report(partitioned.skipped);
    }
    return readyState(partitioned.layers, partitioned.skipped);
  }

  async function attempt(): Promise<Outcome> {
    try {
      // A load that throws before it returns a promise is a failed load too.
      const payload = await new Promise<unknown>((resolve) => {
        resolve(load(controller.signal));
      });
      return { loaded: true, payload };
    } catch {
      return { loaded: false };
    }
  }

  async function loadOnce(): Promise<void> {
    publish(loadingFrom(store.getState()));
    const outcome = await attempt();
    if (controller.signal.aborted) {
      return;
    }
    publish(
      outcome.loaded
        ? accept(outcome.payload)
        : failedFrom(store.getState(), "network"),
    );
  }

  function refresh(): Promise<void> {
    if (controller.signal.aborted) {
      return Promise.resolve();
    }
    started = true;
    inFlight ??= loadOnce().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    getState: store.getState,
    subscribe: (listener) => {
      const unsubscribe = store.subscribe(listener);
      if (!started) {
        void refresh();
      }
      return unsubscribe;
    },
    refresh,
    dispose: () => controller.abort(),
  };
}
