import { describe, expect, it } from "vitest";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import {
  isFeedLayer,
  isHeatmapLayer,
  isQueryLayer,
  isRasterTileLayer,
  isShapeStyle,
  isVectorTileLayer,
  type LayerKind,
  layerKind,
  loadsFeatures,
} from "./definition";

describe("layerKind", () => {
  it.each<[string, Parameters<typeof layerKind>[0], LayerKind]>([
    ["a point feed", SAMPLE_FEED_LAYER, "points"],
    ["a categorised point feed", SAMPLE_ALERT_LAYER, "points"],
    ["a polygon feed", SAMPLE_AREA_LAYER, "shapes"],
    ["a query", SAMPLE_QUERY_LAYER, "points"],
    ["a heatmap", SAMPLE_HEATMAP_LAYER, "heatmap"],
    ["raster tiles", SAMPLE_TILE_LAYER, "tiles"],
    ["vector tiles", SAMPLE_VECTOR_LAYER, "vector"],
  ])("tells %s", (_name, definition, kind) => {
    expect(layerKind(definition)).toBe(kind);
  });
});

describe("layer guards", () => {
  it("separates layers that load features from layers the engine draws from tiles", () => {
    const loads = [
      SAMPLE_FEED_LAYER,
      SAMPLE_AREA_LAYER,
      SAMPLE_QUERY_LAYER,
      SAMPLE_HEATMAP_LAYER,
    ];
    for (const definition of loads) {
      expect(loadsFeatures(definition)).toBe(true);
    }
    expect(loadsFeatures(SAMPLE_TILE_LAYER)).toBe(false);
    expect(loadsFeatures(SAMPLE_VECTOR_LAYER)).toBe(false);
  });

  it("names the layers with cards, heatmaps, queries and tiles", () => {
    expect(isFeedLayer(SAMPLE_AREA_LAYER)).toBe(true);
    expect(isFeedLayer(SAMPLE_HEATMAP_LAYER)).toBe(false);
    expect(isHeatmapLayer(SAMPLE_HEATMAP_LAYER)).toBe(true);
    expect(isHeatmapLayer(SAMPLE_FEED_LAYER)).toBe(false);
    expect(isQueryLayer(SAMPLE_QUERY_LAYER)).toBe(true);
    expect(isQueryLayer(SAMPLE_FEED_LAYER)).toBe(false);
    expect(isQueryLayer(SAMPLE_TILE_LAYER)).toBe(false);
    expect(isRasterTileLayer(SAMPLE_TILE_LAYER)).toBe(true);
    expect(isRasterTileLayer(SAMPLE_VECTOR_LAYER)).toBe(false);
    expect(isVectorTileLayer(SAMPLE_VECTOR_LAYER)).toBe(true);
    expect(isVectorTileLayer(SAMPLE_TILE_LAYER)).toBe(false);
  });

  it("tells a shape style from a point style", () => {
    expect(isShapeStyle(SAMPLE_AREA_LAYER.style)).toBe(true);
    expect(isShapeStyle(SAMPLE_FEED_LAYER.style)).toBe(false);
  });
});
