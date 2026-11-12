// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { FeedLayerDefinition } from "../layers/definition";
import { LayerError } from "../ports/errors";
import type { LayerFeature, LayerSource } from "../ports/layers";

/**
 * The feed layer every layer source is checked with: the `geojson` decoder,
 * an id and a title field, and an on-demand detail on its own origin.
 */
export const CONTRACT_LAYER: FeedLayerDefinition = {
  id: "contract-points",
  name: "Contract points",
  description: "Points for the layer source contract.",
  group: "Contract",
  dataCost: "about 1 KB",
  attribution: [{ text: "Contract provider" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://contract.test/points.json",
    decoder: "geojson",
    fields: { id: "id", title: "properties.title", area: "properties.area" },
  },
  style: { colour: { kind: "fixed", colour: "blue", label: "Point" } },
  card: { title: "{title}", lines: [] },
  list: {
    secondary: "{title}",
    sorts: [{ id: "title", label: "Title", field: "title", direction: "asc" }],
  },
  detail: {
    urlField: "area",
    origins: ["https://contract.test"],
    decoder: "geojson",
    colour: "vermillion",
    label: "Show area",
    dataCost: "about 1 KB",
  },
  emptyText: "No contract points.",
};

/** A point the contract asks a source to return. */
export interface ContractPoint {
  readonly id: string;
  readonly title: string;
  readonly lng: number;
  readonly lat: number;
}

/** What the layer source contract needs besides the source itself. */
export interface LayerSourceControls {
  /** Makes the next loads of {@link CONTRACT_LAYER} return these points. */
  respondWith(points: readonly ContractPoint[]): void;
  /** Makes the next detail loads return one line from the first to the second position. */
  respondWithDetailLine(
    from: readonly [number, number],
    to: readonly [number, number],
  ): void;
  /** Makes the next loads fail the way a source fails for that kind. */
  failWith(kind: "network" | "invalid"): void;
  /** Makes the next loads wait until the returned function is called. */
  hold(): () => void;
}

/** One layer source under test, with its controls. */
export interface LayerSourceSubject {
  readonly source: LayerSource;
  readonly controls: LayerSourceControls;
}

const NOW = Date.UTC(2026, 10, 9);

const POINTS: readonly ContractPoint[] = [
  { id: "a", title: "Alpha", lng: 18.4, lat: -33.9 },
  { id: "b", title: "Beta", lng: 28.0, lat: -26.2 },
];

function feature(area: string): LayerFeature {
  return {
    id: "a",
    geometry: { type: "Point", coordinates: [18.4, -33.9] },
    fields: { id: "a", title: "Alpha", area },
  };
}

async function rejection(promise: Promise<unknown>): Promise<LayerError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LayerError);
    return error as LayerError;
  }
  throw new Error("Expected the load to fail.");
}

/**
 * Runs the shared behavioural suite for a {@link LayerSource}. Every test
 * calls `create` for a fresh subject.
 */
export function runLayerSourceContract(
  name: string,
  create: () => LayerSourceSubject,
): void {
  describe(`LayerSource contract: ${name}`, () => {
    const request = (signal?: AbortSignal) => ({
      definition: CONTRACT_LAYER,
      controls: {},
      now: NOW,
      ...(signal ? { signal } : {}),
    });

    it("loads decoded point features with their ids and fields", async () => {
      const { source, controls } = create();
      controls.respondWith(POINTS);
      const features = await source.load(request());
      expect(features.map((f) => f.id)).toEqual(["a", "b"]);
      expect(features[0]?.geometry).toEqual({
        type: "Point",
        coordinates: [18.4, -33.9],
      });
      expect(features[1]?.fields.title).toBe("Beta");
    });

    it("rejects with empty when there are no features", async () => {
      const { source, controls } = create();
      controls.respondWith([]);
      expect((await rejection(source.load(request()))).kind).toBe("empty");
    });

    it("rejects with network when the request fails", async () => {
      const { source, controls } = create();
      controls.failWith("network");
      expect((await rejection(source.load(request()))).kind).toBe("network");
    });

    it("rejects with invalid when the response cannot be decoded", async () => {
      const { source, controls } = create();
      controls.failWith("invalid");
      expect((await rejection(source.load(request()))).kind).toBe("invalid");
    });

    it("rejects with aborted when the signal has already fired", async () => {
      const { source, controls } = create();
      controls.respondWith(POINTS);
      const error = await rejection(source.load(request(AbortSignal.abort())));
      expect(error.kind).toBe("aborted");
    });

    it("rejects with aborted when the signal fires while loading", async () => {
      const { source, controls } = create();
      controls.respondWith(POINTS);
      const release = controls.hold();
      const controller = new AbortController();
      const loading = source.load(request(controller.signal));
      controller.abort();
      release();
      expect((await rejection(loading)).kind).toBe("aborted");
    });

    it("loads a feature's detail shapes from its declared origin", async () => {
      const { source, controls } = create();
      controls.respondWithDetailLine([0, 0], [1, 1]);
      const shapes = await source.loadDetail({
        definition: CONTRACT_LAYER,
        feature: feature("https://contract.test/area?id=a"),
      });
      expect(shapes.map((shape) => shape.geometry)).toEqual([
        {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
      ]);
    });

    it("refuses a detail URL on an origin the definition does not declare", async () => {
      const { source, controls } = create();
      controls.respondWithDetailLine([0, 0], [1, 1]);
      const error = await rejection(
        source.loadDetail({
          definition: CONTRACT_LAYER,
          feature: feature("https://elsewhere.test/area"),
        }),
      );
      expect(error.kind).toBe("invalid");
    });
  });
}
