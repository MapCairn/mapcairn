// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceCatalogueChange,
  createFormatterRegistry,
  defaultControlValues,
  FakeMessageCatalogue,
  type FeedLayerDefinition,
  formatMessage,
  type LayerDefinition,
  LayerError,
  type Message,
  type PointStyle,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { reconcile } from "./catalogueReconcile";
import { featureClass } from "./FeatureGlyph";
import { featureTitle } from "./featureTitle";
import { type IdentifyAnswer, outcomeOf } from "./identifyRun";
import { outcomeOfFailure, outcomeOfFeatures } from "./loadOutcome";
import { reportZoomLimits } from "./loadReport";
import { mapKeyBlocks } from "./mapKeyBlocks";

const scripted = new FakeMessageCatalogue({
  overrides: {
    "layer.earthquakes.name": "Aardbewings",
    "layer.earthquakes.emptyText": "Geen aardbewings nie.",
    "layer.gdacs.key.1": "Groen waarskuwing",
  },
});

/** A definition whose name and empty text are message keys. */
function keyed<T extends LayerDefinition>(definition: T): T {
  return { ...definition, name: "layer.earthquakes.name" };
}

const say = (message: Message) => formatMessage(scripted, message);

describe("definition text in pure helpers", () => {
  it("names a loaded layer in the language, from a key, and leaves a plain name alone", () => {
    const keyedOutcome = outcomeOfFeatures(keyed(SAMPLE_FEED_LAYER), [], 1);
    const plainOutcome = outcomeOfFeatures(SAMPLE_FEED_LAYER, [], 1);
    expect(say(keyedOutcome.spoken.message)).toBe(
      "Aardbewings: 0 shown on the map.",
    );
    expect(say(plainOutcome.spoken.message)).toBe(
      "Sample points: 0 shown on the map.",
    );
  });

  it("says a keyed layer's empty text and a failure in the language", () => {
    const layer: FeedLayerDefinition = {
      ...keyed(SAMPLE_FEED_LAYER),
      emptyText: "layer.earthquakes.emptyText",
    };
    const empty = outcomeOfFailure(layer, new LayerError("empty"), 1);
    expect(say(empty?.spoken.message as Message)).toBe(
      "Aardbewings: Geen aardbewings nie.",
    );
    const failure = outcomeOfFailure(layer, new LayerError("network"), 1);
    expect(say(failure?.spoken.message as Message)).toContain("Aardbewings");
  });

  it("names a layer that is out of its zoom window from a key", () => {
    const announce = vi.fn();
    reportZoomLimits(
      [
        {
          definition: keyed(SAMPLE_FEED_LAYER),
          limit: { kind: "zoom-in", level: 6 },
        },
      ],
      new Map(),
      announce,
    );
    expect(say(announce.mock.calls[0]?.[0] as Message)).toContain(
      "Aardbewings",
    );
  });

  it("names the layers that did not answer a tap, a keyed one in the language", () => {
    const identifiable = (definition: LayerDefinition) =>
      ({
        definition,
        controls: {},
        tiles: "https://tiles.test/{z}/{y}/{x}.png",
      }) as IdentifyAnswer["layer"];
    const outcome = outcomeOf(
      [
        { kind: "failed", layer: identifiable(keyed(SAMPLE_IDENTIFY_LAYER)) },
        {
          kind: "failed",
          layer: identifiable({
            ...SAMPLE_IDENTIFY_LAYER,
            id: "plain",
            name: "Plain",
          }),
        },
      ],
      2,
    );
    const text = say({
      key: "announce.layersDidNotAnswer",
      params: { names: outcome?.report.failed ?? [] },
    } as Message);
    expect(text).toContain("Aardbewings and Plain");
  });

  it("names a layer the catalogue dropped, from a key", () => {
    const result = reconcile({
      chosen: { enabled: [SAMPLE_FEED_LAYER.id], controls: {} },
      link: { waiting: [], controls: {} },
      known: [keyed(SAMPLE_FEED_LAYER)],
      next: [],
      now: 0,
    });
    const message = announceCatalogueChange({
      turnedOff: result.switchedOff.map(({ name }) => name),
      linkUnavailable: 0,
      skipped: 0,
      added: 0,
      removed: 0,
      empty: false,
    });
    expect(say(message as Message)).toContain("Aardbewings");
  });

  it("names a layer in the map key from a key, and reads keyed legend labels", () => {
    const layer: FeedLayerDefinition<PointStyle> = {
      ...keyed(SAMPLE_ALERT_LAYER),
      style: {
        colour: {
          kind: "fixed",
          colour: "blue",
          label: "layer.gdacs.key.1",
        },
      },
    };
    const [block] = mapKeyBlocks(
      [
        {
          definition: layer,
          enabled: true,
          controls: defaultControlValues(layer, 0),
          status: { kind: "on" },
          features: [],
          sortId: "",
          sorted: [],
        },
      ],
      scripted,
    );
    expect(block?.name).toBe("Aardbewings");
    expect(block?.entries[0].label).toBe("Groen waarskuwing");
  });

  it("falls back to a keyed layer's name for a card title, and keeps a plain one", () => {
    const formatters = createFormatterRegistry();
    const context = { now: 0, catalogue: scripted };
    const feature = samplePoint("a", { title: null });
    expect(
      featureTitle(keyed(SAMPLE_FEED_LAYER), feature, formatters, context),
    ).toBe("Aardbewings");
    expect(featureTitle(SAMPLE_FEED_LAYER, feature, formatters, context)).toBe(
      SAMPLE_FEED_LAYER.name,
    );
    const tile = keyed(SAMPLE_TILE_LAYER);
    expect(featureTitle(tile, feature, formatters, context)).toBe(
      "Aardbewings",
    );
  });

  it("reads a point style's class words in the language", () => {
    const layer: FeedLayerDefinition<PointStyle> = {
      ...SAMPLE_ALERT_LAYER,
      style: {
        colour: {
          kind: "category",
          field: "level",
          categories: [
            {
              value: "Green",
              label: "layer.gdacs.key.1",
              colour: "bluish-green",
            },
          ],
          other: { label: "Other", colour: "sky-blue" },
        },
      },
    };
    expect(featureClass(layer, { level: "Green" }, scripted)).toBe(
      "Groen waarskuwing",
    );
    expect(featureClass(layer, { level: "Purple" }, scripted)).toBe("Other");
  });
});
