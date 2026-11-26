// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapTileLayerWrongFormat } from "@mapcairn/core";

/**
 * The start of the message maplibre-gl (6.19, `loadVectorTile` in its worker)
 * gives a tile it could not read as the source's encoding: bytes that are not
 * a Mapbox Vector Tile for an `mvt` source, or not a MapLibre Tile for an
 * `mlt` one, or a gzipped body the server did not label. The engine reports it
 * as an `error` with the tile's source id and no type of its own, so the
 * message is the only way to tell it from a network failure. A tile the
 * server answers with 404 is an empty tile to the engine and raises none.
 */
const TILE_UNREADABLE_MESSAGE = "Unable to parse the tile at ";

/** What the watch tells its owner. */
export interface TileFormatReports {
  /** The layer's tiles could not be read, and none of them could. */
  wrongFormat(report: MapTileLayerWrongFormat): void;
}

/** What one watched vector source has had so far since it was last drawn. */
interface WatchedSource {
  readonly layerId: string;
  readonly tiles: string;
  unreadable: number;
  loaded: number;
  reported: boolean;
}

/**
 * Watches the vector sources of data layers for tiles that cannot be read in
 * the encoding the source declares, and judges each layer once the map
 * settles: reported when a tile could not be read and none loaded, so a layer
 * that draws is never called wrong for one bad tile. It keeps no reference to
 * the map.
 */
export class TileFormatWatch {
  private readonly sources = new Map<string, WatchedSource>();

  constructor(private readonly reports: TileFormatReports) {}

  /** Starts watching `source`, drawn from `tiles`, for the layer `layerId`; drawing it again starts the count over. */
  register(source: string, layerId: string, tiles: string): void {
    this.sources.set(source, {
      layerId,
      tiles,
      unreadable: 0,
      loaded: 0,
      reported: false,
    });
  }

  /** Stops watching a source that was erased or drawn over. */
  release(source: string): void {
    this.sources.delete(source);
  }

  /** Counts a tile of `source` that loaded. */
  recordLoaded(source: string): void {
    const watched = this.sources.get(source);
    if (watched) {
      watched.loaded += 1;
    }
  }

  /**
   * Counts a tile failure of `source`, when it is a watched source and the
   * failure is an unreadable tile.
   * @returns Whether it was taken. Anything else is left to the general handling.
   */
  recordFailed(source: unknown, error: unknown): boolean {
    const watched = typeof source === "string" && this.sources.get(source);
    if (
      !watched ||
      !(error instanceof Error) ||
      !error.message.startsWith(TILE_UNREADABLE_MESSAGE)
    ) {
      return false;
    }
    watched.unreadable += 1;
    return true;
  }

  /** The map settled: reports each watched layer that has had unreadable tiles and no tile loaded, once. */
  reportSettled(): void {
    for (const watched of this.sources.values()) {
      if (watched.reported || watched.loaded > 0 || watched.unreadable === 0) {
        continue;
      }
      watched.reported = true;
      this.reports.wrongFormat({
        layerId: watched.layerId,
        tiles: watched.tiles,
      });
    }
  }
}
