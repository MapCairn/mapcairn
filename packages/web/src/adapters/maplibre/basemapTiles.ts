// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { BasemapDefinition } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { IMAGERY_ID } from "./basemapStyle";
import { ENGINE_ID_PREFIX } from "./dataLayerPlan";

/**
 * Whether an engine source id belongs to the basemap's own style (or the
 * imagery a hybrid basemap adds) and not to a data layer or an overlay, whose
 * ids all start with {@link ENGINE_ID_PREFIX}.
 */
export function isBasemapSource(sourceId: unknown): sourceId is string {
  return typeof sourceId === "string" && !sourceId.startsWith(ENGINE_ID_PREFIX);
}

/** The ids of the sources in the engine's loaded style that belong to the basemap. */
export function ownSourceIds(map: MapLibreMap): readonly string[] {
  return Object.keys(map.getStyle().sources).filter(isBasemapSource);
}

/**
 * Whether an engine source's tiles decide if a basemap is available: any of
 * the basemap's own sources (never a data layer's), except that only the
 * imagery counts for a hybrid basemap, whose labels can load while the
 * imagery is down and would otherwise hide that it is.
 */
function decidesAvailability(
  basemap: BasemapDefinition | undefined,
  sourceId: unknown,
): boolean {
  if (!isBasemapSource(sourceId)) {
    return false;
  }
  return basemap?.source.kind !== "hybrid" || sourceId === IMAGERY_ID;
}

/**
 * Tile traffic of the basemap's own sources since its style last loaded: the
 * basemap that style belongs to (none between a swap being asked for and its
 * style loading), how many tiles loaded and how many failed, and whether
 * `basemapUnavailable` has been reported for it.
 */
export class BasemapTiles {
  private basemap: BasemapDefinition | undefined;
  private loaded = 0;
  private failed = 0;
  private reported = false;

  /** Counts afresh for the basemap whose style has just loaded. */
  startFor(basemap: BasemapDefinition | undefined): void {
    this.clear();
    this.basemap = basemap;
  }

  /** Blames no basemap, for before a style has loaded. */
  clear(): void {
    this.basemap = undefined;
    this.loaded = 0;
    this.failed = 0;
    this.reported = false;
  }

  /** Counts a tile that loaded, if its source decides availability. */
  recordLoaded(sourceId: unknown): void {
    if (decidesAvailability(this.basemap, sourceId)) {
      this.loaded += 1;
    }
  }

  /** Counts a tile that failed, if its source decides availability. */
  recordFailed(sourceId: unknown): void {
    if (decidesAvailability(this.basemap, sourceId)) {
      this.failed += 1;
    }
  }

  /**
   * The basemap to report as unavailable, once: when tiles of its own sources
   * failed and none loaded. A basemap that has drawn any tile is not reported,
   * however many tiles fail afterwards.
   */
  takeUnavailable(): BasemapDefinition | undefined {
    if (
      !this.basemap ||
      this.reported ||
      this.failed === 0 ||
      this.loaded > 0
    ) {
      return undefined;
    }
    this.reported = true;
    return this.basemap;
  }
}
