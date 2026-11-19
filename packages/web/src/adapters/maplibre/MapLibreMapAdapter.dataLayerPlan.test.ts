// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  MapHeatmap,
  MapShapeLook,
  MapStyledShapes,
  MapVectorTiles,
} from "@mapcairn/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canvasStub, FakeLngLat, FakeMapLibreMap } from "./maplibreTestEngine";

// Characterises what each kind of data layer asks the engine for: the images,
// the source and the style layers, in order. The same expectations held before
// the planning moved out of the adapter, so they pin that nothing changed.
vi.mock("maplibre-gl", async () => ({
  Map: (await import("./maplibreTestEngine")).FakeMapLibreMap,
  GPUInitializationError: (await import("./maplibreTestEngine"))
    .FakeGPUInitializationError,
  LngLat: FakeLngLat,
  setWorkerUrl: vi.fn(),
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({
  default: "mock-maplibre-worker-url",
}));

import { MapLibreMapAdapter } from "./MapLibreMapAdapter";

const VECTOR_BASEMAP: BasemapDefinition = {
  id: "positron",
  name: "Positron",
  source: { kind: "vector", styleUrl: "https://tiles.example/positron" },
  minZoom: 0,
  maxZoom: 22,
  thumbnail: "/basemaps/positron.jpg",
  attribution: [{ text: "© OpenStreetMap contributors" }],
  appearance: "light",
};

const RASTER_BASEMAP: BasemapDefinition = {
  ...VECTOR_BASEMAP,
  id: "streets",
  source: {
    kind: "raster",
    tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
    tileSize: 256,
  },
};

const LOOK: MapShapeLook = {
  colour: "#0072b2",
  fillOpacity: 0.55,
  pattern: "solid",
  dash: "solid",
  width: 1.5,
};

const square = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2, 0],
      [3, 0],
      [3, 1],
      [2, 0],
    ],
  ] as const,
};

const path = {
  type: "LineString" as const,
  coordinates: [
    [2, 48],
    [3, 49],
  ] as const,
};

const AREAS: MapStyledShapes = {
  geometry: "area",
  shapes: [
    {
      id: "north",
      geometry: square,
      look: { ...LOOK, pattern: "dots", dash: "dashed" },
      label: "North",
    },
    { id: "route", geometry: path, look: LOOK },
  ],
  labelMinZoom: 5,
};

const LINES: MapStyledShapes = {
  geometry: "line",
  shapes: [
    { id: "main", geometry: path, look: { ...LOOK, width: 4 }, label: "Main" },
    { id: "lake", geometry: square, look: LOOK },
  ],
};

const TILE_SOURCE = {
  tiles: "https://vector.test/{z}/{x}/{y}.pbf",
  minzoom: 0,
  maxzoom: 14,
} as const;

const VECTOR: MapVectorTiles = {
  source: TILE_SOURCE,
  minzoom: 3,
  maxzoom: 17,
  layers: [
    {
      sourceLayer: "areas",
      geometry: "area",
      rule: {
        kind: "category",
        field: "kind",
        cases: [{ value: "park", look: { ...LOOK, pattern: "stripes" } }],
        fallback: { ...LOOK, colour: "#e69f00" },
      },
      label: { field: "name", minzoom: 8 },
    },
    {
      sourceLayer: "borders",
      geometry: "line",
      minzoom: 5,
      rule: {
        kind: "steps",
        field: "rank",
        steps: [
          { min: 0, look: LOOK },
          { min: 5, look: { ...LOOK, width: 3, dash: "dashed" } },
        ],
      },
    },
  ],
};

const HEAT_STYLE = {
  radius: 20,
  intensity: 1.5,
  opacity: 0.8,
  ramp: ["#440154", "#21918c", "#fde725"],
} as const;

const HEAT_POINTS: MapHeatmap = {
  source: {
    kind: "points",
    points: [
      { position: { lat: 48.86, lng: 2.35 }, weight: 3 },
      { position: { lat: -1.29, lng: 36.82 } },
    ],
  },
  style: HEAT_STYLE,
};

const HEAT_VECTOR: MapHeatmap = {
  source: {
    kind: "vector",
    source: TILE_SOURCE,
    sourceLayer: "events",
    weightField: "size",
    minzoom: 6,
    maxzoom: 12,
  },
  style: HEAT_STYLE,
};

const POINTS = [
  {
    id: "a",
    position: { lat: 48.86, lng: 2.35 },
    colour: "#e69f00",
    radius: 6,
    shape: "circle" as const,
  },
  {
    id: "b",
    position: { lat: -1.29, lng: 36.82 },
    colour: "#e69f00",
    radius: 9,
    shape: "square" as const,
  },
  {
    id: "c",
    position: { lat: 0, lng: 0 },
    colour: "#e69f00",
    radius: 6,
    shape: "circle" as const,
  },
];

async function ready(basemap: BasemapDefinition) {
  const adapter = new MapLibreMapAdapter();
  const host = document.createElement("div");
  document.body.append(host);
  const mounting = adapter.mount(host, {
    view: { center: { lat: -26.2, lng: 28.05 }, zoom: 10, bearing: 0 },
    basemap,
    reducedMotion: false,
  });
  await vi.waitFor(() => {
    expect(FakeMapLibreMap.instances.length).toBe(1);
  });
  const map = FakeMapLibreMap.instances[0] as FakeMapLibreMap;
  map.fire("load");
  await mounting;
  map.fire("style.load");
  return { adapter, map };
}

/** What the engine holds for the layers drawn so far, without the pixel data of images. */
function drawn(map: FakeMapLibreMap) {
  return {
    images: [...map.images.keys()],
    sources: Object.fromEntries(map.sources),
    layers: map.styleLayers,
  };
}

/** The engine calls that add things, in the order they were made. */
function additions(map: FakeMapLibreMap): string[] {
  const order: string[] = [];
  for (const method of ["addImage", "addSource", "addLayer"] as const) {
    const original = map[method].bind(map) as (...args: unknown[]) => void;
    vi.spyOn(map, method).mockImplementation((...args: unknown[]) => {
      order.push(
        `${method}:${String(args[0] instanceof Object ? (args[0] as { id: string }).id : args[0])}`,
      );
      original(...args);
    });
  }
  return order;
}

let restoreCanvas = () => {};

beforeEach(() => {
  FakeMapLibreMap.reset();
  restoreCanvas = canvasStub.install();
});

afterEach(() => {
  restoreCanvas();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("what each data layer kind asks the engine for", () => {
  it("draws point features as one symbol layer, with each distinct marker image added first", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    const order = additions(map);
    adapter.setFeatureLayer("pts", POINTS);
    expect(order).toMatchInlineSnapshot(`
      [
        "addImage:mapcairn-marker:circle:#e69f00:6",
        "addImage:mapcairn-marker:square:#e69f00:9",
        "addSource:mapcairn:pts",
        "addLayer:mapcairn:pts:points",
      ]
    `);
    expect(drawn(map)).toMatchInlineSnapshot(`
      {
        "images": [
          "mapcairn-marker:circle:#e69f00:6",
          "mapcairn-marker:square:#e69f00:9",
        ],
        "layers": [
          {
            "id": "mapcairn:pts:points",
            "layout": {
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-image": [
                "get",
                "icon",
              ],
              "symbol-sort-key": [
                "get",
                "sort",
              ],
            },
            "paint": {},
            "source": "mapcairn:pts",
            "type": "symbol",
          },
        ],
        "sources": {
          "mapcairn:pts": {
            "data": {
              "features": [
                {
                  "geometry": {
                    "coordinates": [
                      2.35,
                      48.86,
                    ],
                    "type": "Point",
                  },
                  "properties": {
                    "icon": "mapcairn-marker:circle:#e69f00:6",
                    "mapcairn:id": "a",
                    "mapcairn:layer": "pts",
                    "sort": -6,
                  },
                  "type": "Feature",
                },
                {
                  "geometry": {
                    "coordinates": [
                      36.82,
                      -1.29,
                    ],
                    "type": "Point",
                  },
                  "properties": {
                    "icon": "mapcairn-marker:square:#e69f00:9",
                    "mapcairn:id": "b",
                    "mapcairn:layer": "pts",
                    "sort": -9,
                  },
                  "type": "Feature",
                },
                {
                  "geometry": {
                    "coordinates": [
                      0,
                      0,
                    ],
                    "type": "Point",
                  },
                  "properties": {
                    "icon": "mapcairn-marker:circle:#e69f00:6",
                    "mapcairn:id": "c",
                    "mapcairn:layer": "pts",
                    "sort": -6,
                  },
                  "type": "Feature",
                },
              ],
              "type": "FeatureCollection",
            },
            "type": "geojson",
          },
        },
      }
    `);
  });

  it("draws a tile overlay as a raster source and layer", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    adapter.setTileLayer("imagery", {
      tiles: "https://tiles.test/{z}/{x}/{y}.png",
      tileSize: 512,
      maxzoom: 12,
      bounds: [-10, -20, 30, 40],
      opacity: 0.6,
    });
    adapter.setTileLayer("plain", {
      tiles: "https://tiles.test/p/{z}/{x}/{y}.png",
      tileSize: 256,
      maxzoom: 9,
      opacity: 1,
    });
    expect(drawn(map)).toMatchInlineSnapshot(`
      {
        "images": [],
        "layers": [
          {
            "id": "mapcairn:imagery:tiles",
            "paint": {
              "raster-opacity": 0.6,
            },
            "source": "mapcairn:imagery",
            "type": "raster",
          },
          {
            "id": "mapcairn:plain:tiles",
            "paint": {
              "raster-opacity": 1,
            },
            "source": "mapcairn:plain",
            "type": "raster",
          },
        ],
        "sources": {
          "mapcairn:imagery": {
            "bounds": [
              -10,
              -20,
              30,
              40,
            ],
            "maxzoom": 12,
            "tileSize": 512,
            "tiles": [
              "https://tiles.test/{z}/{x}/{y}.png",
            ],
            "type": "raster",
          },
          "mapcairn:plain": {
            "maxzoom": 9,
            "tileSize": 256,
            "tiles": [
              "https://tiles.test/p/{z}/{x}/{y}.png",
            ],
            "type": "raster",
          },
        },
      }
    `);
  });

  it("draws shapes as a fill and a line over one GeoJSON source", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    adapter.setShapeLayer("detail", {
      colour: "#d55e00",
      geometries: [square, path],
    });
    adapter.setShapeLayer("thin", {
      colour: "#009e73",
      lineWidth: 5,
      geometries: [path],
    });
    expect(drawn(map)).toMatchInlineSnapshot(`
      {
        "images": [],
        "layers": [
          {
            "filter": [
              "match",
              [
                "geometry-type",
              ],
              [
                "Polygon",
                "MultiPolygon",
              ],
              true,
              false,
            ],
            "id": "mapcairn:detail:fill",
            "paint": {
              "fill-color": "#d55e00",
              "fill-opacity": 0.18,
            },
            "source": "mapcairn:detail",
            "type": "fill",
          },
          {
            "id": "mapcairn:detail:line",
            "layout": {
              "line-cap": "round",
              "line-join": "round",
            },
            "paint": {
              "line-color": "#d55e00",
              "line-width": 2,
            },
            "source": "mapcairn:detail",
            "type": "line",
          },
          {
            "filter": [
              "match",
              [
                "geometry-type",
              ],
              [
                "Polygon",
                "MultiPolygon",
              ],
              true,
              false,
            ],
            "id": "mapcairn:thin:fill",
            "paint": {
              "fill-color": "#009e73",
              "fill-opacity": 0.18,
            },
            "source": "mapcairn:thin",
            "type": "fill",
          },
          {
            "id": "mapcairn:thin:line",
            "layout": {
              "line-cap": "round",
              "line-join": "round",
            },
            "paint": {
              "line-color": "#009e73",
              "line-width": 5,
            },
            "source": "mapcairn:thin",
            "type": "line",
          },
        ],
        "sources": {
          "mapcairn:detail": {
            "data": {
              "features": [
                {
                  "geometry": {
                    "coordinates": [
                      [
                        [
                          2,
                          0,
                        ],
                        [
                          3,
                          0,
                        ],
                        [
                          3,
                          1,
                        ],
                        [
                          2,
                          0,
                        ],
                      ],
                    ],
                    "type": "Polygon",
                  },
                  "properties": {},
                  "type": "Feature",
                },
                {
                  "geometry": {
                    "coordinates": [
                      [
                        2,
                        48,
                      ],
                      [
                        3,
                        49,
                      ],
                    ],
                    "type": "LineString",
                  },
                  "properties": {},
                  "type": "Feature",
                },
              ],
              "type": "FeatureCollection",
            },
            "type": "geojson",
          },
          "mapcairn:thin": {
            "data": {
              "features": [
                {
                  "geometry": {
                    "coordinates": [
                      [
                        2,
                        48,
                      ],
                      [
                        3,
                        49,
                      ],
                    ],
                    "type": "LineString",
                  },
                  "properties": {},
                  "type": "Feature",
                },
              ],
              "type": "FeatureCollection",
            },
            "type": "geojson",
          },
        },
      }
    `);
  });

  it("draws styled areas with a label on a basemap that has a glyph server", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    map.basemapLayers = [
      {
        id: "place",
        type: "symbol",
        layout: { "text-font": ["Noto Sans Regular"] },
      },
    ];
    const order = additions(map);
    adapter.setStyledShapes("regions", AREAS);
    expect(order).toMatchInlineSnapshot(`
      [
        "addImage:mapcairn-pattern:stripes",
        "addImage:mapcairn-pattern:dots",
        "addImage:mapcairn-pattern:crosshatch",
        "addSource:mapcairn:regions",
        "addLayer:mapcairn:regions:styled-fill",
        "addLayer:mapcairn:regions:styled-pattern",
        "addLayer:mapcairn:regions:styled-outline-solid",
        "addLayer:mapcairn:regions:styled-outline-dashed",
        "addLayer:mapcairn:regions:styled-outline-dotted",
        "addLayer:mapcairn:regions:styled-label",
      ]
    `);
    expect(drawn(map)).toMatchInlineSnapshot(`
      {
        "images": [
          "mapcairn-pattern:stripes",
          "mapcairn-pattern:dots",
          "mapcairn-pattern:crosshatch",
        ],
        "layers": [
          {
            "id": "mapcairn:regions:styled-fill",
            "paint": {
              "fill-color": [
                "get",
                "colour",
              ],
              "fill-opacity": [
                "get",
                "fillOpacity",
              ],
            },
            "source": "mapcairn:regions",
            "type": "fill",
          },
          {
            "filter": [
              "!=",
              [
                "get",
                "pattern",
              ],
              "solid",
            ],
            "id": "mapcairn:regions:styled-pattern",
            "paint": {
              "fill-pattern": [
                "concat",
                "mapcairn-pattern:",
                [
                  "get",
                  "pattern",
                ],
              ],
            },
            "source": "mapcairn:regions",
            "type": "fill",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "solid",
            ],
            "id": "mapcairn:regions:styled-outline-solid",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": "#1c2733",
              "line-width": [
                "get",
                "width",
              ],
            },
            "source": "mapcairn:regions",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "dashed",
            ],
            "id": "mapcairn:regions:styled-outline-dashed",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": "#1c2733",
              "line-dasharray": [
                3,
                2,
              ],
              "line-width": [
                "get",
                "width",
              ],
            },
            "source": "mapcairn:regions",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "dotted",
            ],
            "id": "mapcairn:regions:styled-outline-dotted",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": "#1c2733",
              "line-dasharray": [
                1,
                2,
              ],
              "line-width": [
                "get",
                "width",
              ],
            },
            "source": "mapcairn:regions",
            "type": "line",
          },
          {
            "filter": [
              "!=",
              [
                "get",
                "label",
              ],
              "",
            ],
            "id": "mapcairn:regions:styled-label",
            "layout": {
              "text-field": [
                "get",
                "label",
              ],
              "text-font": [
                "Noto Sans Regular",
              ],
              "text-max-width": 8,
              "text-size": 12,
            },
            "minzoom": 4,
            "paint": {
              "text-color": "#1c2733",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            },
            "source": "mapcairn:regions",
            "type": "symbol",
          },
        ],
        "sources": {
          "mapcairn:regions": {
            "data": {
              "features": [
                {
                  "geometry": {
                    "coordinates": [
                      [
                        [
                          2,
                          0,
                        ],
                        [
                          3,
                          0,
                        ],
                        [
                          3,
                          1,
                        ],
                        [
                          2,
                          0,
                        ],
                      ],
                    ],
                    "type": "Polygon",
                  },
                  "properties": {
                    "colour": "#0072b2",
                    "dash": "dashed",
                    "fillOpacity": 0.55,
                    "label": "North",
                    "mapcairn:id": "north",
                    "mapcairn:layer": "regions",
                    "pattern": "dots",
                    "width": 1.5,
                  },
                  "type": "Feature",
                },
              ],
              "type": "FeatureCollection",
            },
            "type": "geojson",
          },
        },
      }
    `);
  });

  it("draws styled lines along their path, and no label without a font", async () => {
    const withFont = await ready(VECTOR_BASEMAP);
    withFont.map.basemapLayers = [
      {
        id: "place",
        type: "symbol",
        layout: { "text-font": ["literal", ["Noto Sans Regular"]] },
      },
    ];
    withFont.adapter.setStyledShapes("routes", LINES);
    expect(drawn(withFont.map)).toMatchInlineSnapshot(`
      {
        "images": [],
        "layers": [
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "solid",
            ],
            "id": "mapcairn:routes:styled-casing-solid",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": "#ffffff",
              "line-width": [
                "+",
                [
                  "get",
                  "width",
                ],
                3,
              ],
            },
            "source": "mapcairn:routes",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "dashed",
            ],
            "id": "mapcairn:routes:styled-casing-dashed",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": "#ffffff",
              "line-dasharray": [
                3,
                2,
              ],
              "line-width": [
                "+",
                [
                  "get",
                  "width",
                ],
                3,
              ],
            },
            "source": "mapcairn:routes",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "dotted",
            ],
            "id": "mapcairn:routes:styled-casing-dotted",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": "#ffffff",
              "line-dasharray": [
                1,
                2,
              ],
              "line-width": [
                "+",
                [
                  "get",
                  "width",
                ],
                3,
              ],
            },
            "source": "mapcairn:routes",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "solid",
            ],
            "id": "mapcairn:routes:styled-line-solid",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": [
                "get",
                "colour",
              ],
              "line-width": [
                "get",
                "width",
              ],
            },
            "source": "mapcairn:routes",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "dashed",
            ],
            "id": "mapcairn:routes:styled-line-dashed",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": [
                "get",
                "colour",
              ],
              "line-dasharray": [
                3,
                2,
              ],
              "line-width": [
                "get",
                "width",
              ],
            },
            "source": "mapcairn:routes",
            "type": "line",
          },
          {
            "filter": [
              "==",
              [
                "get",
                "dash",
              ],
              "dotted",
            ],
            "id": "mapcairn:routes:styled-line-dotted",
            "layout": {
              "line-join": "round",
            },
            "paint": {
              "line-color": [
                "get",
                "colour",
              ],
              "line-dasharray": [
                1,
                2,
              ],
              "line-width": [
                "get",
                "width",
              ],
            },
            "source": "mapcairn:routes",
            "type": "line",
          },
          {
            "filter": [
              "!=",
              [
                "get",
                "label",
              ],
              "",
            ],
            "id": "mapcairn:routes:styled-label",
            "layout": {
              "symbol-placement": "line",
              "text-field": [
                "get",
                "label",
              ],
              "text-font": [
                "Noto Sans Regular",
              ],
              "text-max-width": 8,
              "text-size": 12,
            },
            "paint": {
              "text-color": "#1c2733",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            },
            "source": "mapcairn:routes",
            "type": "symbol",
          },
        ],
        "sources": {
          "mapcairn:routes": {
            "data": {
              "features": [
                {
                  "geometry": {
                    "coordinates": [
                      [
                        2,
                        48,
                      ],
                      [
                        3,
                        49,
                      ],
                    ],
                    "type": "LineString",
                  },
                  "properties": {
                    "colour": "#0072b2",
                    "dash": "solid",
                    "fillOpacity": 0.55,
                    "label": "Main",
                    "mapcairn:id": "main",
                    "mapcairn:layer": "routes",
                    "pattern": "solid",
                    "width": 4,
                  },
                  "type": "Feature",
                },
              ],
              "type": "FeatureCollection",
            },
            "type": "geojson",
          },
        },
      }
    `);
    FakeMapLibreMap.reset();
    const without = await ready(RASTER_BASEMAP);
    without.adapter.setStyledShapes("routes", LINES);
    expect(
      without.map.styleLayers.map((layer) => layer.id),
    ).toMatchInlineSnapshot(`
      [
        "mapcairn:routes:styled-casing-solid",
        "mapcairn:routes:styled-casing-dashed",
        "mapcairn:routes:styled-casing-dotted",
        "mapcairn:routes:styled-line-solid",
        "mapcairn:routes:styled-line-dashed",
        "mapcairn:routes:styled-line-dotted",
      ]
    `);
  });

  it("ignores a text font that is an expression", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    map.basemapLayers = [
      { id: "a", type: "symbol", layout: { "text-font": ["get", "font"] } },
      { id: "b", type: "symbol", layout: {} },
      { id: "c", type: "line" },
      {
        id: "d",
        type: "symbol",
        layout: { "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"] },
      },
    ];
    adapter.setStyledShapes("regions", AREAS);
    const label = map.styleLayers.find((layer) =>
      String(layer.id).includes("label"),
    );
    expect(
      (label as { layout: Record<string, unknown> }).layout["text-font"],
    ).toMatchInlineSnapshot(`
      [
        "Open Sans Bold",
        "Arial Unicode MS Bold",
      ]
    `);
  });

  it("draws vector tiles layer by layer, with labels from a property", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    map.basemapLayers = [
      {
        id: "place",
        type: "symbol",
        layout: { "text-font": ["Noto Sans Regular"] },
      },
    ];
    adapter.setVectorLayer("districts", VECTOR);
    expect(drawn(map)).toMatchInlineSnapshot(`
      {
        "images": [
          "mapcairn-pattern:stripes",
          "mapcairn-pattern:dots",
          "mapcairn-pattern:crosshatch",
        ],
        "layers": [
          {
            "filter": [
              "match",
              [
                "geometry-type",
              ],
              [
                "Polygon",
                "MultiPolygon",
              ],
              true,
              false,
            ],
            "id": "mapcairn:districts:v0-fill",
            "maxzoom": 16,
            "minzoom": 2,
            "paint": {
              "fill-color": [
                "match",
                [
                  "get",
                  "kind",
                ],
                "park",
                "#0072b2",
                "#e69f00",
              ],
              "fill-opacity": [
                "match",
                [
                  "get",
                  "kind",
                ],
                "park",
                0.55,
                0.55,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "areas",
            "type": "fill",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "Polygon",
                  "MultiPolygon",
                ],
                true,
                false,
              ],
              [
                "!=",
                [
                  "match",
                  [
                    "get",
                    "kind",
                  ],
                  "park",
                  "stripes",
                  "solid",
                ],
                "solid",
              ],
            ],
            "id": "mapcairn:districts:v0-pattern",
            "maxzoom": 16,
            "minzoom": 2,
            "paint": {
              "fill-pattern": [
                "concat",
                "mapcairn-pattern:",
                [
                  "match",
                  [
                    "get",
                    "kind",
                  ],
                  "park",
                  "stripes",
                  "solid",
                ],
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "areas",
            "type": "fill",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "Polygon",
                  "MultiPolygon",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "match",
                  [
                    "get",
                    "kind",
                  ],
                  "park",
                  "solid",
                  "solid",
                ],
                "solid",
              ],
            ],
            "id": "mapcairn:districts:v0-outline-solid",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 2,
            "paint": {
              "line-color": "#1c2733",
              "line-width": [
                "match",
                [
                  "get",
                  "kind",
                ],
                "park",
                1.5,
                1.5,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "areas",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "Polygon",
                  "MultiPolygon",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "match",
                  [
                    "get",
                    "kind",
                  ],
                  "park",
                  "solid",
                  "solid",
                ],
                "dashed",
              ],
            ],
            "id": "mapcairn:districts:v0-outline-dashed",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 2,
            "paint": {
              "line-color": "#1c2733",
              "line-dasharray": [
                3,
                2,
              ],
              "line-width": [
                "match",
                [
                  "get",
                  "kind",
                ],
                "park",
                1.5,
                1.5,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "areas",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "Polygon",
                  "MultiPolygon",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "match",
                  [
                    "get",
                    "kind",
                  ],
                  "park",
                  "solid",
                  "solid",
                ],
                "dotted",
              ],
            ],
            "id": "mapcairn:districts:v0-outline-dotted",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 2,
            "paint": {
              "line-color": "#1c2733",
              "line-dasharray": [
                1,
                2,
              ],
              "line-width": [
                "match",
                [
                  "get",
                  "kind",
                ],
                "park",
                1.5,
                1.5,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "areas",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "Polygon",
                  "MultiPolygon",
                ],
                true,
                false,
              ],
              [
                "!=",
                [
                  "to-string",
                  [
                    "get",
                    "name",
                  ],
                ],
                "",
              ],
            ],
            "id": "mapcairn:districts:v0-label",
            "layout": {
              "text-field": [
                "to-string",
                [
                  "get",
                  "name",
                ],
              ],
              "text-font": [
                "Noto Sans Regular",
              ],
              "text-max-width": 8,
              "text-size": 12,
            },
            "maxzoom": 16,
            "minzoom": 7,
            "paint": {
              "text-color": "#1c2733",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.5,
            },
            "source": "mapcairn:districts",
            "source-layer": "areas",
            "type": "symbol",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "LineString",
                  "MultiLineString",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  "solid",
                  5,
                  "dashed",
                ],
                "solid",
              ],
            ],
            "id": "mapcairn:districts:v1-casing-solid",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 4,
            "paint": {
              "line-color": "#ffffff",
              "line-width": [
                "+",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  1.5,
                  5,
                  3,
                ],
                3,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "borders",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "LineString",
                  "MultiLineString",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  "solid",
                  5,
                  "dashed",
                ],
                "dashed",
              ],
            ],
            "id": "mapcairn:districts:v1-casing-dashed",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 4,
            "paint": {
              "line-color": "#ffffff",
              "line-dasharray": [
                3,
                2,
              ],
              "line-width": [
                "+",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  1.5,
                  5,
                  3,
                ],
                3,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "borders",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "LineString",
                  "MultiLineString",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  "solid",
                  5,
                  "dashed",
                ],
                "dotted",
              ],
            ],
            "id": "mapcairn:districts:v1-casing-dotted",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 4,
            "paint": {
              "line-color": "#ffffff",
              "line-dasharray": [
                1,
                2,
              ],
              "line-width": [
                "+",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  1.5,
                  5,
                  3,
                ],
                3,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "borders",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "LineString",
                  "MultiLineString",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  "solid",
                  5,
                  "dashed",
                ],
                "solid",
              ],
            ],
            "id": "mapcairn:districts:v1-line-solid",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 4,
            "paint": {
              "line-color": [
                "step",
                [
                  "to-number",
                  [
                    "get",
                    "rank",
                  ],
                  0,
                ],
                "#0072b2",
                5,
                "#0072b2",
              ],
              "line-width": [
                "step",
                [
                  "to-number",
                  [
                    "get",
                    "rank",
                  ],
                  0,
                ],
                1.5,
                5,
                3,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "borders",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "LineString",
                  "MultiLineString",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  "solid",
                  5,
                  "dashed",
                ],
                "dashed",
              ],
            ],
            "id": "mapcairn:districts:v1-line-dashed",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 4,
            "paint": {
              "line-color": [
                "step",
                [
                  "to-number",
                  [
                    "get",
                    "rank",
                  ],
                  0,
                ],
                "#0072b2",
                5,
                "#0072b2",
              ],
              "line-dasharray": [
                3,
                2,
              ],
              "line-width": [
                "step",
                [
                  "to-number",
                  [
                    "get",
                    "rank",
                  ],
                  0,
                ],
                1.5,
                5,
                3,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "borders",
            "type": "line",
          },
          {
            "filter": [
              "all",
              [
                "match",
                [
                  "geometry-type",
                ],
                [
                  "LineString",
                  "MultiLineString",
                ],
                true,
                false,
              ],
              [
                "==",
                [
                  "step",
                  [
                    "to-number",
                    [
                      "get",
                      "rank",
                    ],
                    0,
                  ],
                  "solid",
                  5,
                  "dashed",
                ],
                "dotted",
              ],
            ],
            "id": "mapcairn:districts:v1-line-dotted",
            "layout": {
              "line-join": "round",
            },
            "maxzoom": 16,
            "minzoom": 4,
            "paint": {
              "line-color": [
                "step",
                [
                  "to-number",
                  [
                    "get",
                    "rank",
                  ],
                  0,
                ],
                "#0072b2",
                5,
                "#0072b2",
              ],
              "line-dasharray": [
                1,
                2,
              ],
              "line-width": [
                "step",
                [
                  "to-number",
                  [
                    "get",
                    "rank",
                  ],
                  0,
                ],
                1.5,
                5,
                3,
              ],
            },
            "source": "mapcairn:districts",
            "source-layer": "borders",
            "type": "line",
          },
        ],
        "sources": {
          "mapcairn:districts": {
            "maxzoom": 14,
            "minzoom": 0,
            "tiles": [
              "https://vector.test/{z}/{x}/{y}.pbf",
            ],
            "type": "vector",
          },
        },
      }
    `);
  });

  it("draws a heatmap from points, and from a vector source", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    adapter.setHeatmapLayer("density", HEAT_POINTS);
    adapter.setHeatmapLayer("events", HEAT_VECTOR);
    expect(drawn(map)).toMatchInlineSnapshot(`
      {
        "images": [],
        "layers": [
          {
            "id": "mapcairn:density:heat",
            "paint": {
              "heatmap-color": [
                "interpolate",
                [
                  "linear",
                ],
                [
                  "heatmap-density",
                ],
                0,
                "rgba(68, 1, 84, 0)",
                0.3333333333333333,
                "rgba(68, 1, 84, 1)",
                0.6666666666666666,
                "rgba(33, 145, 140, 1)",
                1,
                "rgba(253, 231, 37, 1)",
              ],
              "heatmap-intensity": 1.5,
              "heatmap-opacity": 0.8,
              "heatmap-radius": 20,
              "heatmap-weight": [
                "get",
                "weight",
              ],
            },
            "source": "mapcairn:density",
            "type": "heatmap",
          },
          {
            "id": "mapcairn:events:heat",
            "maxzoom": 11,
            "minzoom": 5,
            "paint": {
              "heatmap-color": [
                "interpolate",
                [
                  "linear",
                ],
                [
                  "heatmap-density",
                ],
                0,
                "rgba(68, 1, 84, 0)",
                0.3333333333333333,
                "rgba(68, 1, 84, 1)",
                0.6666666666666666,
                "rgba(33, 145, 140, 1)",
                1,
                "rgba(253, 231, 37, 1)",
              ],
              "heatmap-intensity": 1.5,
              "heatmap-opacity": 0.8,
              "heatmap-radius": 20,
              "heatmap-weight": [
                "to-number",
                [
                  "get",
                  "size",
                ],
                1,
              ],
            },
            "source": "mapcairn:events",
            "source-layer": "events",
            "type": "heatmap",
          },
        ],
        "sources": {
          "mapcairn:density": {
            "data": {
              "features": [
                {
                  "geometry": {
                    "coordinates": [
                      2.35,
                      48.86,
                    ],
                    "type": "Point",
                  },
                  "properties": {
                    "weight": 3,
                  },
                  "type": "Feature",
                },
                {
                  "geometry": {
                    "coordinates": [
                      36.82,
                      -1.29,
                    ],
                    "type": "Point",
                  },
                  "properties": {
                    "weight": 1,
                  },
                  "type": "Feature",
                },
              ],
              "type": "FeatureCollection",
            },
            "type": "geojson",
          },
          "mapcairn:events": {
            "maxzoom": 14,
            "minzoom": 0,
            "tiles": [
              "https://vector.test/{z}/{x}/{y}.pbf",
            ],
            "type": "vector",
          },
        },
      }
    `);
  });

  it("reads the basemap's style for a label font only for kinds that label, and once per style", async () => {
    const { adapter, map } = await ready(VECTOR_BASEMAP);
    const getStyle = vi.spyOn(map, "getStyle");
    adapter.setFeatureLayer("pts", POINTS);
    adapter.setShapeLayer("detail", {
      colour: "#d55e00",
      geometries: [square],
    });
    adapter.setHeatmapLayer("density", HEAT_POINTS);
    expect(getStyle).not.toHaveBeenCalled();
    adapter.setStyledShapes("regions", AREAS);
    adapter.setVectorLayer("districts", VECTOR);
    adapter.setStyledShapes("routes", LINES);
    expect(getStyle).toHaveBeenCalledTimes(1);
  });
});
