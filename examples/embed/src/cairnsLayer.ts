import type {
  FeedLayerDefinition,
  LayerFeature,
  PointStyle,
} from "@mapcairn/core";

/**
 * The example's one data layer, written as an outside app would write it.
 * Its feed URL is never requested: the fake layer source answers with
 * {@link CAIRN_FEATURES} instead.
 */
export const CAIRNS_LAYER: FeedLayerDefinition<PointStyle> = {
  id: "example-cairns",
  name: "Cairns",
  description: "Three made-up cairns, served from memory.",
  group: "Example",
  dataCost: "nothing, it is in memory",
  attribution: [{ text: "Example data", url: "https://example.org/" }],
  controls: [],
  source: {
    kind: "feed",
    url: "https://example.org/cairns.geojson",
    decoder: "geojson",
    fields: { id: "id", title: "properties.name", height: "properties.height" },
  },
  style: { colour: { kind: "fixed", colour: "vermillion", label: "Cairn" } },
  card: { title: "{title}", lines: ["{height|number} m high"] },
  list: {
    secondary: "{height|number} m high",
    sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
  },
  emptyText: "No cairns to show.",
};

/** The decoded features the fake layer source returns for {@link CAIRNS_LAYER}. */
export const CAIRN_FEATURES: readonly LayerFeature[] = [
  {
    id: "north",
    geometry: { type: "Point", coordinates: [-3.7, 57.1] },
    fields: { title: "North cairn", height: 2 },
  },
  {
    id: "ridge",
    geometry: { type: "Point", coordinates: [-3.6, 57.05] },
    fields: { title: "Ridge cairn", height: 1.5 },
  },
  {
    id: "summit",
    geometry: { type: "Point", coordinates: [-3.65, 57.0] },
    fields: { title: "Summit cairn", height: 3 },
  },
];
