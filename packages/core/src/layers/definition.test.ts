// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_QUERY_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import {
  cardOf,
  isFeedLayer,
  isHeatmapLayer,
  isIdentifiable,
  isQueryLayer,
  isRasterTileLayer,
  isShapeStyle,
  isVectorTileLayer,
  loadsFeatures,
} from "./definition";

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
    expect(isVectorTileLayer(SAMPLE_VECTOR_LAYER)).toBe(true);
    expect(isVectorTileLayer(SAMPLE_TILE_LAYER)).toBe(false);
  });

  it("names the raster tile layers, and no other kind", () => {
    expect(isRasterTileLayer(SAMPLE_TILE_LAYER)).toBe(true);
    expect(isRasterTileLayer(SAMPLE_VECTOR_LAYER)).toBe(false);
    expect(isRasterTileLayer(SAMPLE_FEED_LAYER)).toBe(false);
    expect(isRasterTileLayer(SAMPLE_HEATMAP_LAYER)).toBe(false);
  });

  it("tells a shape style from a point style", () => {
    expect(isShapeStyle(SAMPLE_AREA_LAYER.style)).toBe(true);
    expect(isShapeStyle(SAMPLE_FEED_LAYER.style)).toBe(false);
  });
});

describe("a tile layer with an identify block", () => {
  it("is still a raster tile layer, and is not read as a feed", () => {
    expect(isRasterTileLayer(SAMPLE_IDENTIFY_LAYER)).toBe(true);
    expect(isFeedLayer(SAMPLE_IDENTIFY_LAYER)).toBe(false);
    expect(loadsFeatures(SAMPLE_IDENTIFY_LAYER)).toBe(false);
    expect(isHeatmapLayer(SAMPLE_IDENTIFY_LAYER)).toBe(false);
    expect(isQueryLayer(SAMPLE_IDENTIFY_LAYER)).toBe(false);
  });

  it("is told from a layer that answers no tap", () => {
    expect(isIdentifiable(SAMPLE_IDENTIFY_LAYER)).toBe(true);
    expect(isIdentifiable(SAMPLE_TILE_LAYER)).toBe(false);
    expect(isIdentifiable(SAMPLE_VECTOR_LAYER)).toBe(false);
    expect(isIdentifiable(SAMPLE_FEED_LAYER)).toBe(false);
    expect(isIdentifiable(SAMPLE_HEATMAP_LAYER)).toBe(false);
  });
});

describe("cardOf", () => {
  it("gives a feed layer's card", () => {
    expect(cardOf(SAMPLE_FEED_LAYER)).toBe(SAMPLE_FEED_LAYER.card);
  });

  it("gives an identifiable layer's nested card", () => {
    expect(cardOf(SAMPLE_IDENTIFY_LAYER)).toBe(
      SAMPLE_IDENTIFY_LAYER.identify.card,
    );
  });
});
