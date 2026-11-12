// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFormatterRegistry,
  type FeedLayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import { featureTitle } from "./featureTitle";

const formatters = createFormatterRegistry();
const context = { now: Date.UTC(2026, 10, 12, 12) };

describe("featureTitle", () => {
  it("fills the card's title template from the feature's fields", () => {
    const feature = samplePoint("a", { title: "Gauge 4" });
    expect(featureTitle(SAMPLE_FEED_LAYER, feature, formatters, context)).toBe(
      "Gauge 4",
    );
  });

  it("uses the formatters the template names", () => {
    const layer: FeedLayerDefinition = {
      ...SAMPLE_FEED_LAYER,
      card: {
        ...SAMPLE_FEED_LAYER.card,
        title: "{title|upper} ({value|number})",
      },
    };
    const withUpper = createFormatterRegistry({
      upper: (value) => String(value).toUpperCase(),
    });
    const feature = samplePoint("a", { title: "gauge", value: 1200 });
    expect(featureTitle(layer, feature, withUpper, context)).toBe(
      "GAUGE (1,200)",
    );
  });

  it("falls back to the layer's name when the template fills to nothing", () => {
    const feature = samplePoint("a", { title: null });
    expect(featureTitle(SAMPLE_FEED_LAYER, feature, formatters, context)).toBe(
      SAMPLE_FEED_LAYER.name,
    );
  });

  it("uses the layer's name for a layer with no card", () => {
    const feature = samplePoint("a");
    expect(featureTitle(SAMPLE_TILE_LAYER, feature, formatters, context)).toBe(
      SAMPLE_TILE_LAYER.name,
    );
  });
});
