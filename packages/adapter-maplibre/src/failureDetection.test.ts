// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { FAKE_RASTER_BASEMAP, type MapEngineError } from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_ID_PREFIX } from "./dataLayerPlan";
import { FailureDetection } from "./failureDetection";
import type { PendingLoad } from "./pendingLoad";

const GRACE_MS = 200;
const WORKER_ERROR = new Error(
  "Worker failed to load. Check that the worker URL is correct.",
);
const TILE_LAYER_SOURCE = `${ENGINE_ID_PREFIX}rain`;
const VECTOR_LAYER_SOURCE = `${ENGINE_ID_PREFIX}roads`;
const VECTOR_TILES = "https://v.test/{z}/{x}/{y}.pbf";
const UNREADABLE = new Error(
  "Unable to parse the tile at https://v.test/3/4/5.pbf, got error: Unimplemented type: 7",
);

/** An engine `error` event with the extra fields MapLibre adds to a tile's. */
function engineError(fields: Record<string, unknown>): { error?: unknown } {
  return fields;
}

function pendingLoad(
  settleOn: PendingLoad["settleOn"],
  styleLoaded: boolean,
): PendingLoad {
  return { settleOn, resolve: vi.fn(), reject: vi.fn(), styleLoaded };
}

function setUp(pending?: PendingLoad) {
  const reports = {
    tileError: vi.fn(),
    basemapUnavailable: vi.fn(),
    fatalError: vi.fn<(error: MapEngineError) => void>(),
    slow: vi.fn(),
    recovered: vi.fn(),
    unavailable: vi.fn(),
    wrongFormat: vi.fn(),
  };
  const host = { pendingLoad: () => pending, failPending: vi.fn() };
  const detection = new FailureDetection(reports, host, {
    workerFailureGraceMs: GRACE_MS,
  });
  detection.tileSources.register(
    TILE_LAYER_SOURCE,
    "rain",
    "https://t/{z}",
    "none",
  );
  detection.vectorSources.register(VECTOR_LAYER_SOURCE, "roads", VECTOR_TILES);
  const idle: { run?: () => void } = {};
  const map = {
    loaded: () => false,
    on: (_type: string, listener: () => void) => {
      idle.run = listener;
      return { unsubscribe: vi.fn() };
    },
  } as unknown as MapLibreMap;
  return { detection, reports, host, map, idle };
}

describe("FailureDetection.handleError", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a vector layer whose tiles cannot be read once the map settles, with no tileError", () => {
    const { detection, reports, map } = setUp();
    detection.handleError(
      engineError({
        error: UNREADABLE,
        tile: {},
        sourceId: VECTOR_LAYER_SOURCE,
      }),
      map,
    );
    expect(reports.tileError).not.toHaveBeenCalled();
    expect(reports.wrongFormat).not.toHaveBeenCalled();
    detection.settled();
    expect(reports.wrongFormat).toHaveBeenCalledExactlyOnceWith({
      layerId: "roads",
      tiles: VECTOR_TILES,
    });
    expect(reports.basemapUnavailable).not.toHaveBeenCalled();
  });

  it("does not report a vector layer that has loaded a tile", () => {
    const { detection, reports, map } = setUp();
    detection.tileLoaded({ tile: {}, sourceId: VECTOR_LAYER_SOURCE });
    detection.handleError(
      engineError({
        error: UNREADABLE,
        tile: {},
        sourceId: VECTOR_LAYER_SOURCE,
      }),
      map,
    );
    detection.settled();
    expect(reports.wrongFormat).not.toHaveBeenCalled();
  });

  it("leaves any other failure of a vector layer's tiles a tileError", () => {
    const { detection, reports, map } = setUp();
    detection.handleError(
      engineError({
        error: new Error("Failed to fetch"),
        tile: {},
        sourceId: VECTOR_LAYER_SOURCE,
      }),
      map,
    );
    detection.settled();
    expect(reports.tileError).toHaveBeenCalledOnce();
    expect(reports.wrongFormat).not.toHaveBeenCalled();
  });

  it("leaves an unreadable tile of the basemap a tileError", () => {
    const { detection, reports, map } = setUp();
    detection.handleError(
      engineError({ error: UNREADABLE, tile: {}, sourceId: "planet" }),
      map,
    );
    expect(reports.tileError).toHaveBeenCalledOnce();
    detection.settled();
    expect(reports.wrongFormat).not.toHaveBeenCalled();
  });

  it("makes a tile or source failure a tileError and counts it against the basemap", () => {
    const { detection, reports, host, map } = setUp();
    detection.styleLoaded(FAKE_RASTER_BASEMAP);
    detection.handleError(
      engineError({ error: new Error("tile"), tile: {}, sourceId: "planet" }),
      map,
    );
    expect(reports.tileError).toHaveBeenCalledOnce();
    expect(host.failPending).not.toHaveBeenCalled();
    detection.settled();
    expect(reports.basemapUnavailable).toHaveBeenCalledExactlyOnceWith(
      FAKE_RASTER_BASEMAP,
    );
  });

  it("leaves a tile layer's failure to the layer, and raises no tileError", () => {
    const { detection, reports, map } = setUp();
    detection.styleLoaded(FAKE_RASTER_BASEMAP);
    detection.handleError(
      engineError({
        error: new Error("tile"),
        tile: {},
        sourceId: TILE_LAYER_SOURCE,
      }),
      map,
    );
    expect(reports.tileError).not.toHaveBeenCalled();
    detection.settled();
    expect(reports.basemapUnavailable).not.toHaveBeenCalled();
  });

  it("fails a pending load whose style document has not loaded", () => {
    const pending = pendingLoad("style.load", false);
    const { detection, reports, host, map } = setUp(pending);
    const error = new Error("Style unreachable");
    detection.handleError({ error }, map);
    expect(host.failPending).toHaveBeenCalledExactlyOnceWith(pending, error);
    expect(reports.tileError).not.toHaveBeenCalled();
  });

  it("fails a pending mount on a worker error even after the style loaded", () => {
    const pending = pendingLoad("load", true);
    const { detection, reports, host, map } = setUp(pending);
    detection.handleError({ error: WORKER_ERROR }, map);
    expect(host.failPending).toHaveBeenCalledExactlyOnceWith(
      pending,
      WORKER_ERROR,
    );
    expect(reports.fatalError).not.toHaveBeenCalled();
  });

  it("calls a worker error on a loaded map fatal when the grace ends with the map not loaded", () => {
    const { detection, reports, host, map } = setUp(
      pendingLoad("style.load", true),
    );
    detection.handleError({ error: WORKER_ERROR }, map);
    expect(host.failPending).not.toHaveBeenCalled();
    vi.advanceTimersByTime(GRACE_MS);
    expect(reports.fatalError).toHaveBeenCalledOnce();
    expect(reports.fatalError.mock.calls[0]?.[0]).toMatchObject({
      reason: "stopped",
    });
    expect(reports.tileError).not.toHaveBeenCalled();
  });

  it("calls a worker error a tileError when the map goes idle meanwhile", () => {
    const { detection, reports, map, idle } = setUp();
    detection.handleError({ error: WORKER_ERROR }, map);
    idle.run?.();
    vi.advanceTimersByTime(GRACE_MS);
    expect(reports.tileError).toHaveBeenCalledOnce();
    expect(reports.fatalError).not.toHaveBeenCalled();
  });

  it("calls any other source-less error a tileError, with or without a pending load", () => {
    const first = setUp();
    first.detection.handleError({ error: new Error("sprite") }, first.map);
    expect(first.reports.tileError).toHaveBeenCalledOnce();
    const second = setUp(pendingLoad("style.load", true));
    second.detection.handleError({ error: new Error("glyph") }, second.map);
    expect(second.reports.tileError).toHaveBeenCalledOnce();
    expect(second.host.failPending).not.toHaveBeenCalled();
  });

  it("does not log; the caller logs before it asks", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { detection, map } = setUp();
    detection.handleError({ error: new Error("sprite") }, map);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
