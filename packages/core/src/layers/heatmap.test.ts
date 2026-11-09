import { describe, expect, it } from "vitest";
import {
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import {
  DEFAULT_HEATMAP_OPACITY,
  heatmapOpacity,
  heatmapSettings,
} from "./heatmap";

describe("heatmapSettings", () => {
  it("reads the radius and intensity from the controls the spec names", () => {
    expect(
      heatmapSettings(SAMPLE_HEATMAP_LAYER.heatmap, {
        radius: "32",
        intensity: "2.5",
      }),
    ).toEqual({ radius: 32, intensity: 2.5 });
  });

  it("uses fixed numbers as written", () => {
    const [, , events] = SAMPLE_VECTOR_LAYER.sourceLayers;
    expect(
      heatmapSettings(
        (events as { heatmap: typeof SAMPLE_HEATMAP_LAYER.heatmap }).heatmap,
        {},
      ),
    ).toEqual({ radius: 16, intensity: 1 });
  });

  it("falls back to the middle of the allowed range for a control with no usable value", () => {
    const settings = heatmapSettings(SAMPLE_HEATMAP_LAYER.heatmap, {
      radius: "wide",
    });
    expect(settings.radius).toBe(20);
    expect(settings.intensity).toBe(1);
  });
});

describe("heatmapOpacity", () => {
  it("reads the layer's opacity control", () => {
    expect(heatmapOpacity(SAMPLE_HEATMAP_LAYER, { opacity: "0.5" })).toBe(0.5);
  });

  it("uses the default when there is no opacity control or no usable value", () => {
    expect(heatmapOpacity(SAMPLE_VECTOR_LAYER, {})).toBe(
      DEFAULT_HEATMAP_OPACITY,
    );
    expect(heatmapOpacity(SAMPLE_TILE_LAYER, { opacity: "x" })).toBe(
      DEFAULT_HEATMAP_OPACITY,
    );
  });
});
