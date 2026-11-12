// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceLayerCapped,
  announceLayerEmpty,
  announceLayerError,
  announceLayerLoaded,
  isQueryLayer,
  LayerError,
  type LayerFeature,
  type LayerSource,
} from "@mapcairn/core";
import type { AnnouncePriority } from "../ui/LiveRegion";
import type { LayerStatus } from "./layerStatus";
import type { LoadableLayer, WantedLoad } from "./loadRequests";

/** What a layer shows once a load has settled. */
export interface LoadResult {
  readonly status: LayerStatus;
  readonly features: readonly LayerFeature[];
}

/** What a settled load says aloud, so a query layer can say each of them once. */
export type SpokenState = "ready" | "capped" | "empty" | "error";

/** A line for the live region, and the state of the layer it describes. */
export interface Spoken {
  readonly state: SpokenState;
  readonly message: string;
  readonly priority: AnnouncePriority;
}

/** A settled load: what the layer shows, and what is said about it. */
export interface LoadOutcome {
  readonly result: LoadResult;
  readonly spoken: Spoken;
}

/** The kind of a failure, with anything that is not a `LayerError` counted as `invalid`. */
export function errorKind(
  error: unknown,
): "network" | "invalid" | "aborted" | "empty" {
  return error instanceof LayerError ? error.kind : "invalid";
}

/** The features a layer draws: a query layer draws at most `maxFeatures` of what came back. */
function drawn(
  definition: LoadableLayer,
  loaded: readonly LayerFeature[],
): { readonly features: readonly LayerFeature[]; readonly capped: boolean } {
  if (
    isQueryLayer(definition) &&
    loaded.length > definition.source.maxFeatures
  ) {
    return {
      features: loaded.slice(0, definition.source.maxFeatures),
      capped: true,
    };
  }
  return { features: loaded, capped: false };
}

/** The outcome of a load that returned features, saying so when a query layer drew only the first. */
export function outcomeOfFeatures(
  definition: LoadableLayer,
  loaded: readonly LayerFeature[],
  now: number,
): LoadOutcome {
  const { features, capped } = drawn(definition, loaded);
  return {
    result: {
      status: {
        kind: "ready",
        count: features.length,
        updatedAt: now,
        ...(capped ? { capped: true } : {}),
      },
      features,
    },
    spoken: {
      state: capped ? "capped" : "ready",
      message: capped
        ? announceLayerCapped(definition.name, features.length)
        : announceLayerLoaded(definition.name, features.length),
      priority: "polite",
    },
  };
}

/**
 * The outcome of a load that failed, or null when it was aborted, which says
 * nothing and changes nothing. A feed with nothing in it is `empty`, in the
 * layer's own words; anything else is an error.
 */
export function outcomeOfFailure(
  definition: LoadableLayer,
  error: unknown,
  now: number,
): LoadOutcome | null {
  const kind = errorKind(error);
  if (kind === "aborted") {
    return null;
  }
  if (kind === "empty") {
    return {
      result: { status: { kind: "empty", updatedAt: now }, features: [] },
      spoken: {
        state: "empty",
        message: announceLayerEmpty(definition.name, definition.emptyText),
        priority: "polite",
      },
    };
  }
  return {
    result: { status: { kind: "error", error: kind }, features: [] },
    spoken: {
      state: "error",
      message: announceLayerError(definition.name, kind),
      priority: "assertive",
    },
  };
}

/**
 * Loads what a layer wants through the source and works out what the layer
 * then shows and says. Resolves to null when the load was cancelled, by its
 * own signal or because the source said it was aborted.
 */
export function loadOutcome(
  source: LayerSource,
  load: WantedLoad,
  now: () => number,
  signal: AbortSignal,
): Promise<LoadOutcome | null> {
  const { definition, controls, area } = load;
  return source
    .load({
      definition,
      controls,
      now: now(),
      signal,
      ...(area ? { area } : {}),
    })
    .then(
      (loaded) => outcomeOfFeatures(definition, loaded, now()),
      (error: unknown) =>
        signal.aborted ? null : outcomeOfFailure(definition, error, now()),
    );
}
