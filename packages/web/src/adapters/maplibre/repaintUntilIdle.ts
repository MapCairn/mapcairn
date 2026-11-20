// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * How often, in milliseconds, the map is painted while a tile layer's tiles,
 * or the basemap's own, load, so that it reports `idle` (and the basemap is
 * seen to be in) once they are all in, or all missing.
 */
export const TILE_SETTLE_NUDGE_MS = 250;

/**
 * How long, in milliseconds, the map on screen keeps painting after the last
 * tile of a tile layer or the basemap was asked for. A tile the provider
 * answers with a 404 is seen to be in within a few frames, so painting for
 * longer only serves a tile that never answers, which keeps the engine from
 * going idle however often it is painted.
 */
const TILE_SETTLE_GIVE_UP_MS = 30_000;

/**
 * Paints the map every {@link TILE_SETTLE_NUDGE_MS} until it next reports
 * `idle`. A tile the provider answers with a 404 fires no event and asks
 * for no new frame, so a map whose last tiles were such tiles is never
 * painted again and never reports `idle`: the layer could not be judged,
 * and the map would stay busy. One interval serves every tile layer and the
 * basemap's own tiles. The owner stops it at `idle`, and when the basemap is
 * in and no tile layer has a tile outstanding. A tile that never answers keeps
 * the engine from going idle however often the map is painted, and from
 * counting as in, so it also stops {@link TILE_SETTLE_GIVE_UP_MS} after the
 * last tile was asked for; a tile asked for later starts it again. The
 * counters cannot tell a tile that never answers from a 404, so only time
 * can.
 */
export class RepaintUntilIdle {
  private nudge: ReturnType<typeof setInterval> | undefined;
  private giveUp: ReturnType<typeof setTimeout> | undefined;

  /** Starts painting `map` if it is not already, and restarts the give-up wait. */
  start(map: MapLibreMap): void {
    this.nudge ??= setInterval(() => {
      map.triggerRepaint();
    }, TILE_SETTLE_NUDGE_MS);
    clearTimeout(this.giveUp);
    this.giveUp = setTimeout(() => this.stop(), TILE_SETTLE_GIVE_UP_MS);
  }

  stop(): void {
    clearInterval(this.nudge);
    clearTimeout(this.giveUp);
    this.nudge = undefined;
    this.giveUp = undefined;
  }
}
