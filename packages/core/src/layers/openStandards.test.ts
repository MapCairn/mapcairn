// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createDecoderRegistry,
  createFormatterRegistry,
  decodeFeed,
  decodeIdentify,
  type FeedLayerDefinition,
  feedUrl,
  type IdentifiableLayerDefinition,
  identifyRequestUrl,
  type LayerDefinition,
  type PointStyle,
  queryWindow,
  tileUrl,
  validateLayerDefinition,
  WEB_MERCATOR_HALF_WORLD,
} from "../index";

/**
 * The worked layer definitions in `sites/docs/docs/guides/serving-layers.md`, one for each
 * open standard a team's services usually speak, with the request each would
 * make compared to the shape the standard defines. The hosts are invented and
 * sit under a reserved domain. `engineFills` re-implements MapLibre's documented
 * substitution of `{z}`, `{x}`, `{y}` and `{bbox-epsg-3857}`, so these tests
 * show that a template is left for the engine, not that the engine fills it.
 */

const GUIDE = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../sites/docs/docs/guides/serving-layers.md",
  ),
  "utf8",
);

const options = {
  decoders: createDecoderRegistry(),
  formatters: createFormatterRegistry(),
};
const NOW = Date.UTC(2026, 0, 1);

const OGC_FEATURES_URL =
  "https://features.example.org/collections/parks/items?f=json&bbox={west},{south},{east},{north}&limit={limit}";

const ogcParks: FeedLayerDefinition<PointStyle> = {
  id: "example-ogc-parks",
  name: "Parks",
  description: "Example parks from a feature service, asked for by view.",
  group: "Places",
  dataCost: "a few KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "query",
    url: OGC_FEATURES_URL,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    maxFeatures: 500,
    minzoom: 9,
  },
  style: { colour: { kind: "fixed", colour: "bluish-green", label: "Park" } },
  card: { title: "{title}", lines: [] },
  list: {
    secondary: "{title}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No parks in view.",
};

const WMS_MAP_URL =
  "https://maps.example.org/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=roads&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}";
const WMS_INFO_URL =
  "https://maps.example.org/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=roads&QUERY_LAYERS=roads&STYLES=&CRS=EPSG:3857&BBOX={bbox}&WIDTH={width}&HEIGHT={height}&I={x}&J={y}&INFO_FORMAT=application/json&FEATURE_COUNT=10";

const wmsRoads: IdentifiableLayerDefinition = {
  id: "example-wms-roads",
  name: "Roads",
  description: "Example road map drawn by a WMS, with the road at a tap.",
  group: "Places",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "tiles",
    tiles: WMS_MAP_URL,
    tileSize: 256,
    maxzoom: 18,
  },
  identify: {
    url: WMS_INFO_URL,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    card: { title: "{title}", lines: [] },
  },
};

const WMTS_REST_URL =
  "https://tiles.example.org/wmts/imagery/default/WebMercatorQuad/{z}/{y}/{x}.jpg";
const WMTS_KVP_URL =
  "https://tiles.example.org/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=imagery&STYLE=default&TILEMATRIXSET=WebMercatorQuad&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg";

const wmtsImagery: LayerDefinition = {
  id: "example-wmts-imagery",
  name: "Imagery",
  description: "Example imagery from a WMTS tile service.",
  group: "Imagery",
  dataCost: "about 300 KB per screen",
  attribution: [{ text: "Example provider", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "tiles",
    tiles: WMTS_REST_URL,
    tileSize: 256,
    maxzoom: 19,
  },
};

type Json = Record<string, unknown>;

function withUrl(definition: LayerDefinition, url: string): Json {
  const copy = JSON.parse(JSON.stringify(definition)) as Json;
  (copy.source as Json).tiles = url;
  return copy;
}

/** What MapLibre writes into a tile template for the tile `z/x/y`. */
function engineFills(template: string, z: number, x: number, y: number) {
  const size = (2 * WEB_MERCATOR_HALF_WORLD) / 2 ** z;
  const west = -WEB_MERCATOR_HALF_WORLD + x * size;
  const north = WEB_MERCATOR_HALF_WORLD - y * size;
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace(
      "{bbox-epsg-3857}",
      [west, north - size, west + size, north].join(),
    );
}

function numbers(list: string | null): number[] {
  return (list ?? "").split(",").map(Number);
}

describe("the worked definitions", () => {
  it.each([
    ["OGC API Features", ogcParks],
    ["WMS", wmsRoads],
    ["WMTS", wmtsImagery],
  ])("%s passes the real validator", (_name, definition) => {
    expect(validateLayerDefinition(definition, options)).toEqual([]);
  });

  it.each([
    OGC_FEATURES_URL,
    WMS_MAP_URL,
    WMS_INFO_URL,
    WMTS_REST_URL,
    WMTS_KVP_URL,
  ])("the guide shows %s", (url) => {
    expect(GUIDE).toContain(url);
  });

  it("the guide shows the sizes, limits, fields and example request the prose quotes", () => {
    const view = queryWindow({
      west: 18.3,
      south: -34.0,
      east: 18.6,
      north: -33.8,
    });
    const example = new URL(feedUrl(ogcParks, {}, NOW, view)).searchParams;
    for (const line of [
      "maxFeatures: 500,",
      'fields: { id: "id", title: "properties.name" },',
      "tileSize: 256,",
      "maxzoom: 18,",
      "maxzoom: 19,",
      `\`.../items?f=json&bbox=${example.get("bbox")}&limit=${example.get("limit")}\``,
    ]) {
      expect(GUIDE).toContain(line);
    }
    expect(example.get("limit")).toBe("501");
    expect(wmsRoads.source.maxzoom).toBe(18);
    expect(wmtsImagery.source.maxzoom).toBe(19);
    expect(wmsRoads.identify.tolerance).toBeUndefined();
  });
});

describe("OGC API Features", () => {
  const view = { west: 18.3, south: -34.0, east: 18.6, north: -33.8 };

  it("asks the items resource for a box in longitude and latitude order, and one more than it draws", () => {
    const area = queryWindow(view);
    const url = new URL(feedUrl(ogcParks, {}, NOW, area));
    expect(url.origin).toBe("https://features.example.org");
    expect(url.pathname).toBe("/collections/parks/items");
    expect(numbers(url.searchParams.get("bbox"))).toEqual([
      area.west,
      area.south,
      area.east,
      area.north,
    ]);
    expect(url.searchParams.get("bbox")).toBe("18.2,-34.1,18.7,-33.7");
    expect(url.searchParams.get("limit")).toBe("501");
    expect(url.searchParams.get("f")).toBe("json");
    expect(url.searchParams.has("bbox-crs")).toBe(false);
  });

  it("keeps the box inside the world, so it never wraps the antimeridian or passes 85 degrees", () => {
    const world = queryWindow({ west: -179, south: -89, east: 179, north: 89 });
    const [west, south, east, north] = numbers(
      new URL(feedUrl(ogcParks, {}, NOW, world)).searchParams.get("bbox"),
    );
    expect([west, south, east, north]).toEqual([-180, -85, 180, 85]);
  });

  it("reads an items document, and does not follow its next link", () => {
    const small: FeedLayerDefinition<PointStyle> = {
      ...ogcParks,
      source: { ...ogcParks.source, maxFeatures: 2 } as typeof ogcParks.source,
    };
    const point = (id: string, lng: number) => ({
      type: "Feature",
      id,
      geometry: { type: "Point", coordinates: [lng, -33.9] },
      properties: { name: `Park ${id}` },
    });
    const features = decodeFeed(
      small,
      {
        type: "FeatureCollection",
        numberMatched: 40,
        numberReturned: 4,
        links: [{ rel: "next", href: "https://features.example.org/next" }],
        features: ["a", "b", "c", "d"].map((id, i) => point(id, 18 + i / 10)),
      },
      options.decoders,
    );
    expect(features.map((feature) => feature.id)).toEqual(["a", "b", "c"]);
  });

  it("refuses a service that is not https", () => {
    const definition = JSON.parse(JSON.stringify(ogcParks)) as Json;
    (definition.source as Json).url = OGC_FEATURES_URL.replace(
      "https:",
      "http:",
    );
    expect(validateLayerDefinition(definition, options)).toEqual([
      "source.url: must be an https URL template",
    ]);
  });
});

describe("WMS", () => {
  it("asks GetMap for a square picture of the tile in EPSG:3857, as WMS 1.3.0 defines", () => {
    const raw = tileUrl(wmsRoads, {}, NOW);
    expect(raw).toBe(WMS_MAP_URL);
    const { searchParams: query } = new URL(engineFills(raw, 3, 5, 2));
    expect(query.get("SERVICE")).toBe("WMS");
    expect(query.get("VERSION")).toBe("1.3.0");
    expect(query.get("REQUEST")).toBe("GetMap");
    expect(query.get("CRS")).toBe("EPSG:3857");
    expect(query.get("FORMAT")).toBe("image/png");
    expect(query.get("TRANSPARENT")).toBe("true");
    expect(query.get("STYLES")).toBe("");
    expect(query.get("WIDTH")).toBe(String(wmsRoads.source.tileSize));
    expect(query.get("HEIGHT")).toBe(String(wmsRoads.source.tileSize));
    const [minx, miny, maxx, maxy] = numbers(query.get("BBOX"));
    const side = (2 * WEB_MERCATOR_HALF_WORLD) / 2 ** 3;
    expect(maxx - (minx as number)).toBeCloseTo(side, 3);
    expect(maxy - (miny as number)).toBeCloseTo(side, 3);
    expect(minx).toBeCloseTo(-WEB_MERCATOR_HALF_WORLD + 5 * side, 3);
    expect(maxy).toBeCloseTo(WEB_MERCATOR_HALF_WORLD - 2 * side, 3);
  });

  it("documents the WMS 1.1.1 spelling (SRS), which the validator does not inspect", () => {
    const url = WMS_MAP_URL.replace("VERSION=1.3.0", "VERSION=1.1.1").replace(
      "CRS=",
      "SRS=",
    );
    expect(validateLayerDefinition(withUrl(wmsRoads, url), options)).toEqual(
      [],
    );
  });

  describe("GetFeatureInfo through the identify block", () => {
    const tap = { latlng: { lat: -33.9, lng: 18.4 }, zoom: 12 };
    const query = new URL(identifyRequestUrl(wmsRoads, {}, NOW, tap))
      .searchParams;

    it("sends a box of 2 x tolerance + 1 pixels, with the tapped pixel in its middle", () => {
      expect(query.get("REQUEST")).toBe("GetFeatureInfo");
      expect(query.get("QUERY_LAYERS")).toBe(query.get("LAYERS"));
      expect(query.get("WIDTH")).toBe("25");
      expect(query.get("HEIGHT")).toBe("25");
      expect(query.get("I")).toBe("12");
      expect(query.get("J")).toBe("12");
      const [minx, miny, maxx, maxy] = numbers(query.get("BBOX")) as [
        number,
        number,
        number,
        number,
      ];
      const metresPerPixel = (2 * WEB_MERCATOR_HALF_WORLD) / 256 / 2 ** 12;
      expect((maxx - minx) / 25).toBeCloseTo(metresPerPixel, 3);
      expect((maxy - miny) / 25).toBeCloseTo(metresPerPixel, 3);
      expect(minx + (maxx - minx) / 2).toBeCloseTo(
        (18.4 * WEB_MERCATOR_HALF_WORLD) / 180,
        2,
      );
    });

    it("writes the box with its commas encoded, which a server decodes as any query string", () => {
      const raw = identifyRequestUrl(wmsRoads, {}, NOW, tap);
      expect(raw).toMatch(/BBOX=[-\d.]+%2C[-\d.]+%2C[-\d.]+%2C[-\d.]+&/);
    });

    it("reads a JSON FeatureCollection and places a feature with no geometry at the tap", () => {
      const features = decodeIdentify(
        wmsRoads,
        {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "roads.7",
              geometry: null,
              properties: { name: "N2" },
            },
          ],
        },
        options.decoders,
        tap,
      );
      expect(features).toHaveLength(1);
      expect(features[0]?.fields.title).toBe("N2");
      expect(features[0]?.geometry).toEqual({
        type: "Point",
        coordinates: [18.4, -33.9],
      });
    });

    it("does not read an XML answer", () => {
      expect(() =>
        decodeIdentify(
          wmsRoads,
          "<?xml version='1.0'?><GetFeatureInfoResponse/>",
          options.decoders,
          tap,
        ),
      ).toThrow();
    });
  });

  it("documents the WMS 1.1.1 spelling of the pixel (X and Y), which the validator does not inspect", () => {
    const definition = JSON.parse(JSON.stringify(wmsRoads)) as Json;
    (definition.identify as Json).url = WMS_INFO_URL.replace(
      "VERSION=1.3.0",
      "VERSION=1.1.1",
    )
      .replace("CRS=", "SRS=")
      .replace("I={x}&J={y}", "X={x}&Y={y}");
    expect(validateLayerDefinition(definition, options)).toEqual([]);
  });

  it("refuses an identify URL whose host is a placeholder", () => {
    const definition = JSON.parse(JSON.stringify(wmsRoads)) as Json;
    (definition.identify as Json).url = WMS_INFO_URL.replace(
      "maps.example.org",
      "{width}.example.org",
    );
    expect(validateLayerDefinition(definition, options)).toEqual([
      "identify.url: the scheme, host and port must be fixed text, with no placeholder",
    ]);
  });
});

describe("WMTS", () => {
  it("asks the RESTful template for row before column, as the tile matrix set defines", () => {
    const raw = tileUrl(wmtsImagery, {}, NOW);
    expect(engineFills(raw, 3, 5, 2)).toBe(
      "https://tiles.example.org/wmts/imagery/default/WebMercatorQuad/3/2/5.jpg",
    );
  });

  it("asks the key-value form with TILEMATRIX, TILEROW and TILECOL from z, y and x", () => {
    const definition = withUrl(wmtsImagery, WMTS_KVP_URL);
    expect(validateLayerDefinition(definition, options)).toEqual([]);
    const { searchParams: query } = new URL(engineFills(WMTS_KVP_URL, 3, 5, 2));
    expect(query.get("SERVICE")).toBe("WMTS");
    expect(query.get("REQUEST")).toBe("GetTile");
    expect(query.get("VERSION")).toBe("1.0.0");
    expect(query.get("TILEMATRIXSET")).toBe("WebMercatorQuad");
    expect(query.get("TILEMATRIX")).toBe("3");
    expect(query.get("TILEROW")).toBe("2");
    expect(query.get("TILECOL")).toBe("5");
    expect(query.get("FORMAT")).toBe("image/jpeg");
  });

  it("documents text before the zoom level, as in EPSG:3857:{z}, which is fixed text to the validator", () => {
    const url = WMTS_KVP_URL.replace(
      "TILEMATRIX={z}",
      "TILEMATRIX=EPSG:3857:{z}",
    );
    expect(validateLayerDefinition(withUrl(wmtsImagery, url), options)).toEqual(
      [],
    );
    expect(
      new URL(engineFills(url, 3, 5, 2)).searchParams.get("TILEMATRIX"),
    ).toBe("EPSG:3857:3");
  });
});
