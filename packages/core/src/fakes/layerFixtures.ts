import type {
  FeedLayerDefinition,
  TileLayerDefinition,
} from "../layers/definition";
import type { LayerFeature } from "../ports/layers";

/**
 * A feed layer that exercises every feed feature except `detail`: a
 * segmented and a conditional switch control, a derived URL variable, colour
 * steps with sizes, a card, a list and a filter. Generic names on purpose:
 * tests must not depend on any real provider.
 */
export const SAMPLE_FEED_LAYER: FeedLayerDefinition = {
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
export const SAMPLE_ALERT_LAYER: FeedLayerDefinition = {
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

/** Every sample definition, in a stable order. */
export const SAMPLE_LAYERS = [
  SAMPLE_FEED_LAYER,
  SAMPLE_ALERT_LAYER,
  SAMPLE_TILE_LAYER,
] as const;

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
