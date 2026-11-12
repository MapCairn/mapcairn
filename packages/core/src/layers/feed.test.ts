// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_LINE_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "../fakes/layerFixtures";
import { LayerError } from "../ports/errors";
import {
  createDecoderRegistry,
  type Decoder,
  geojsonDecoder,
} from "./decoders";
import { decodeDetail, decodeFeed, detailUrl, feedUrl, tileUrl } from "./feed";
import { matchesFilter } from "./filter";

const NOW = Date.UTC(2026, 10, 9, 8, 30);

function point(
  id: string,
  properties: Record<string, unknown>,
  coordinates: unknown = [18.4, -33.9, 12],
) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates },
    properties,
  };
}

describe("geojsonDecoder", () => {
  const fields = SAMPLE_FEED_LAYER.source.fields;

  it("maps each field by its dotted path and keeps the point position", () => {
    const [feature] = geojsonDecoder(
      {
        type: "FeatureCollection",
        features: [
          point("a", { title: "Alpha", value: 4.2, time: 1, kind: "keep" }),
        ],
      },
      fields,
    );
    expect(feature).toEqual({
      id: "a",
      geometry: { type: "Point", coordinates: [18.4, -33.9] },
      fields: {
        id: "a",
        title: "Alpha",
        value: 4.2,
        time: 1,
        kind: "keep",
        depth: 12,
        url: null,
      },
    });
  });

  it("turns objects and arrays into null, so only plain values reach the ui", () => {
    const [feature] = geojsonDecoder(
      {
        features: [point("a", { title: { nested: true }, value: [1] })],
      },
      fields,
    );
    expect(feature?.fields.title).toBeNull();
    expect(feature?.fields.value).toBeNull();
  });

  it("uses the position in the list when a feature has no id", () => {
    const features = geojsonDecoder(
      { features: [point("", {}), { ...point("", {}), id: undefined }] },
      { id: "missing", title: "properties.title" },
    );
    expect(features.map((f) => f.id)).toEqual(["0", "1"]);
  });

  it("keeps lines and polygons, dropping any third coordinate", () => {
    const features = geojsonDecoder(
      {
        features: [
          {
            id: "l",
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0, 5],
                [1, 1],
              ],
            },
          },
          {
            id: "m",
            geometry: {
              type: "MultiPolygon",
              coordinates: [
                [
                  [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 0],
                  ],
                ],
              ],
            },
          },
        ],
      },
      { id: "id", title: "id" },
    );
    expect(features.map((f) => f.geometry)).toEqual([
      {
        type: "LineString",
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      },
      {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      },
    ]);
  });

  it("skips features with no geometry, an unknown type or bad coordinates", () => {
    const features = geojsonDecoder(
      {
        features: [
          { id: "none", geometry: null },
          { id: "type", geometry: { type: "Circle", coordinates: [0, 0] } },
          point("text", {}, ["a", "b"]),
          point("range", {}, [200, 10]),
          point("short", {}, [1]),
          "not a feature",
          point("ok", {}),
        ],
      },
      { id: "id", title: "id" },
    );
    expect(features.map((f) => f.id)).toEqual(["ok"]);
  });

  it("throws when the document has no feature list", () => {
    expect(() => geojsonDecoder({ type: "Nope" }, fields)).toThrow();
    expect(() => geojsonDecoder("text", fields)).toThrow();
  });
});

describe("createDecoderRegistry", () => {
  it("has the geojson decoder built in", () => {
    expect(createDecoderRegistry().get("geojson")).toBe(geojsonDecoder);
    expect(createDecoderRegistry().names()).toEqual(["geojson"]);
  });

  it("adds decoders by name, so a new format is one module", () => {
    const csv: Decoder = () => [];
    const registry = createDecoderRegistry({ csv });
    expect(registry.get("csv")).toBe(csv);
    expect(registry.has("geojson")).toBe(true);
  });
});

describe("matchesFilter", () => {
  it("keeps a feature whose field is one of the listed values", () => {
    const feature = samplePoint("a", { kind: "keep", code: 3 });
    expect(matchesFilter(feature, { field: "kind", in: ["keep"] })).toBe(true);
    expect(matchesFilter(feature, { field: "code", in: [3] })).toBe(true);
    expect(matchesFilter(feature, { field: "kind", in: ["drop"] })).toBe(false);
    expect(matchesFilter(feature, { field: "missing", in: ["x"] })).toBe(false);
  });
});

describe("decodeFeed", () => {
  const decoders = createDecoderRegistry();
  const doc = {
    features: [
      point("a", { title: "Alpha", kind: "keep" }),
      point("b", { title: "Beta", kind: "drop" }),
      {
        id: "c",
        geometry: {
          type: "LineString",
          coordinates: [
            [0, 0],
            [1, 1],
          ],
        },
        properties: { kind: "keep" },
      },
    ],
  };

  it("decodes, filters and keeps only points", () => {
    const features = decodeFeed(SAMPLE_FEED_LAYER, doc, decoders);
    expect(features.map((f) => f.id)).toEqual(["a"]);
  });

  it("rejects with an empty error when nothing is left", () => {
    expect(() =>
      decodeFeed(SAMPLE_FEED_LAYER, { features: [] }, decoders),
    ).toThrow(expect.objectContaining({ kind: "empty" }));
  });

  it("keeps only polygons for an area style, and only lines for a line style", () => {
    const polygon = {
      id: "p",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      properties: { name: "Square" },
    };
    const mixed = { features: [point("a", {}), polygon, doc.features[2]] };
    expect(
      decodeFeed(SAMPLE_AREA_LAYER, mixed, decoders).map((f) => f.id),
    ).toEqual(["p"]);
    expect(
      decodeFeed(SAMPLE_LINE_LAYER, mixed, decoders).map((f) => f.id),
    ).toEqual(["c"]);
    expect(() =>
      decodeFeed(SAMPLE_AREA_LAYER, { features: [point("a", {})] }, decoders),
    ).toThrow(expect.objectContaining({ kind: "empty" }));
  });

  it("rejects with an invalid error when the decoder throws", () => {
    expect(() => decodeFeed(SAMPLE_FEED_LAYER, {}, decoders)).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
  });

  it("rejects with an invalid error when its decoder is not registered", () => {
    expect(() =>
      decodeFeed(
        SAMPLE_FEED_LAYER,
        doc,
        createDecoderRegistry().without("geojson"),
      ),
    ).toThrow(LayerError);
  });

  it("rejects a tile layer, which has no feed", () => {
    expect(() => decodeFeed(SAMPLE_TILE_LAYER, doc, decoders)).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
  });
});

describe("decodeDetail", () => {
  const decoders = createDecoderRegistry();

  it("keeps lines and polygons and drops points", () => {
    const shapes = decodeDetail(
      SAMPLE_ALERT_LAYER,
      {
        features: [
          point("centre", {}),
          {
            id: "track",
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [1, 1],
              ],
            },
          },
        ],
      },
      decoders,
    );
    expect(shapes.map((s) => s.id)).toEqual(["track"]);
  });

  it("rejects when there is no shape, or the layer has no detail", () => {
    expect(() =>
      decodeDetail(SAMPLE_ALERT_LAYER, { features: [] }, decoders),
    ).toThrow(expect.objectContaining({ kind: "empty" }));
    expect(() =>
      decodeDetail(SAMPLE_FEED_LAYER, { features: [] }, decoders),
    ).toThrow(expect.objectContaining({ kind: "invalid" }));
    expect(() => decodeDetail(SAMPLE_ALERT_LAYER, 5, decoders)).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
  });
});

describe("URLs", () => {
  it("feedUrl fills the feed template from control values", () => {
    expect(
      feedUrl(SAMPLE_FEED_LAYER, { window: "day", small: "true" }, NOW),
    ).toBe("https://sample.test/feed/all_day.json");
  });

  it("feedUrl and tileUrl resolve missing controls to their defaults", () => {
    expect(feedUrl(SAMPLE_FEED_LAYER, {}, NOW)).toBe(
      "https://sample.test/feed/big_day.json",
    );
    expect(tileUrl(SAMPLE_TILE_LAYER, {}, NOW)).toBe(
      "https://tiles.test/2026-11-08/{z}/{y}/{x}.jpg",
    );
  });

  it("feedUrl and tileUrl refuse the other kind of layer", () => {
    expect(() => feedUrl(SAMPLE_TILE_LAYER, {}, NOW)).toThrow();
    expect(() => tileUrl(SAMPLE_FEED_LAYER, {}, NOW)).toThrow();
  });

  describe("detailUrl", () => {
    const withArea = (area: unknown) =>
      samplePoint("a", { area: area as string });

    it("returns the feature's detail URL when its origin is declared", () => {
      expect(
        detailUrl(SAMPLE_ALERT_LAYER, withArea("https://alerts.test/g?id=1")),
      ).toBe("https://alerts.test/g?id=1");
    });

    it("refuses other origins, plain http, odd text and layers with no detail", () => {
      expect(
        detailUrl(SAMPLE_ALERT_LAYER, withArea("https://evil.test/g")),
      ).toBeNull();
      expect(
        detailUrl(SAMPLE_ALERT_LAYER, withArea("http://alerts.test/g")),
      ).toBeNull();
      expect(detailUrl(SAMPLE_ALERT_LAYER, withArea("not a url"))).toBeNull();
      expect(detailUrl(SAMPLE_ALERT_LAYER, withArea(null))).toBeNull();
      expect(
        detailUrl(SAMPLE_FEED_LAYER, withArea("https://alerts.test/g")),
      ).toBeNull();
    });
  });
});
