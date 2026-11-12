// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
} from "../fakes/layerFixtures";
import {
  damagedDefinition,
  SAMPLE_DEFINITIONS,
} from "../propertyTesting/layerArbitraries";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { createDecoderRegistry } from "./decoders";
import { createFormatterRegistry } from "./formatters";
import { partitionDefinitions } from "./partitionDefinitions";

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("partitionDefinitions", () => {
  it("keeps valid definitions in order and skips nothing", () => {
    const result = partitionDefinitions(
      [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
      options,
    );
    expect(result.layers).toEqual([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]);
    expect(result.skipped).toEqual([]);
  });

  it("skips one bad definition among good ones and names its id and problems", () => {
    const bad = { ...SAMPLE_ALERT_LAYER, dataCost: "" };
    const result = partitionDefinitions(
      [SAMPLE_FEED_LAYER, bad, SAMPLE_TILE_LAYER],
      options,
    );
    expect(result.layers).toEqual([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.id).toBe(SAMPLE_ALERT_LAYER.id);
    expect(result.skipped[0]?.problems.join("\n")).toMatch(/dataCost/);
  });

  it("keeps the first of two definitions with the same id and skips the second", () => {
    const second = { ...SAMPLE_FEED_LAYER, name: "Another name" };
    const result = partitionDefinitions([SAMPLE_FEED_LAYER, second], options);
    expect(result.layers).toEqual([SAMPLE_FEED_LAYER]);
    expect(result.skipped).toEqual([
      { id: SAMPLE_FEED_LAYER.id, problems: ["id: duplicate"] },
    ]);
  });

  it("keeps a valid definition whose id an invalid earlier one had", () => {
    const invalid = { ...SAMPLE_FEED_LAYER, dataCost: "" };
    const result = partitionDefinitions([invalid, SAMPLE_FEED_LAYER], options);
    expect(result.layers).toEqual([SAMPLE_FEED_LAYER]);
    expect(result.skipped.map((entry) => entry.id)).toEqual([
      SAMPLE_FEED_LAYER.id,
    ]);
  });

  it("skips a value that is not an object, with no id", () => {
    const result = partitionDefinitions([null, 7, "text", []], options);
    expect(result.layers).toEqual([]);
    expect(result.skipped).toHaveLength(4);
    for (const entry of result.skipped) {
      expect(entry.id).toBeUndefined();
      expect(entry.problems.length).toBeGreaterThan(0);
    }
  });

  it("skips an object with no text id, with no id", () => {
    const result = partitionDefinitions(
      [{ ...SAMPLE_FEED_LAYER, id: 4 }],
      options,
    );
    expect(result.skipped[0]?.id).toBeUndefined();
  });

  it("does not change what it is given", () => {
    const input = [clone(SAMPLE_FEED_LAYER), { not: "a definition" }];
    const before = clone(input);
    partitionDefinitions(input, options);
    expect(input).toEqual(before);
  });

  describe("reusing the previous result", () => {
    it("keeps the old object for a definition that is deeply equal", () => {
      const first = partitionDefinitions([SAMPLE_FEED_LAYER], options);
      const second = partitionDefinitions(
        [clone(SAMPLE_FEED_LAYER)],
        options,
        first,
      );
      expect(second.layers[0]).toBe(first.layers[0]);
    });

    it("keeps the old list when every definition is reused, so a refresh that changes nothing redraws nothing", () => {
      const first = partitionDefinitions(
        [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
        options,
      );
      const second = partitionDefinitions(
        clone([SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER]),
        options,
        first,
      );
      expect(second.layers).toBe(first.layers);
    });

    it("keeps the old skipped list when it is the same", () => {
      const raw = [{ ...SAMPLE_FEED_LAYER, dataCost: "" }];
      const first = partitionDefinitions(raw, options);
      const second = partitionDefinitions(clone(raw), options, first);
      expect(second.skipped).toBe(first.skipped);
    });

    it("takes the new object for a definition that changed, and reuses the rest", () => {
      const first = partitionDefinitions(
        [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
        options,
      );
      const renamed = { ...clone(SAMPLE_FEED_LAYER), name: "Renamed" };
      const second = partitionDefinitions(
        [renamed, clone(SAMPLE_TILE_LAYER)],
        options,
        first,
      );
      expect(second.layers).not.toBe(first.layers);
      expect(second.layers[0]).toEqual(renamed);
      expect(second.layers[0]).not.toBe(first.layers[0]);
      expect(second.layers[1]).toBe(first.layers[1]);
    });

    it("takes a new list when a definition is added or removed", () => {
      const first = partitionDefinitions([SAMPLE_FEED_LAYER], options);
      const added = partitionDefinitions(
        [SAMPLE_FEED_LAYER, SAMPLE_TILE_LAYER],
        options,
        first,
      );
      expect(added.layers).not.toBe(first.layers);
      expect(added.layers[0]).toBe(first.layers[0]);
      expect(partitionDefinitions([], options, added).layers).toEqual([]);
    });
  });

  it("never throws, and every value is kept or skipped, for any list of JSON", () => {
    const values = fc.array(
      fc.oneof(
        fc.jsonValue(),
        damagedDefinition,
        fc.constantFrom(...SAMPLE_DEFINITIONS),
      ),
      { maxLength: 12 },
    );
    fc.assert(
      fc.property(values, (raw) => {
        const { layers, skipped } = partitionDefinitions(raw, options);
        expect(layers.length + skipped.length).toBe(raw.length);
        const ids = layers.map((layer) => layer.id);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
