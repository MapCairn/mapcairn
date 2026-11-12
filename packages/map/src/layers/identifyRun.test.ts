// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type IdentifiableLayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { describe, expect, it } from "vitest";
import {
  askableLayers,
  type IdentifiableLayer,
  type IdentifyAnswer,
  identifiableLayers,
  outcomeOf,
} from "./identifyRun";

const NOW = Date.UTC(2026, 10, 9, 12);

function layer(
  id: string,
  more: Partial<IdentifiableLayerDefinition> = {},
): IdentifiableLayer {
  const definition = { ...SAMPLE_IDENTIFY_LAYER, id, name: id, ...more };
  return {
    definition,
    controls: { period: "20" },
    tiles: `https://tiles.test/${id}`,
  };
}

describe("identifiableLayers", () => {
  it("lists the layers that are on and answer a tap, in catalogue order, with the tiles their controls give", () => {
    const other = { ...SAMPLE_IDENTIFY_LAYER, id: "other" };
    const found = identifiableLayers({
      definitions: [
        other,
        SAMPLE_FEED_LAYER,
        SAMPLE_TILE_LAYER,
        SAMPLE_IDENTIFY_LAYER,
      ],
      enabled: [SAMPLE_IDENTIFY_LAYER.id, "other", SAMPLE_FEED_LAYER.id],
      controls: { [SAMPLE_IDENTIFY_LAYER.id]: { period: "100" } },
      now: NOW,
    });
    expect(found.map(({ definition }) => definition.id)).toEqual([
      "other",
      "sample-flood",
    ]);
    expect(found[1]?.tiles).toBe(
      "https://tiles.test/flood/100/{z}/{y}/{x}.png",
    );
  });

  it("takes a layer with no controls entry as having none", () => {
    const [only] = identifiableLayers({
      definitions: [
        {
          ...SAMPLE_IDENTIFY_LAYER,
          controls: [],
          source: {
            ...SAMPLE_IDENTIFY_LAYER.source,
            tiles: "https://tiles.test/flood/{z}/{y}/{x}.png",
          },
        },
      ],
      enabled: [SAMPLE_IDENTIFY_LAYER.id],
      controls: {},
      now: NOW,
    });
    expect(only?.controls).toEqual({});
  });

  it("leaves out a layer that is off", () => {
    expect(
      identifiableLayers({
        definitions: [SAMPLE_IDENTIFY_LAYER],
        enabled: [],
        controls: {},
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("askableLayers", () => {
  const place = { lat: 10, lng: 20 };

  it("keeps a layer with no bounds, and one whose bounds hold the place, edges included", () => {
    const bounded = layer("bounded", {
      source: { ...SAMPLE_IDENTIFY_LAYER.source, bounds: [20, 10, 30, 40] },
    });
    expect(
      askableLayers([layer("open"), bounded], {}, place).map(
        ({ definition }) => definition.id,
      ),
    ).toEqual(["open", "bounded"]);
  });

  it.each([
    ["west", { lat: 10, lng: 19.9 }],
    ["south", { lat: 9.9, lng: 20 }],
    ["east", { lat: 10, lng: 30.1 }],
    ["north", { lat: 40.1, lng: 20 }],
  ])(
    "drops a layer whose bounds end short of the place on the %s",
    (_, outside) => {
      const bounded = layer("bounded", {
        source: { ...SAMPLE_IDENTIFY_LAYER.source, bounds: [20, 10, 30, 40] },
      });
      expect(askableLayers([bounded], {}, outside)).toEqual([]);
    },
  );

  it("drops a layer the map reported no tiles for", () => {
    expect(
      askableLayers(
        [layer("a"), layer("b")],
        { a: "https://tiles.test/a" },
        place,
      ).map(({ definition }) => definition.id),
    ).toEqual(["b"]);
  });
});

describe("outcomeOf", () => {
  const a = layer("a");
  const b = layer("b");
  const found = (
    from: IdentifiableLayer,
    ...ids: string[]
  ): IdentifyAnswer => ({
    kind: "found",
    layer: from,
    features: ids.map((id) => samplePoint(id)),
  });

  it("is null when every layer was cancelled", () => {
    expect(
      outcomeOf(
        [
          { kind: "cancelled", layer: a },
          { kind: "cancelled", layer: b },
        ],
        2,
      ),
    ).toBeNull();
  });

  it("stores what each layer that answered found, including nothing, and lists every feature in layer order", () => {
    const outcome = outcomeOf([found(a, "x", "y"), found(b)], 2);
    expect(Object.keys(outcome?.entries ?? {})).toEqual(["a", "b"]);
    expect(outcome?.entries.a?.tiles).toBe("https://tiles.test/a");
    expect(outcome?.entries.b?.features).toEqual([]);
    expect(outcome?.hits).toEqual([
      { layerId: "a", featureId: "x" },
      { layerId: "a", featureId: "y" },
    ]);
  });

  it("counts only the layers that answered or failed as asked, and a cancelled one is no longer available", () => {
    const outcome = outcomeOf(
      [
        found(a, "x"),
        { kind: "failed", layer: b },
        { kind: "cancelled", layer: layer("c") },
      ],
      5,
    );
    expect(outcome?.report).toEqual({
      found: 1,
      asked: 2,
      available: 4,
      failed: ["b"],
    });
    expect(Object.keys(outcome?.entries ?? {})).toEqual(["a"]);
  });
});
