// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type ControlValues,
  type IdentifiableLayerDefinition,
  type IdentifyReport,
  type IdentifyTarget,
  isIdentifiable,
  type LatLng,
  type LayerDefinition,
  type LayerFeature,
  type LayerSource,
  tileUrl,
} from "@mapcairn/core";
import { errorKind } from "./layerStatus";

/** The most layers one tap asks, in catalogue order. A tap that could ask more says how many it asked. */
export const MAX_IDENTIFY_LAYERS = 4;

/**
 * How long one layer has to answer a tap, in milliseconds. The hook counts it
 * itself: a source only sees that its request was aborted.
 */
export const IDENTIFY_TIMEOUT_MS = 8_000;

/** What a layer found at the last tap that answered for it, with the tiles it was showing. */
export interface IdentifiedEntry {
  /** The layer's tile URL at the time, so an answer is dropped when its tiles change. */
  readonly tiles: string;
  readonly features: readonly LayerFeature[];
}

/** A layer that is on and answers a tap, with what a request for it needs. */
export interface IdentifiableLayer {
  readonly definition: IdentifiableLayerDefinition;
  readonly controls: ControlValues;
  /** The tile URL its controls give now. */
  readonly tiles: string;
}

/** What {@link identifiableLayers} reads. */
export interface IdentifyInputs {
  /** Every layer in the catalogue, in order. */
  readonly definitions: readonly LayerDefinition[];
  /** The ids of the layers that are on. */
  readonly enabled: readonly string[];
  /** Every listed layer's control values. */
  readonly controls: Readonly<Record<string, ControlValues>>;
  /** The clock, in epoch milliseconds. */
  readonly now: number;
}

/** The layers that are on and answer a tap, in catalogue order. */
export function identifiableLayers({
  definitions,
  enabled,
  controls,
  now,
}: IdentifyInputs): IdentifiableLayer[] {
  return definitions.flatMap((definition) => {
    if (!isIdentifiable(definition) || !enabled.includes(definition.id)) {
      return [];
    }
    const own = controls[definition.id] ?? {};
    return [
      { definition, controls: own, tiles: tileUrl(definition, own, now) },
    ];
  });
}

/** Whether a tile layer's `bounds` hold a place. A layer with no bounds holds every place. */
function holds(
  bounds: IdentifiableLayerDefinition["source"]["bounds"],
  place: LatLng,
): boolean {
  if (!bounds) {
    return true;
  }
  const [west, south, east, north] = bounds;
  return (
    place.lng >= west &&
    place.lng <= east &&
    place.lat >= south &&
    place.lat <= north
  );
}

/**
 * The layers a tap could ask: those that show imagery (the map has not
 * reported none of their tiles loaded, `unavailable` being the tiles each was
 * reported for) and whose `bounds` hold the place.
 */
export function askableLayers(
  layers: readonly IdentifiableLayer[],
  unavailable: Readonly<Record<string, string>>,
  place: LatLng,
): IdentifiableLayer[] {
  return layers.filter(
    ({ definition }) =>
      unavailable[definition.id] === undefined &&
      holds(definition.source.bounds, place),
  );
}

/** How one layer's request ended. A cancelled one is neither shown nor said. */
export type IdentifyAnswer =
  | {
      readonly kind: "found";
      readonly layer: IdentifiableLayer;
      readonly features: readonly LayerFeature[];
    }
  | { readonly kind: "failed"; readonly layer: IdentifiableLayer }
  | { readonly kind: "cancelled"; readonly layer: IdentifiableLayer };

/** What a batch of answers comes to: what to store, what to open and what to say. */
export interface IdentifyOutcome {
  /** What each layer that answered found, by layer id. Empty answers are entries too. */
  readonly entries: Readonly<Record<string, IdentifiedEntry>>;
  /** Every feature found, in layer order. */
  readonly hits: readonly {
    readonly layerId: string;
    readonly featureId: string;
  }[];
  readonly report: IdentifyReport;
}

/**
 * What a batch of answers comes to, or null when every layer was cancelled,
 * which opens and says nothing. `available` is how many layers could have been
 * asked, so the report can say when the cap held some back.
 */
export function outcomeOf(
  answers: readonly IdentifyAnswer[],
  available: number,
): IdentifyOutcome | null {
  const found = answers.filter((answer) => answer.kind === "found");
  const failed = answers.filter((answer) => answer.kind === "failed");
  if (found.length + failed.length === 0) {
    return null;
  }
  const hits = found.flatMap(({ layer, features }) =>
    features.map((feature) => ({
      layerId: layer.definition.id,
      featureId: feature.id,
    })),
  );
  return {
    entries: Object.fromEntries(
      found.map(({ layer, features }) => [
        layer.definition.id,
        { tiles: layer.tiles, features },
      ]),
    ),
    hits,
    report: {
      found: hits.length,
      asked: answers.length,
      available,
      failed: failed.map(({ layer }) => layer.definition.name),
    },
  };
}

/**
 * One tap's requests: one for each layer asked, each with its own abort
 * controller and its own time limit. A request ends in an answer whichever
 * comes first, the source's reply or the abort, so a source that is slow to
 * notice an abort does not hold the tap up.
 */
export class IdentifyRun {
  readonly #requests = new Map<
    string,
    { readonly controller: AbortController; readonly tiles: string }
  >();

  /**
   * Asks one layer what is at `at`. Resolves, never rejects: with the
   * features, as failed (the source failed, or the layer ran out of
   * {@link IDENTIFY_TIMEOUT_MS}), or as cancelled when it was aborted for
   * another reason.
   */
  ask(
    source: LayerSource,
    layer: IdentifiableLayer,
    at: IdentifyTarget,
    now: number,
  ): Promise<IdentifyAnswer> {
    const controller = new AbortController();
    this.#requests.set(layer.definition.id, {
      controller,
      tiles: layer.tiles,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IDENTIFY_TIMEOUT_MS);
    const stopped = (): IdentifyAnswer => ({
      kind: timedOut ? "failed" : "cancelled",
      layer,
    });
    return new Promise<IdentifyAnswer>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(stopped()), {
        once: true,
      });
      source
        .identify({
          definition: layer.definition,
          controls: layer.controls,
          now,
          at,
          signal: controller.signal,
        })
        .then(
          (features) => resolve({ kind: "found", layer, features }),
          (error: unknown) =>
            resolve(
              errorKind(error) === "aborted"
                ? stopped()
                : { kind: "failed", layer },
            ),
        );
    }).finally(() => clearTimeout(timer));
  }

  /**
   * Aborts the requests of layers that are no longer on, or whose tiles are no
   * longer the ones they were asked about. `current` is each layer that is on
   * and answers a tap, with its tile URL.
   */
  abortStale(current: ReadonlyMap<string, string>): void {
    for (const [id, { controller, tiles }] of this.#requests) {
      if (current.get(id) !== tiles) {
        controller.abort();
      }
    }
  }

  /** Aborts every request. */
  cancel(): void {
    for (const { controller } of this.#requests.values()) {
      controller.abort();
    }
  }
}
