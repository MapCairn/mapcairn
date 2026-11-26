// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type BasemapDefinition, MapEngineError } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { BasemapTiles } from "./basemapTiles";
import type { TileSourceRegistry } from "./dataLayerStore";
import {
  isTileOrSourceError,
  isWorkerFailure,
  tileEventSource,
} from "./engineErrors";
import type { PendingLoad } from "./pendingLoad";
import { RepaintUntilIdle } from "./repaintUntilIdle";
import { type TileFormatReports, TileFormatWatch } from "./tileFormatWatch";
import { type TileLayerReports, TileLayerTraffic } from "./tileLayerTraffic";
import {
  WORKER_FAILURE_GRACE_MS,
  WorkerFailureCheck,
} from "./workerFailureCheck";

/** What failure detection tells the adapter's owner; each maps to a `MapEvents` event. */
export interface FailureReports extends TileLayerReports, TileFormatReports {
  /** A tile or source failed, or something other than the style did; the map keeps working. */
  tileError(): void;
  basemapUnavailable(basemap: BasemapDefinition): void;
  fatalError(error: MapEngineError): void;
}

/** What failure detection needs from the adapter's mount and swap lifecycle. */
export interface FailureDetectionHost {
  /** The mount or swap that waits for a style, if one does. */
  pendingLoad(): PendingLoad | undefined;
  /** Rejects `pending`, as the adapter's lifecycle does when a style could not load. */
  failPending(pending: PendingLoad, error: unknown): void;
}

/** Options for {@link FailureDetection}. */
export interface FailureDetectionOptions {
  /** Overrides {@link WORKER_FAILURE_GRACE_MS}. */
  readonly workerFailureGraceMs?: number;
  /** Overrides the wait before a tile layer is reported slow. */
  readonly tileLayerSlowMs?: number;
}

/**
 * Classifies the engine's `error` events and judges the map by its tiles.
 *
 * Engine `error` events are classified once:
 * - a tile or source failure leaves the map working (`tileError`), except a
 *   tile of a vector tile data layer that could not be read, which that layer
 *   reports itself as `tileLayerWrongFormat` when the map settles (see
 *   {@link TileFormatWatch}), and one of a raster tile data layer, which that layer reports itself as
 *   `tileLayerUnavailable` when the map settles, or as `tileLayerSlow` when it
 *   has waited with nothing loaded (see {@link TileLayerTraffic});
 * - a source-less error before the pending style document has loaded
 *   (`style.load`) means that document failed: it rejects the pending mount or
 *   swap, and a failed swap puts the last basemap that loaded back. A worker
 *   error also rejects a pending mount, which could never finish without its
 *   workers;
 * - a worker error on a loaded map starts a grace check (see
 *   {@link WorkerFailureCheck}): if the map goes idle meanwhile, or has
 *   everything loaded when it ends, the engine still works and the error is a
 *   `tileError`; otherwise it is a `fatalError`. MapLibre reports an uncaught
 *   exception inside a running worker with the same message as a worker that
 *   never started, so the message alone cannot tell them apart;
 * - anything else, such as a missing sprite or glyph, is a `tileError`.
 *
 * It owns the tile counters of the basemap and of each tile layer and the
 * repaint that lets a map whose last tiles were 404s settle. It reads the map
 * only to listen to it and to paint it.
 */
export class FailureDetection {
  private readonly basemapTiles = new BasemapTiles();
  private readonly traffic: TileLayerTraffic;
  private readonly formats: TileFormatWatch;
  private readonly repaint = new RepaintUntilIdle();
  private readonly workerCheck: WorkerFailureCheck;

  constructor(
    private readonly reports: FailureReports,
    private readonly host: FailureDetectionHost,
    options: FailureDetectionOptions = {},
  ) {
    this.traffic = new TileLayerTraffic(reports, options.tileLayerSlowMs);
    this.formats = new TileFormatWatch(reports);
    this.workerCheck = new WorkerFailureCheck(
      options.workerFailureGraceMs ?? WORKER_FAILURE_GRACE_MS,
      (engineStopped) => {
        if (engineStopped) {
          reports.fatalError(
            new MapEngineError(
              "stopped",
              "The map engine stopped working: its worker failed.",
            ),
          );
        } else {
          reports.tileError();
        }
      },
    );
  }

  /** The hook the data layer store reports its tile layers to. */
  get tileSources(): TileSourceRegistry {
    return this.traffic;
  }

  /** The hook the data layer store reports its vector tile layers to. */
  get vectorSources(): TileFormatWatch {
    return this.formats;
  }

  /** A basemap swap was asked for: tiles from here on belong to no basemap until its style has loaded. */
  basemapSwapRequested(): void {
    this.basemapTiles.clear();
  }

  /** A style loaded: its tiles are counted for `basemap` from here. */
  styleLoaded(basemap: BasemapDefinition | undefined): void {
    this.basemapTiles.startFor(basemap);
  }

  /** A `sourcedata` event: counts the tile if it is one. */
  tileLoaded(event: object): void {
    const sourceId = tileEventSource(event);
    if (sourceId === undefined) {
      return;
    }
    this.basemapTiles.recordLoaded(sourceId);
    this.traffic.recordLoaded(sourceId);
    this.formats.recordLoaded(sourceId);
  }

  /** A `sourcedataloading` event: counts the tile if it is a tile layer's, and paints until the map settles. */
  tileRequested(event: object, map: MapLibreMap): void {
    if (this.traffic.recordRequested(tileEventSource(event))) {
      this.repaint.start(map);
    }
  }

  /** A `sourcedataabort` event: counts the tile if it is a tile layer's. */
  tileAborted(event: object): void {
    this.traffic.recordAborted(tileEventSource(event));
  }

  /** Paints `map` until it next reports `idle`. */
  keepPainting(map: MapLibreMap): void {
    this.repaint.start(map);
  }

  /** The basemap is in: painting is no longer needed unless a tile layer still waits for a tile. */
  basemapIsIn(): void {
    if (!this.traffic.hasOutstandingTile()) {
      this.repaint.stop();
    }
  }

  /** The map settled (`idle`): stops painting and reports what failed to load. */
  settled(): void {
    this.repaint.stop();
    const basemap = this.basemapTiles.takeUnavailable();
    if (basemap) {
      this.reports.basemapUnavailable(basemap);
    }
    this.traffic.reportUnavailable();
    this.formats.reportSettled();
  }

  /** Classifies an engine `error` event (see the class). The caller logs it first. */
  handleError(event: object & { error?: unknown }, map: MapLibreMap): void {
    if (isTileOrSourceError(event)) {
      const { sourceId } = event as { sourceId?: unknown };
      // A vector layer is judged on its own, when the map settles.
      if (this.formats.recordFailed(sourceId, event.error)) {
        return;
      }
      this.basemapTiles.recordFailed(sourceId);
      // A tile layer is judged on its own, when the map settles.
      if (!this.traffic.has(sourceId)) {
        this.reports.tileError();
      }
      return;
    }
    const workerFailed = isWorkerFailure(event);
    const pending = this.host.pendingLoad();
    if (
      pending &&
      (!pending.styleLoaded || (workerFailed && pending.settleOn === "load"))
    ) {
      this.host.failPending(pending, event.error);
      return;
    }
    if (workerFailed) {
      this.workerCheck.begin(map);
      return;
    }
    this.reports.tileError();
  }

  /** Stops every timer and check, for when the map is torn down. */
  reset(): void {
    this.workerCheck.cancel();
    this.repaint.stop();
    this.traffic.clearTimers();
  }
}
