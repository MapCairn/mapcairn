// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";
import { ownSourceIds } from "./basemapTiles";

/**
 * Whether the style, and every one of the basemap's own sources, is in; the
 * busy state the ui shows is its opposite.
 * @remarks Data layer sources are never counted: a tile of one that never
 *   answers keeps the engine from going idle, and must not hold the map's busy
 *   state. Whether each source is in is asked of the engine
 *   (`isSourceLoaded`), not inferred from events, because a tile the provider
 *   answers with a 404 fires none.
 */
export class BasemapLoadState {
  /** Whether the style, or the style of a requested basemap still arriving, is loading. */
  private styleLoading = false;
  /**
   * The ids of the loaded style's own sources (the basemap's, and the imagery
   * of a hybrid one), read from the engine when the style loads; `undefined`
   * until then.
   */
  private sourceIds: readonly string[] | undefined;
  /**
   * Whether the engine has gone idle since the style started loading. A style
   * with no source of its own has nothing to ask, so it is in only once the
   * engine says so.
   */
  private idleSinceStyle = false;
  private busy = false;

  /** A style, or the style of a requested basemap, has started to load: nothing of it is in yet. */
  startStyleLoad(): void {
    this.styleLoading = true;
    this.sourceIds = undefined;
    this.idleSinceStyle = false;
  }

  /** The style document loaded: its own sources are known. */
  styleLoaded(map: MapLibreMap): void {
    this.styleLoading = false;
    this.sourceIds = ownSourceIds(map);
  }

  /** The engine went idle: it has its style and every source in, data layers included. */
  idle(map: MapLibreMap): void {
    this.styleLoading = false;
    this.idleSinceStyle = true;
    this.sourceIds ??= ownSourceIds(map);
  }

  /** Asked of the engine each time, so an event that never comes (a 404) cannot leave it waiting. */
  isIn(map: MapLibreMap | undefined): boolean {
    const ids = this.sourceIds;
    if (this.styleLoading || !map || !ids) {
      return false;
    }
    if (ids.length === 0) {
      return this.idleSinceStyle;
    }
    return ids.every((id) => !map.getSource(id) || map.isSourceLoaded(id));
  }

  /** Whether the busy state last published is on. */
  get loading(): boolean {
    return this.busy;
  }

  /** Records the busy state published; returns whether it changed. */
  publish(loading: boolean): boolean {
    if (this.busy === loading) {
      return false;
    }
    this.busy = loading;
    return true;
  }
}
