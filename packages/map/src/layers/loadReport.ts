// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceLayerZoomIn,
  announceLayerZoomOut,
  isQueryLayer,
  type LayerDefinition,
  type ZoomLimit,
} from "@mapcairn/core";
import type { Announce } from "../ui/LiveRegion";
import type { Spoken, SpokenState } from "./loadOutcome";

/** What a layer last said aloud, or which way it was told to zoom. */
export type AnnouncedState = SpokenState | ZoomLimit["kind"];

/**
 * What each query layer last said aloud, by layer id, so a refresh for
 * another part of the map is not announced again, only a change in what it
 * shows.
 */
export type AnnouncedStates = Map<string, AnnouncedState>;

/**
 * Says what a settled load found. A feed layer says it every time; a query
 * layer says each state once, because a pan to another window is not news.
 */
export function reportLoad(
  definition: LayerDefinition,
  spoken: Spoken,
  announced: AnnouncedStates,
  announce: Announce,
): void {
  if (
    isQueryLayer(definition) &&
    announced.get(definition.id) === spoken.state
  ) {
    return;
  }
  announced.set(definition.id, spoken.state);
  announce(spoken.message, { priority: spoken.priority });
}

/** A layer outside its zoom window, and the limit it is outside. */
export interface LimitedLayer {
  readonly definition: LayerDefinition;
  readonly limit: ZoomLimit;
}

function isZoomState(state: AnnouncedState | undefined): boolean {
  return state === "zoom-in" || state === "zoom-out";
}

/**
 * Tells each layer that is outside its zoom window which way to zoom and to
 * which level, once until it says something else. A layer that is no longer
 * outside its window forgets what it said, so it is told again the next time
 * it goes out: a layer with nothing to load (vector tiles) says nothing else
 * in between.
 */
export function reportZoomLimits(
  limited: readonly LimitedLayer[],
  announced: AnnouncedStates,
  announce: Announce,
): void {
  const stillOut = new Set(limited.map(({ definition }) => definition.id));
  for (const [id, state] of announced) {
    if (isZoomState(state) && !stillOut.has(id)) {
      announced.delete(id);
    }
  }
  for (const { definition, limit } of limited) {
    if (announced.get(definition.id) === limit.kind) {
      continue;
    }
    announced.set(definition.id, limit.kind);
    announce(
      limit.kind === "zoom-in"
        ? announceLayerZoomIn(definition.name, limit.level)
        : announceLayerZoomOut(definition.name, limit.level),
      { priority: "polite" },
    );
  }
}
