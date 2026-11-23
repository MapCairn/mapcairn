// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  FeedLayerDefinition,
  FeedShapeStyle,
  HeatmapLayerDefinition,
  LayerDefinition,
} from "@mapcairn/core";
import type { Page } from "@playwright/test";

/*
 * Layers of every kind, as data, for the layer-kind specs. The production
 * policy only lets the page reach certain origins, so each layer borrows an
 * allowed origin and the test answers it with `page.route`. Nothing real is
 * ever requested.
 */

const DATA_ORIGIN = "https://earthquake.usgs.gov/kinds";
const TILE_ORIGIN = "https://tiles.openfreemap.org/kinds";

/** The centre of the sample data: a generic point near Cairo. */
export const CENTRE = { lat: 30, lng: 31 };

const base = {
  group: "Kinds",
  attribution: [{ text: "Sample provider" }],
  controls: [],
} as const;

/** Two overlapping polygons, shaded by density with a pattern per class. */
export const AREAS: FeedLayerDefinition<FeedShapeStyle> = {
  ...base,
  id: "kind-areas",
  name: "Sample areas",
  description: "Overlapping areas shaded by density.",
  source: {
    kind: "feed",
    url: `${DATA_ORIGIN}/areas.json`,
    decoder: "geojson",
    fields: {
      id: "id",
      title: "properties.name",
      density: "properties.density",
    },
  },
  style: {
    kind: "shapes",
    geometry: "area",
    colour: {
      kind: "intervals",
      field: "density",
      min: 0,
      max: 300,
      ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
      unit: " per km²",
      patterns: ["solid", "dots", "crosshatch"],
    },
  },
  card: { title: "{title}", lines: ["Density {density|number} per km²"] },
  list: {
    secondary: "Density {density|number}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No areas.",
};

/** A deliberately unbroken unit label that should wrap inside the legend. */
export const LONG_UNIT = ` ${"measurements".repeat(20)}`;

const areaColour = AREAS.style.colour;
if (areaColour.kind !== "intervals") {
  throw new Error("The sample area layer must use interval colours.");
}

/** The area sample with an unbroken unit label for layout regressions. */
export const LONG_UNIT_AREAS: FeedLayerDefinition<FeedShapeStyle> = {
  ...AREAS,
  id: "kind-long-unit-areas",
  name: "Long-unit areas",
  style: {
    ...AREAS.style,
    colour: { ...areaColour, unit: LONG_UNIT },
  },
};

/** One point inside both polygons, so a tap at the centre finds three features. */
export const POINTS: LayerDefinition = {
  ...base,
  id: "kind-points",
  name: "Sample points",
  description: "A point in the middle of the areas.",
  source: {
    kind: "feed",
    url: `${DATA_ORIGIN}/points.json`,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
  },
  style: { colour: { kind: "fixed", colour: "blue", label: "Point" } },
  card: { title: "{title}", lines: [] },
  list: {
    secondary: "Point",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No points.",
};

/** A heatmap with radius, intensity and opacity controls. */
export const HEAT: HeatmapLayerDefinition = {
  ...base,
  id: "kind-heat",
  name: "Sample density",
  description: "How dense the sample points are.",
  controls: [
    {
      kind: "range",
      id: "radius",
      label: "Radius",
      min: 4,
      max: 80,
      step: 2,
      default: 20,
      unit: " px",
    },
    {
      kind: "range",
      id: "intensity",
      label: "Intensity",
      min: 0.1,
      max: 5,
      step: 0.1,
      default: 1,
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "feed",
    url: `${DATA_ORIGIN}/heat.json`,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", weight: "properties.weight" },
  },
  heatmap: {
    weightField: "weight",
    radius: { control: "radius" },
    intensity: { control: "intensity" },
    ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
    words: ["Sparse", "Moderate", "Dense"],
  },
  emptyText: "No points.",
};

/** The heatmap sample with an unbroken range-control unit label. */
export const LONG_UNIT_HEAT: HeatmapLayerDefinition = {
  ...HEAT,
  id: "kind-long-unit-heat",
  name: "Long-unit density",
  controls: HEAT.controls.map((control) =>
    control.id === "radius" && control.kind === "range"
      ? { ...control, unit: LONG_UNIT }
      : control,
  ),
};

/** A query layer that draws at most three features and starts at zoom 6. */
export const QUERY: LayerDefinition = {
  ...base,
  id: "kind-query",
  name: "Sample query",
  description: "Points requested for the part of the map in view.",
  source: {
    kind: "query",
    url: `${DATA_ORIGIN}/query?bbox={west},{south},{east},{north}&limit={limit}`,
    decoder: "geojson",
    fields: { id: "id", title: "properties.name" },
    maxFeatures: 3,
    minzoom: 6,
  },
  style: { colour: { kind: "fixed", colour: "orange", label: "Item" } },
  card: { title: "{title}", lines: [] },
  list: {
    secondary: "Item",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "Nothing in view.",
};

/** A vector tile layer that is visible from zoom 5 to 12. */
export const VECTOR: LayerDefinition = {
  ...base,
  id: "kind-vector",
  name: "Sample tiles",
  description: "Areas from sample vector tiles.",
  source: {
    kind: "vector-tiles",
    tiles: `${TILE_ORIGIN}/{z}/{x}/{y}.pbf`,
    maxzoom: 14,
  },
  minzoom: 5,
  maxzoom: 12,
  sourceLayers: [
    {
      sourceLayer: "areas",
      style: {
        kind: "shapes",
        geometry: "area",
        colour: {
          kind: "category",
          field: "kind",
          categories: [
            {
              value: "park",
              label: "Park",
              colour: "bluish-green",
              pattern: "dots",
            },
          ],
          other: { label: "Other area", colour: "orange" },
        },
        label: { template: "{name}" },
      },
    },
  ],
};

function square(
  centre: { lat: number; lng: number },
  half: number,
): [number, number][][] {
  const { lat, lng } = centre;
  return [
    [
      [lng - half, lat - half],
      [lng + half, lat - half],
      [lng + half, lat + half],
      [lng - half, lat + half],
      [lng - half, lat - half],
    ],
  ];
}

function collection(features: unknown[]): string {
  return JSON.stringify({ type: "FeatureCollection", features });
}

/** The requests each sample data route has answered. */
export interface KindRequests {
  readonly urls: string[];
}

/**
 * Answers the sample layers' data and tiles. Query requests come back with
 * four features, one over the cap of three, so the layer says to zoom in.
 */
export async function mockKindData(page: Page): Promise<KindRequests> {
  const requests: KindRequests = { urls: [] };
  await page.route(/earthquake\.usgs\.gov\/kinds\//, (route) => {
    const url = route.request().url();
    requests.urls.push(url);
    let body = collection([]);
    if (url.includes("/areas.json")) {
      body = collection([
        {
          type: "Feature",
          id: "big",
          properties: { name: "Big area", density: 250 },
          geometry: { type: "Polygon", coordinates: square(CENTRE, 2) },
        },
        {
          type: "Feature",
          id: "small",
          properties: { name: "Small area", density: 120 },
          geometry: { type: "Polygon", coordinates: square(CENTRE, 0.5) },
        },
      ]);
    } else if (url.includes("/points.json")) {
      body = collection([
        {
          type: "Feature",
          id: "middle",
          properties: { name: "Middle point" },
          geometry: { type: "Point", coordinates: [CENTRE.lng, CENTRE.lat] },
        },
      ]);
    } else if (url.includes("/heat.json")) {
      body = collection(
        [0, 1, 2, 3].map((index) => ({
          type: "Feature",
          id: `h${index}`,
          properties: { name: `Heat ${index}`, weight: index + 1 },
          geometry: {
            type: "Point",
            coordinates: [CENTRE.lng + index * 0.1, CENTRE.lat],
          },
        })),
      );
    } else if (url.includes("/query")) {
      const bbox = new URL(url).searchParams.get("bbox") ?? "0,0,0,0";
      const [west, south, east, north] = bbox.split(",").map(Number) as [
        number,
        number,
        number,
        number,
      ];
      body = collection(
        [0, 1, 2, 3].map((index) => ({
          type: "Feature",
          id: `q${index}`,
          properties: { name: `Item ${index}` },
          geometry: {
            type: "Point",
            coordinates: [
              west + ((east - west) * (index + 1)) / 5,
              south + (north - south) / 2,
            ],
          },
        })),
      );
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body,
    });
  });
  await page.route(/tiles\.openfreemap\.org\/kinds\//, (route) => {
    requests.urls.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/x-protobuf",
      headers: { "access-control-allow-origin": "*" },
      body: Buffer.alloc(0),
    });
  });
  return requests;
}

const IDENTIFY_ORIGIN = "https://tiles.openfreemap.org/identify";

/**
 * Raster layers that answer a tap, for the identify specs. Each asks
 * `{origin}/{key}/query` for a point and draws `{origin}/{key}/{z}/{x}/{y}.png`;
 * `mockIdentifyData` answers both. Their definitions differ only in name and
 * key, so a tap that finds something in both opens a list.
 */
function identifyLayer(
  key: string,
  name: string,
  attribution: string,
): LayerDefinition {
  return {
    ...base,
    id: `kind-identify-${key}`,
    name,
    description: `${name}, asked for at a tap.`,
    attribution: [{ text: attribution }],
    source: {
      kind: "tiles",
      tiles: `${IDENTIFY_ORIGIN}/${key}/{z}/{x}/{y}.png`,
      tileSize: 256,
      maxzoom: 12,
    },
    identify: {
      url: `${IDENTIFY_ORIGIN}/${key}/query?lng={lng}&lat={lat}`,
      decoder: "geojson",
      fields: { id: "id", title: "properties.name", depth: "properties.depth" },
      card: { title: "{title}", lines: ["Depth {depth|number} m"] },
    },
  };
}

/** A flood depth overlay that answers a tap. */
export const IDENTIFY_FLOOD = identifyLayer(
  "flood",
  "Sample flood depth",
  "Sample flood provider",
);

/** A second overlay that answers a tap, so one tap can ask two layers. */
export const IDENTIFY_RAIN = identifyLayer(
  "rain",
  "Sample rainfall",
  "Sample rain provider",
);

/** What a sample identify service does with a request. */
export type IdentifyMode = "found" | "nothing" | "error" | "hold";

/** The identify specs' view of the sample service. */
export interface IdentifyService {
  /** The identify requests made, in order, as full URLs. */
  readonly queries: string[];
  /** Sets what the layer with this key (`flood` or `rain`) does next. It answers nothing until set. */
  set(key: string, mode: IdentifyMode): void;
  /**
   * Answers every held request with one feature, as if the provider had been
   * slow and then answered. A request the page has since aborted is skipped.
   */
  release(): Promise<void>;
}

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/**
 * Answers the sample identify layers' tiles with a transparent picture and
 * their queries as scripted by {@link IdentifyService.set}: `found` is one
 * feature with no geometry, as a server sends for raster pixel values (so the
 * app places it at the tap), `nothing` an empty collection, `error` a 500 and
 * `hold` an answer that waits for {@link IdentifyService.release}. A layer
 * with no mode set finds nothing.
 */
export async function mockIdentifyData(page: Page): Promise<IdentifyService> {
  const modes = new Map<string, IdentifyMode>();
  const held: (() => Promise<void>)[] = [];
  const names: Record<string, string> = {
    flood: "Gauge 4",
    rain: "Rain gauge 7",
  };
  const found = (key: string) =>
    collection([
      {
        type: "Feature",
        id: `${key}-1`,
        properties: { name: names[key], depth: 1.5 },
        geometry: null,
      },
    ]);
  const service: IdentifyService = {
    queries: [],
    set: (key, mode) => {
      modes.set(key, mode);
    },
    release: async () => {
      await Promise.all(held.splice(0).map((answer) => answer()));
    },
  };
  await page.route(/tiles\.openfreemap\.org\/identify\//, (route) => {
    const url = route.request().url();
    const key = new URL(url).pathname.split("/")[2] ?? "";
    if (!url.includes("/query?")) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: TRANSPARENT_PNG,
      });
    }
    service.queries.push(url);
    const respond = (answer: IdentifyMode) =>
      answer === "error"
        ? route.fulfill({
            status: 500,
            headers: { "access-control-allow-origin": "*" },
            body: "",
          })
        : route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: answer === "found" ? found(key) : collection([]),
          });
    const mode = modes.get(key) ?? "nothing";
    if (mode === "hold") {
      held.push(() => respond("found").catch(() => undefined));
      return;
    }
    return respond(mode);
  });
  return service;
}
