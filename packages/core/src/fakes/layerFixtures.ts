import type {
  FeedLayerDefinition,
  HeatmapLayerDefinition,
  PointStyle,
  ShapeStyle,
  TileLayerDefinition,
  VectorTileLayerDefinition,
} from "../layers/definition";
import type { LayerFeature } from "../ports/layers";

/**
 * A feed layer that exercises every feed feature except `detail`: a
 * segmented and a conditional switch control, a derived URL variable, colour
 * steps with sizes, a card, a list and a filter. Generic names on purpose:
 * tests must not depend on any real provider.
 */
export const SAMPLE_FEED_LAYER: FeedLayerDefinition<PointStyle> = {
  id: "sample-points",
  name: "Sample points",
  description: "Points from a sample feed.",
  group: "Samples",
  dataCost: "about 30 KB",
  attribution: [{ text: "Sample provider", url: "https://sample.test/" }],
  controls: [
    {
      kind: "segmented",
      id: "window",
      label: "Period",
      options: [
        { value: "hour", label: "Hour" },
        { value: "day", label: "Day" },
      ],
      default: "day",
    },
    {
      kind: "switch",
      id: "small",
      label: "Include small values",
      default: false,
      enabledWhen: { control: "window", in: ["day"] },
    },
  ],
  variables: [
    {
      id: "feed",
      from: ["window", "small"],
      table: {
        "hour|false": "all_hour",
        "hour|true": "all_hour",
        "day|false": "big_day",
        "day|true": "all_day",
      },
    },
  ],
  source: {
    kind: "feed",
    url: "https://sample.test/feed/{feed}.json",
    decoder: "geojson",
    fields: {
      id: "id",
      title: "properties.title",
      value: "properties.value",
      time: "properties.time",
      kind: "properties.kind",
      depth: "geometry.coordinates.2",
      url: "properties.url",
    },
    filter: { field: "kind", in: ["keep"] },
  },
  style: {
    colour: {
      kind: "steps",
      field: "value",
      steps: [
        { min: 0, label: "Below 3", colour: "ordinal-1" },
        { min: 3, label: "3 to 5", colour: "ordinal-3" },
        { min: 5, label: "5 and above", colour: "ordinal-5" },
      ],
    },
    size: {
      field: "value",
      stops: [
        [0, 4],
        [3, 7],
        [5, 11],
      ],
      labels: ["Below 3", "3 to 5", "5 and above"],
    },
  },
  card: {
    title: "{title}",
    lines: ["Value {value|number}", "{depth|km} deep", "{time|relative}"],
    link: { field: "url", label: "Details at the source" },
  },
  list: {
    secondary: "{time|relative}",
    sorts: [
      { id: "newest", label: "Newest", field: "time", direction: "desc" },
      { id: "largest", label: "Largest", field: "value", direction: "desc" },
    ],
  },
  emptyText: "No sample points right now.",
};

/**
 * A feed layer coloured by category, with a distinct shape for each, an
 * on-demand detail source and a disclaimer.
 */
export const SAMPLE_ALERT_LAYER: FeedLayerDefinition<PointStyle> = {
  id: "sample-alerts",
  name: "Sample alerts",
  description: "Alerts from a sample feed.",
  group: "Samples",
  dataCost: "about 130 KB",
  attribution: [{ text: "Sample alerts provider" }],
  disclaimer: "Automatic estimates. Check official sources before acting.",
  controls: [],
  source: {
    kind: "feed",
    url: "https://alerts.test/events",
    decoder: "geojson",
    fields: {
      id: "properties.eventid",
      title: "properties.name",
      level: "properties.alertlevel",
      severity: "properties.severitydata.severitytext",
      from: "properties.fromdate",
      area: "properties.url.geometry",
    },
  },
  style: {
    colour: {
      kind: "category",
      field: "level",
      categories: [
        {
          value: "Green",
          label: "Green alert",
          colour: "bluish-green",
          shape: "circle",
        },
        {
          value: "Orange",
          label: "Orange alert",
          colour: "orange",
          shape: "square",
        },
        {
          value: "Red",
          label: "Red alert",
          colour: "vermillion",
          shape: "triangle",
        },
      ],
      other: { label: "Other", colour: "sky-blue" },
    },
  },
  card: {
    title: "{title}",
    lines: ["{level} alert", "{severity}", "From {from|date}"],
  },
  list: {
    secondary: "{level} alert, {from|relative}",
    sorts: [
      { id: "newest", label: "Newest", field: "from", direction: "desc" },
    ],
  },
  detail: {
    urlField: "area",
    origins: ["https://alerts.test"],
    decoder: "geojson",
    colour: "vermillion",
    label: "Show affected area",
    dataCost: "about 300 KB",
  },
  emptyText: "No sample alerts right now.",
};

/**
 * A feed of polygons shaded in equal intervals over a numeric field, with a
 * pattern per class and a text label. Generic names on purpose.
 */
export const SAMPLE_AREA_LAYER: FeedLayerDefinition<ShapeStyle> = {
  id: "sample-areas",
  name: "Sample areas",
  description: "Polygons from a sample feed, shaded by density.",
  group: "Samples",
  dataCost: "about 20 KB",
  attribution: [{ text: "Sample areas provider" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://areas.test/regions.json",
    decoder: "geojson",
    fields: {
      id: "id",
      title: "properties.name",
      density: "properties.density",
      kind: "properties.kind",
    },
  },
  style: {
    kind: "shapes",
    geometry: "area",
    fillOpacity: 0.6,
    colour: {
      kind: "intervals",
      field: "density",
      min: 0,
      max: 300,
      ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
      unit: " per km²",
      patterns: ["solid", "dots", "crosshatch"],
    },
    label: { template: "{title}", minzoom: 3 },
  },
  card: { title: "{title}", lines: ["Density {density|number} per km²"] },
  list: {
    secondary: "Density {density|number}",
    sorts: [
      { id: "densest", label: "Densest", field: "density", direction: "desc" },
      { id: "name", label: "Name", field: "title", direction: "asc" },
    ],
  },
  emptyText: "No sample areas right now.",
};

/** A feed of lines coloured by category, each with its own width and dash. */
export const SAMPLE_LINE_LAYER: FeedLayerDefinition<ShapeStyle> = {
  id: "sample-lines",
  name: "Sample lines",
  description: "Lines from a sample feed, drawn by kind.",
  group: "Samples",
  dataCost: "about 10 KB",
  attribution: [{ text: "Sample lines provider" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://lines.test/routes.json",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", kind: "properties.kind" },
  },
  style: {
    kind: "shapes",
    geometry: "line",
    colour: {
      kind: "category",
      field: "kind",
      categories: [
        { value: "main", label: "Main route", colour: "vermillion", width: 5 },
        {
          value: "side",
          label: "Side route",
          colour: "blue",
          width: 3,
          dash: "dashed",
        },
      ],
      other: { label: "Other route", colour: "orange", dash: "dotted" },
    },
  },
  card: { title: "{title}", lines: [] },
  list: {
    secondary: "{kind}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No sample lines right now.",
};

/**
 * A query layer: it asks only for the features inside the view, and draws at
 * most three of them (a small cap, so tests reach it with a few features).
 */
export const SAMPLE_QUERY_LAYER: FeedLayerDefinition<PointStyle> = {
  id: "sample-query",
  name: "Sample query",
  description: "Points requested for the part of the map in view.",
  group: "Samples",
  dataCost: "a few KB per screen",
  attribution: [{ text: "Sample query provider" }],
  controls: [],
  source: {
    kind: "query",
    url: "https://query.test/items?bbox={west},{south},{east},{north}&limit={limit}",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", value: "properties.value" },
    maxFeatures: 3,
    minzoom: 4,
  },
  style: { colour: { kind: "fixed", colour: "blue", label: "Item" } },
  card: { title: "{title}", lines: ["Value {value|number}"] },
  list: {
    secondary: "Value {value|number}",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "Nothing in view.",
};

/** A heatmap of a feed, with radius and intensity controls beside the opacity. */
export const SAMPLE_HEATMAP_LAYER: HeatmapLayerDefinition = {
  id: "sample-heat",
  name: "Sample density",
  description: "How dense the points of a sample feed are.",
  group: "Samples",
  dataCost: "about 40 KB",
  attribution: [{ text: "Sample density provider" }],
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
    url: "https://heat.test/points.json",
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
  emptyText: "No sample points.",
};

/**
 * A vector tile layer with three source layers: shaded areas with labels,
 * roads by rank over a narrower zoom window, and a heatmap of events.
 */
export const SAMPLE_VECTOR_LAYER: VectorTileLayerDefinition = {
  id: "sample-districts",
  name: "Sample districts",
  description: "Areas, roads and events from sample vector tiles.",
  group: "Samples",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Sample tiles provider" }],
  controls: [],
  source: {
    kind: "vector-tiles",
    tiles: "https://vector.test/{z}/{x}/{y}.pbf",
    minzoom: 0,
    maxzoom: 14,
  },
  minzoom: 2,
  maxzoom: 18,
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
            {
              value: "water",
              label: "Water",
              colour: "sky-blue",
              pattern: "stripes",
            },
          ],
          other: { label: "Other area", colour: "orange" },
        },
        label: { template: "{name}", minzoom: 6 },
      },
    },
    {
      sourceLayer: "roads",
      minzoom: 8,
      style: {
        kind: "shapes",
        geometry: "line",
        colour: {
          kind: "steps",
          field: "rank",
          steps: [
            { min: 0, label: "Minor road", colour: "ordinal-2", width: 1.5 },
            {
              min: 5,
              label: "Major road",
              colour: "ordinal-4",
              width: 4,
              dash: "dashed",
            },
          ],
        },
      },
    },
    {
      sourceLayer: "events",
      heatmap: {
        weightField: "size",
        radius: 16,
        intensity: 1,
        ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
        words: ["Few events", "Some events", "Many events"],
      },
    },
  ],
};

/** A raster overlay with a bounded date and an opacity control. */
export const SAMPLE_TILE_LAYER: TileLayerDefinition = {
  id: "sample-imagery",
  name: "Sample imagery",
  description: "Daily sample imagery.",
  group: "Imagery",
  dataCost: "about 1 MB per screen",
  attribution: [{ text: "Sample imagery provider" }],
  controls: [
    {
      kind: "date",
      id: "date",
      label: "Date",
      min: "2024-02-29",
      max: { daysAgo: 1 },
      default: { daysAgo: 1 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "tiles",
    tiles: "https://tiles.test/{date}/{z}/{y}/{x}.jpg",
    tileSize: 256,
    maxzoom: 9,
  },
};

/**
 * A raster overlay named by half hour, with a date and time control whose
 * newest slot is six hours back, and an opacity control.
 */
export const SAMPLE_TIME_LAYER: TileLayerDefinition = {
  id: "sample-rain",
  name: "Sample rain",
  description: "Half-hourly sample rain, about six hours behind.",
  group: "Imagery",
  dataCost: "about 100 KB per screen",
  attribution: [{ text: "Sample rain provider" }],
  controls: [
    {
      kind: "datetime",
      id: "time",
      label: "Time shown",
      description: "Some half hours have no data.",
      stepMinutes: 30,
      min: "2000-06-01t0000",
      max: { minutesAgo: 360 },
      default: { minutesAgo: 360 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "tiles",
    tiles: "https://tiles.test/rain/{time}/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 6,
  },
};

/** Every sample definition, in a stable order. */
export const SAMPLE_LAYERS = [
  SAMPLE_FEED_LAYER,
  SAMPLE_ALERT_LAYER,
  SAMPLE_TILE_LAYER,
] as const;

/** A square polygon feature around `centre`, half a degree across by default, for {@link SAMPLE_AREA_LAYER}. */
export function sampleArea(
  id: string,
  fields: LayerFeature["fields"] = {},
  centre: readonly [number, number] = [2.35, 48.85],
  half = 0.25,
): LayerFeature {
  const [lng, lat] = centre;
  const ring: [number, number][] = [
    [lng - half, lat - half],
    [lng + half, lat - half],
    [lng + half, lat + half],
    [lng - half, lat + half],
    [lng - half, lat - half],
  ];
  return {
    id,
    geometry: { type: "Polygon", coordinates: [ring] },
    fields: { id, title: `Area ${id}`, ...fields },
  };
}

/** A two-point line feature, for {@link SAMPLE_LINE_LAYER}. */
export function sampleLine(
  id: string,
  fields: LayerFeature["fields"] = {},
  from: readonly [number, number] = [2.35, 48.85],
  to: readonly [number, number] = [36.82, -1.29],
): LayerFeature {
  return {
    id,
    geometry: { type: "LineString", coordinates: [from, to] },
    fields: { id, title: `Line ${id}`, ...fields },
  };
}

/** A decoded point feature for {@link SAMPLE_FEED_LAYER}. */
export function samplePoint(
  id: string,
  fields: LayerFeature["fields"] = {},
  position: readonly [number, number] = [18.4, -33.9],
): LayerFeature {
  return {
    id,
    geometry: { type: "Point", coordinates: position },
    fields: { id, title: `Point ${id}`, ...fields },
  };
}
