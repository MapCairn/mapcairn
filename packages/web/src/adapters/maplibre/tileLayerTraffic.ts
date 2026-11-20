// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  MapTileLayerRecovered,
  MapTileLayerSlow,
  MapTileLayerUnavailable,
} from "@mapcairn/core";
import type { TileLayerReport, TileSourceRegistry } from "./dataLayerStore";

/**
 * How long, in milliseconds, a tile data layer may have tiles asked for and
 * none loaded before the adapter reports it as slow (`tileLayerSlow`). It runs
 * from the first tile asked for and is not pushed back by later ones, so it
 * measures how long the layer has had nothing to show. It is a judgement, not a
 * measured figure: long enough that a provider that is merely slow to render
 * a tile is not flagged, and well inside the time the map keeps painting for
 * a tile that never answers (the give-up wait in `repaintUntilIdle.ts`), which is counted from
 * the last tile asked for and so never ends before this does. The map keeps
 * repainting until then, so a tile answered late with a 404 can still turn the
 * report into `tileLayerUnavailable`.
 */
export const TILE_LAYER_SLOW_MS = 10_000;

/** What a tile layer monitor tells its owner. */
export interface TileLayerReports {
  slow(report: MapTileLayerSlow): void;
  recovered(report: MapTileLayerRecovered): void;
  unavailable(report: MapTileLayerUnavailable): void;
}

/**
 * Tile traffic of one tile data layer since its source was last drawn. The
 * engine fires no `error` for a tile the provider answers with a 404, and
 * fires nothing for one that never answers, so the layer is judged by what was
 * asked for and what arrived, not by failures.
 */
interface TileLayerCount {
  readonly layerId: string;
  /** The tile template the source was drawn from. */
  readonly tiles: string;
  requested: number;
  aborted: number;
  loaded: number;
  report: TileLayerReport;
  /** The wait ({@link TILE_LAYER_SLOW_MS}) before the layer is reported slow, while one runs. */
  slowTimer?: ReturnType<typeof setTimeout>;
}

/** Whether a tile layer has asked for a tile that has neither loaded nor been given up on. */
function hasOutstandingTile({ requested, aborted, loaded }: TileLayerCount) {
  return requested > aborted + loaded;
}

/**
 * Counts the tiles of each raster tile data layer, by engine source id, and
 * judges each layer by them: slow, unavailable or recovered. It is the
 * {@link TileSourceRegistry} the data layer store reports to, and keeps no
 * reference to the map.
 */
export class TileLayerTraffic implements TileSourceRegistry {
  private readonly layers = new Map<string, TileLayerCount>();

  constructor(
    private readonly reports: TileLayerReports,
    private readonly slowMs: number = TILE_LAYER_SLOW_MS,
  ) {}

  /**
   * What a tile layer drawn again for `tiles` starts out as having reported:
   * the report of its earlier drawing if that loaded no tile, for the same
   * tiles. The report was made to the ui and its status is still showing, so
   * the new drawing's first tile has to end it.
   */
  carriedReport(source: string, tiles: string): TileLayerReport {
    const earlier = this.layers.get(source);
    return earlier?.loaded === 0 && earlier.tiles === tiles
      ? earlier.report
      : "none";
  }

  register(
    source: string,
    layerId: string,
    tiles: string,
    report: TileLayerReport,
  ): void {
    this.layers.set(source, {
      layerId,
      tiles,
      requested: 0,
      aborted: 0,
      loaded: 0,
      report,
    });
  }

  release(source: string): void {
    clearTimeout(this.layers.get(source)?.slowTimer);
    this.layers.delete(source);
  }

  /** Whether `sourceId` is a tile data layer's source. */
  has(sourceId: unknown): boolean {
    return typeof sourceId === "string" && this.layers.has(sourceId);
  }

  /** Whether any tile layer has asked for a tile that has neither loaded nor been given up on. */
  hasOutstandingTile(): boolean {
    return [...this.layers.values()].some(hasOutstandingTile);
  }

  /**
   * Counts one tile of a tile data layer's source that was asked for, and
   * starts the slow wait if it has none running.
   * @returns Whether the source is a tile data layer's; any other is not counted.
   */
  recordRequested(sourceId: string | undefined): boolean {
    const layer = this.layerOf(sourceId);
    if (!layer) {
      return false;
    }
    layer.requested += 1;
    this.watchForSlowTiles(layer);
    return true;
  }

  /** Counts one tile of a tile data layer's source that was given up on. */
  recordAborted(sourceId: string | undefined): void {
    const layer = this.layerOf(sourceId);
    if (layer) {
      layer.aborted += 1;
    }
  }

  /**
   * Counts one tile that loaded for a tile data layer's source (any other
   * source is not counted), and reports `tileLayerRecovered` if it is the
   * first since the layer reported `tileLayerSlow` or `tileLayerUnavailable`.
   * The recovery is decided from the counters before the tile is added to them.
   */
  recordLoaded(sourceId: string): void {
    const layer = this.layers.get(sourceId);
    if (!layer) {
      return;
    }
    const recovered = layer.report !== "none" && layer.loaded === 0;
    layer.loaded += 1;
    clearTimeout(layer.slowTimer);
    layer.slowTimer = undefined;
    if (recovered) {
      this.reports.recovered({ layerId: layer.layerId, tiles: layer.tiles });
    }
  }

  /**
   * Reports `tileLayerUnavailable` once for each tile data layer the map has
   * settled on with tiles asked for and none loaded, including one already
   * reported slow. A tile given up on (the view moved on) does not count as
   * asked for, and a layer that has drawn any tile is not reported, however
   * many fail afterwards.
   */
  reportUnavailable(): void {
    for (const layer of this.layers.values()) {
      const { layerId, tiles, requested, aborted, loaded, report } = layer;
      if (report === "unavailable" || loaded > 0 || requested <= aborted) {
        continue;
      }
      clearTimeout(layer.slowTimer);
      layer.slowTimer = undefined;
      layer.report = "unavailable";
      this.reports.unavailable({ layerId, tiles });
    }
  }

  /** Stops every slow wait that is running. */
  clearTimers(): void {
    for (const layer of this.layers.values()) {
      clearTimeout(layer.slowTimer);
    }
  }

  private layerOf(sourceId: string | undefined): TileLayerCount | undefined {
    return sourceId === undefined ? undefined : this.layers.get(sourceId);
  }

  /**
   * Starts the wait of {@link TILE_LAYER_SLOW_MS} for a layer that has had a
   * tile asked for, if it has none running and has nothing to show: no tile
   * loaded and nothing reported yet. Later tiles asked for do not restart it.
   * When it ends, the layer is reported slow if a tile is still outstanding;
   * otherwise nothing is outstanding and the next tile asked for starts it again.
   */
  private watchForSlowTiles(layer: TileLayerCount): void {
    if (
      layer.slowTimer !== undefined ||
      layer.loaded > 0 ||
      layer.report !== "none"
    ) {
      return;
    }
    layer.slowTimer = setTimeout(() => {
      layer.slowTimer = undefined;
      if (!hasOutstandingTile(layer)) {
        return;
      }
      layer.report = "slow";
      this.reports.slow({ layerId: layer.layerId, tiles: layer.tiles });
    }, this.slowMs);
  }
}
