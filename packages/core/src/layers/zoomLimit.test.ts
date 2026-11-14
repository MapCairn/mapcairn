// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  SAMPLE_FEED_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import type {
  FeedLayerDefinition,
  PointStyle,
  QuerySource,
  VectorTileLayerDefinition,
} from "./definition";
import { hasZoomWindow, layerZoomLimit } from "./zoomLimit";

function queryWithMinzoom(
  minzoom: number | undefined,
): FeedLayerDefinition<PointStyle> {
  const { minzoom: _dropped, ...rest } =
    SAMPLE_QUERY_LAYER.source as QuerySource;
  return {
    ...SAMPLE_QUERY_LAYER,
    source: minzoom === undefined ? rest : { ...rest, minzoom },
  };
}

function vectorWindow(window: {
  minzoom?: number;
  maxzoom?: number;
}): VectorTileLayerDefinition {
  const { minzoom: _min, maxzoom: _max, ...rest } = SAMPLE_VECTOR_LAYER;
  return { ...rest, ...window };
}

describe("layerZoomLimit", () => {
  it("tells a query layer below its minzoom to zoom in to that level", () => {
    expect(layerZoomLimit(queryWithMinzoom(9), 8.9)).toEqual({
      kind: "zoom-in",
      level: 9,
    });
  });

  it("has no limit for a query layer at or above its minzoom", () => {
    expect(layerZoomLimit(queryWithMinzoom(9), 9)).toBeNull();
    expect(layerZoomLimit(queryWithMinzoom(9), 14)).toBeNull();
  });

  it("has no limit for a query layer without a minzoom, however far out", () => {
    expect(layerZoomLimit(queryWithMinzoom(undefined), 0)).toBeNull();
  });

  it("tells a vector tile layer outside its window which way to zoom", () => {
    const layer = vectorWindow({ minzoom: 3, maxzoom: 12 });
    expect(layerZoomLimit(layer, 2)).toEqual({ kind: "zoom-in", level: 3 });
    expect(layerZoomLimit(layer, 12.5)).toEqual({
      kind: "zoom-out",
      level: 12,
    });
    expect(layerZoomLimit(layer, 3)).toBeNull();
    expect(layerZoomLimit(layer, 12)).toBeNull();
  });

  it("reads only the sides of the window the layer has", () => {
    expect(layerZoomLimit(vectorWindow({ maxzoom: 12 }), 0)).toBeNull();
    expect(layerZoomLimit(vectorWindow({ minzoom: 3 }), 20)).toBeNull();
    expect(layerZoomLimit(vectorWindow({ maxzoom: 12 }), 13)).toEqual({
      kind: "zoom-out",
      level: 12,
    });
  });

  it("has no limit for a vector tile layer without a window, whatever its tile levels", () => {
    const layer = vectorWindow({});
    expect(layerZoomLimit(layer, 0)).toBeNull();
    expect(layerZoomLimit(layer, 24)).toBeNull();
  });

  it("has no limit for layers that have no zoom window of their own", () => {
    // A raster tile source's maxzoom is the deepest tile level the service
    // has, which the engine scales beyond, so it is not a window.
    expect(SAMPLE_TILE_LAYER.source.kind).toBe("tiles");
    expect(layerZoomLimit(SAMPLE_TILE_LAYER, 24)).toBeNull();
    expect(layerZoomLimit(SAMPLE_FEED_LAYER, 0)).toBeNull();
  });
});

describe("hasZoomWindow", () => {
  it("is true for a query layer with a minzoom and a vector tile layer with either side", () => {
    expect(hasZoomWindow(queryWithMinzoom(9))).toBe(true);
    expect(hasZoomWindow(vectorWindow({ minzoom: 3 }))).toBe(true);
    expect(hasZoomWindow(vectorWindow({ maxzoom: 12 }))).toBe(true);
  });

  it("is false for layers whose definition has no window", () => {
    expect(hasZoomWindow(queryWithMinzoom(undefined))).toBe(false);
    expect(hasZoomWindow(vectorWindow({}))).toBe(false);
    expect(hasZoomWindow(SAMPLE_TILE_LAYER)).toBe(false);
    expect(hasZoomWindow(SAMPLE_FEED_LAYER)).toBe(false);
  });
});
