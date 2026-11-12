// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceLayerZoomIn,
  isQueryLayer,
  type LayerDefinition,
} from "@mapcairn/core";
import type { Announce } from "../ui/LiveRegion";
import type { Spoken, SpokenState } from "./loadOutcome";

/** What a query layer last said aloud, or `zoom-in` when it was told to zoom in. */
export type AnnouncedState = SpokenState | "zoom-in";

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

/** Tells a query layer that is too far out to zoom in, once until it says something else. */
export function reportZoomIn(
  definition: LayerDefinition,
  announced: AnnouncedStates,
  announce: Announce,
): void {
  if (announced.get(definition.id) === "zoom-in") {
    return;
  }
  announced.set(definition.id, "zoom-in");
  announce(announceLayerZoomIn(definition.name), { priority: "polite" });
}
