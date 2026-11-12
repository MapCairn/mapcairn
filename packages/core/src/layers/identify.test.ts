// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import {
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TIME_LAYER,
} from "../fakes/layerFixtures";
import { GeometryError } from "../geometry/errors";
import { wgs84ToWebMercator } from "../geometry/mercator";
import * as entry from "../index";
import { LayerError } from "../ports/errors";
import type { IdentifyTarget } from "../ports/layers";
import { failureOf } from "../propertyTesting/failureOf";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";
import {
  createDecoderRegistry,
  type Decoder,
  geojsonDecoder,
} from "./decoders";
import type { IdentifiableLayerDefinition } from "./definition";
import { tileUrl } from "./feed";
import {
  DEFAULT_IDENTIFY_TOLERANCE_PX,
  decodeIdentify,
  IDENTIFY_VARIABLES,
  identifyRequestUrl,
  identifyUrl,
  MAX_IDENTIFIED_FEATURES,
} from "./identify";

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

const CAPE_TOWN: IdentifyTarget = {
  latlng: { lat: -33.9249, lng: 18.4241 },
  zoom: 10,
};

/** The sample layer with its identify block changed. */
function identifying(
  change: Partial<IdentifiableLayerDefinition["identify"]>,
): IdentifiableLayerDefinition {
  return {
    ...SAMPLE_IDENTIFY_LAYER,
    identify: { ...SAMPLE_IDENTIFY_LAYER.identify, ...change },
  };
}

/** The box a request asked for, as `[minx, miny, maxx, maxy]`. */
function boxOf(url: string): number[] {
  const bbox = new URL(url).searchParams.get("bbox") as string;
  return bbox.split(",").map(Number);
}

describe("the package entry point", () => {
  it("exports what a layer source needs to ask and read an identify request", () => {
    expect(entry.identifyUrl).toBe(identifyUrl);
    expect(entry.identifyRequestUrl).toBe(identifyRequestUrl);
    expect(entry.decodeIdentify).toBe(decodeIdentify);
    expect(entry.decodeWith).toBeTypeOf("function");
    expect(entry.IDENTIFY_VARIABLES).toBe(IDENTIFY_VARIABLES);
    expect(entry.DEFAULT_IDENTIFY_TOLERANCE_PX).toBe(12);
    expect(entry.MIN_IDENTIFY_TOLERANCE_PX).toBe(1);
    expect(entry.MAX_IDENTIFY_TOLERANCE_PX).toBe(20);
    expect(entry.MAX_IDENTIFIED_FEATURES).toBe(MAX_IDENTIFIED_FEATURES);
  });
});

describe("identifyUrl", () => {
  it("asks for a 25 pixel box around the tap at the default tolerance, pinned to the exact URL", () => {
    expect(DEFAULT_IDENTIFY_TOLERANCE_PX).toBe(12);
    expect(identifyUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, CAPE_TOWN)).toBe(
      "https://api.test/identify/20?bbox=2049050.505%2C-4020633.309%2C2052872.356%2C-4016811.457&width=25&height=25&i=12&j=12",
    );
  });

  it("fills the layer's controls, so the identify URL follows the tiles", () => {
    expect(
      identifyUrl(SAMPLE_IDENTIFY_LAYER, { period: "100" }, NOW, CAPE_TOWN),
    ).toContain("/identify/100?");
  });

  it("uses the layer's own tolerance for the size of the box and the pixel in it", () => {
    const url = identifyUrl(identifying({ tolerance: 3 }), {}, NOW, CAPE_TOWN);
    expect(url).toContain("&width=7&height=7&i=3&j=3");
    const [minx, , maxx] = boxOf(url);
    expect((maxx as number) - (minx as number)).toBeCloseTo(
      (7 * 156_543.033_928_040_97) / 2 ** 10,
      2,
    );
  });

  it("fills longitude, latitude and the normalised zoom as written", () => {
    const url = identifyUrl(
      identifying({
        url: "https://api.test/at?lng={lng}&lat={lat}&zoom={zoom}",
      }),
      {},
      NOW,
      { ...CAPE_TOWN, zoom: 10.5 },
    );
    expect(url).toBe("https://api.test/at?lng=18.4241&lat=-33.9249&zoom=10.5");
  });

  it("does not clamp the box at the edge of the world", () => {
    const url = identifyUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, {
      latlng: { lat: 0, lng: 179.9999 },
      zoom: 10,
    });
    const [, , maxx] = boxOf(url);
    expect(maxx).toBeGreaterThan(20_037_508);
  });

  it("centres the box on the clamped latitude near a pole while {lat} stays as tapped", () => {
    const target = { latlng: { lat: 89, lng: 0 }, zoom: 10 };
    const [, miny, , maxy] = boxOf(
      identifyUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, target),
    );
    const clamped = wgs84ToWebMercator({ lat: MAX_MERCATOR_LATITUDE, lng: 0 });
    expect(((miny as number) + (maxy as number)) / 2).toBeCloseTo(clamped.y, 2);
    expect(
      identifyUrl(
        identifying({ url: "https://api.test/at?lat={lat}&lng={lng}" }),
        {},
        NOW,
        target,
      ),
    ).toBe("https://api.test/at?lat=89&lng=0");
  });

  it("writes a degree that rounds to nothing as 0, never as -0 or with trailing zeros", () => {
    const url = identifyUrl(
      identifying({ url: "https://api.test/at?lng={lng}&lat={lat}" }),
      {},
      NOW,
      { latlng: { lat: 0.000_001, lng: -0.000_000_4 }, zoom: 3 },
    );
    expect(url).toBe("https://api.test/at?lng=0&lat=0.000001");
    expect(
      identifyUrl(
        identifying({ url: "https://api.test/at?lng={lng}&zoom={zoom}" }),
        {},
        NOW,
        { latlng: { lat: 1, lng: 10.5 }, zoom: 4 },
      ),
    ).toBe("https://api.test/at?lng=10.5&zoom=4");
  });

  it.each([
    [
      "a coordinate that is not a number",
      { latlng: { lat: Number.NaN, lng: 1 }, zoom: 5 },
    ],
    [
      "a longitude that is infinite",
      { latlng: { lat: 1, lng: Number.POSITIVE_INFINITY }, zoom: 5 },
    ],
    [
      "a latitude that is infinite",
      { latlng: { lat: Number.NEGATIVE_INFINITY, lng: 1 }, zoom: 5 },
    ],
    [
      "a zoom that is not a number",
      { latlng: { lat: 1, lng: 1 }, zoom: Number.NaN },
    ],
    [
      "a zoom that is infinite",
      { latlng: { lat: 1, lng: 1 }, zoom: Number.POSITIVE_INFINITY },
    ],
  ])("throws a geometry error for %s", (_name, at) => {
    expect(
      failureOf(GeometryError, () =>
        identifyUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, at),
      )?.kind,
    ).toBe("invalid");
  });

  it("fills a date and time control with its ISO instant, encoded", () => {
    const layer: IdentifiableLayerDefinition = {
      ...SAMPLE_TIME_LAYER,
      identify: {
        ...SAMPLE_IDENTIFY_LAYER.identify,
        url: "https://api.test/at?time={time}&lng={lng}&lat={lat}",
      },
    };
    expect(
      identifyUrl(layer, { time: "2026-11-12t0400" }, NOW, CAPE_TOWN),
    ).toBe(
      "https://api.test/at?time=2026-11-12T04%3A00%3A00Z&lng=18.4241&lat=-33.9249",
    );
  });

  it("names the variables an identify URL may use", () => {
    expect(IDENTIFY_VARIABLES).toEqual([
      "lng",
      "lat",
      "bbox",
      "width",
      "height",
      "x",
      "y",
      "zoom",
    ]);
  });

  it("leaves {x} and {y} in the same layer's tile URL for the engine", () => {
    expect(tileUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW)).toBe(
      "https://tiles.test/flood/20/{z}/{y}/{x}.png",
    );
  });
});

const decoders = createDecoderRegistry();

const AT: IdentifyTarget = { latlng: { lat: -33.9, lng: 18.4 }, zoom: 12 };

function collection(...features: unknown[]): unknown {
  return { type: "FeatureCollection", features };
}

function pointFeature(id: unknown, name: string, depth: number): unknown {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [18.5, -33.8] },
    properties: { name, depth },
  };
}

function decode(raw: unknown, definition = SAMPLE_IDENTIFY_LAYER) {
  return decodeIdentify(definition, raw, decoders, AT);
}

describe("decodeIdentify", () => {
  it("decodes GeoJSON features with the fields the definition maps", () => {
    expect(decode(collection(pointFeature("a", "Cell A", 1.5)))).toEqual([
      {
        id: "a",
        geometry: { type: "Point", coordinates: [18.5, -33.8] },
        fields: { id: "a", title: "Cell A", depth: 1.5 },
      },
    ]);
  });

  it("keeps a drawable geometry that is not a point", () => {
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    const [feature] = decode(
      collection({ id: "p", geometry: polygon, properties: { name: "Zone" } }),
    );
    expect(feature?.geometry).toEqual(polygon);
  });

  it.each([
    [
      "null",
      { id: "a", geometry: null, properties: { name: "Pixel", depth: 2 } },
    ],
    ["missing", { id: "a", properties: { name: "Pixel", depth: 2 } }],
  ])(
    "puts a feature with a %s geometry at the tapped point",
    (_label, feature) => {
      expect(decode(collection(feature))).toEqual([
        {
          id: "a",
          geometry: { type: "Point", coordinates: [18.4, -33.9] },
          fields: { id: "a", title: "Pixel", depth: 2 },
        },
      ]);
    },
  );

  it("gives a feature with no id its position in the answer", () => {
    const ids = decode(
      collection(
        pointFeature(null, "First", 1),
        { id: "x", geometry: { type: "Nothing" }, properties: {} },
        pointFeature(undefined, "Third", 3),
      ),
    ).map((feature) => feature.id);
    expect(ids).toEqual(["0", "2"]);
  });

  it("reads a document with no features list as nothing found", () => {
    expect(decode({})).toEqual([]);
    expect(decode({ type: "FeatureCollection", features: null })).toEqual([]);
    expect(decode({ exceptions: [{ text: "no layer" }] })).toEqual([]);
  });

  it("refuses an answer that is not a document at all", () => {
    for (const raw of [null, "text", 42, [collection()]]) {
      expect(failureOf(LayerError, () => decode(raw))?.kind).toBe("invalid");
    }
  });

  it("keeps at most MAX_IDENTIFIED_FEATURES results", () => {
    expect(MAX_IDENTIFIED_FEATURES).toBe(20);
    const features = Array.from({ length: 21 }, (_, index) =>
      pointFeature(`f${index}`, `Cell ${index}`, index),
    );
    const decoded = decode(collection(...features));
    expect(decoded).toHaveLength(20);
    expect(decoded[19]?.id).toBe("f19");
  });

  describe("with records", () => {
    const recording = identifying({
      records: "results.rows",
      fields: { id: "properties.code", title: "properties.name" },
    });

    it("turns each item of the list into the properties of a feature at the tapped point", () => {
      const raw = {
        results: {
          rows: [
            { code: "w1", name: "Ward 1" },
            { code: "w2", name: "Ward 2" },
          ],
        },
      };
      expect(decode(raw, recording)).toEqual([
        {
          id: "w1",
          geometry: { type: "Point", coordinates: [18.4, -33.9] },
          fields: { id: "w1", title: "Ward 1" },
        },
        {
          id: "w2",
          geometry: { type: "Point", coordinates: [18.4, -33.9] },
          fields: { id: "w2", title: "Ward 2" },
        },
      ]);
    });

    it("reads a path that is not a list, or is missing, as nothing found", () => {
      expect(decode({ results: { rows: "none" } }, recording)).toEqual([]);
      expect(decode({ results: { rows: { a: 1 } } }, recording)).toEqual([]);
      expect(decode({ results: null }, recording)).toEqual([]);
      expect(decode({}, recording)).toEqual([]);
    });

    it("caps the list", () => {
      const rows = Array.from({ length: 30 }, (_, index) => ({
        code: `w${index}`,
        name: "Ward",
      }));
      expect(decode({ results: { rows } }, recording)).toHaveLength(20);
    });

    it("hands a named decoder other than the built-in one the prepared feature collection", () => {
      const custom = vi.fn<Decoder>(() => []);
      const registry = createDecoderRegistry({ custom });
      decodeIdentify(
        {
          ...recording,
          identify: { ...recording.identify, decoder: "custom" },
        },
        { results: { rows: [{ code: "w1" }] } },
        registry,
        AT,
      );
      expect(custom).toHaveBeenCalledWith(
        {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [18.4, -33.9] },
              properties: { code: "w1" },
            },
          ],
        },
        recording.identify.fields,
      );
    });
  });

  describe("with a decoder of its own", () => {
    it("hands it the raw response untouched", () => {
      const raw = { results: [{ name: "Ward 1" }] };
      const custom = vi.fn<Decoder>(() => []);
      const registry = createDecoderRegistry({ custom });
      expect(
        decodeIdentify(identifying({ decoder: "custom" }), raw, registry, AT),
      ).toEqual([]);
      expect(custom.mock.calls[0]?.[0]).toBe(raw);
    });

    it("does not prepare an answer for a decoder that only shares the name geojson", () => {
      const custom = vi.fn<Decoder>(() => []);
      const registry = createDecoderRegistry({ geojson: custom });
      const raw = {};
      decodeIdentify(SAMPLE_IDENTIFY_LAYER, raw, registry, AT);
      expect(custom.mock.calls[0]?.[0]).toBe(raw);
      expect(registry.get("geojson")).not.toBe(geojsonDecoder);
    });

    it("caps what it returns", () => {
      const many: Decoder = () =>
        Array.from({ length: 25 }, (_, index) => ({
          id: String(index),
          geometry: { type: "Point", coordinates: [0, 0] },
          fields: { id: String(index), title: "Cell" },
        }));
      const registry = createDecoderRegistry({ many });
      expect(
        decodeIdentify(identifying({ decoder: "many" }), {}, registry, AT),
      ).toHaveLength(20);
    });
  });

  it("refuses an answer a hostile getter breaks while it is being prepared as invalid, not as a stray error", () => {
    const raw = {};
    Object.defineProperty(raw, "features", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(failureOf(LayerError, () => decode(raw))?.kind).toBe("invalid");
  });

  it("refuses a decoder that is not registered, or that throws, as invalid", () => {
    const failing: Decoder = () => {
      throw new Error("bad shape");
    };
    const registry = createDecoderRegistry({ failing });
    expect(
      failureOf(LayerError, () =>
        decodeIdentify(identifying({ decoder: "missing" }), {}, registry, AT),
      )?.kind,
    ).toBe("invalid");
    expect(
      failureOf(LayerError, () =>
        decodeIdentify(identifying({ decoder: "failing" }), {}, registry, AT),
      )?.kind,
    ).toBe("invalid");
  });
});

describe("identifyRequestUrl", () => {
  it("is the URL identifyUrl builds, for a request that can be made", () => {
    expect(identifyRequestUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, CAPE_TOWN)).toBe(
      identifyUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, CAPE_TOWN),
    );
  });

  it.each([
    ["a zoom that is not a number", { ...CAPE_TOWN, zoom: Number.NaN }],
    [
      "a latitude that is not a number",
      { ...CAPE_TOWN, latlng: { lat: Number.NaN, lng: 1 } },
    ],
  ])("refuses %s with a layer error of kind invalid", (_name, at) => {
    expect(
      failureOf(LayerError, () =>
        identifyRequestUrl(SAMPLE_IDENTIFY_LAYER, {}, NOW, at),
      )?.kind,
    ).toBe("invalid");
  });

  it("refuses a URL that is not https", () => {
    const failure = failureOf(LayerError, () =>
      identifyRequestUrl(
        identifying({ url: "http://api.test/identify?bbox={bbox}" }),
        {},
        NOW,
        CAPE_TOWN,
      ),
    );
    expect(failure?.kind).toBe("invalid");
    expect(failure?.message).toContain("not https");
  });

  it("refuses a template that names a variable it has no value for", () => {
    expect(
      failureOf(LayerError, () =>
        identifyRequestUrl(
          identifying({ url: "https://api.test/identify?q={nothing}" }),
          {},
          NOW,
          CAPE_TOWN,
        ),
      )?.kind,
    ).toBe("invalid");
  });
});
