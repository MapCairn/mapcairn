import type { FeedLayerDefinition } from "@karta/core";

/**
 * USGS earthquakes from the live GeoJSON summary feeds. The feed file name
 * combines the period and whether smaller quakes are included, so it is a
 * derived variable. The hour is offered unfiltered only (its 2.5 feed is
 * usually empty) and the week at 2.5 and above only (the full week is over
 * 1 MB). USGS sends `max-age=60`, which the source honours.
 */
const earthquakes: FeedLayerDefinition = {
  id: "earthquakes",
  name: "Earthquakes",
  description:
    "Earthquakes recorded by the US Geological Survey worldwide, updated about every minute.",
  group: "Earthquakes and volcanoes",
  dataCost: "about 30 KB, up to 220 KB for a week",
  attribution: [
    {
      text: "Credit: U.S. Geological Survey",
      url: "https://earthquake.usgs.gov/",
    },
  ],
  controls: [
    {
      kind: "segmented",
      id: "window",
      label: "Period",
      options: [
        { value: "hour", label: "Hour" },
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
      ],
      default: "day",
    },
    {
      kind: "switch",
      id: "small",
      label: "Include smaller earthquakes",
      description: "Below magnitude 2.5, for the past day. Up to about 130 KB.",
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
        "day|false": "2.5_day",
        "day|true": "all_day",
        "week|false": "2.5_week",
        "week|true": "2.5_week",
      },
    },
  ],
  source: {
    kind: "feed",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/{feed}.geojson",
    decoder: "geojson",
    fields: {
      id: "id",
      title: "properties.title",
      place: "properties.place",
      magnitude: "properties.mag",
      time: "properties.time",
      depth: "geometry.coordinates.2",
      url: "properties.url",
    },
  },
  style: {
    colour: {
      kind: "steps",
      field: "magnitude",
      steps: [
        { min: -10, label: "Below 2.5", colour: "ordinal-1" },
        { min: 2.5, label: "2.5 to 4.4", colour: "ordinal-2" },
        { min: 4.5, label: "4.5 to 5.9", colour: "ordinal-3" },
        { min: 6, label: "6 to 6.9", colour: "ordinal-4" },
        { min: 7, label: "7 and above", colour: "ordinal-5" },
      ],
    },
    size: {
      field: "magnitude",
      stops: [
        [-10, 4],
        [2.5, 6],
        [4.5, 9],
        [6, 12],
        [7, 16],
      ],
      labels: [
        "Below 2.5",
        "2.5 to 4.4",
        "4.5 to 5.9",
        "6 to 6.9",
        "7 and above",
      ],
    },
  },
  card: {
    title: "{place}",
    lines: [
      "Magnitude {magnitude|number}",
      "{depth|km} deep",
      "{time|date} ({time|relative})",
    ],
    link: { field: "url", label: "Details on the USGS site" },
  },
  list: {
    secondary: "Magnitude {magnitude|number}, {time|relative}",
    sorts: [
      { id: "newest", label: "Newest", field: "time", direction: "desc" },
      {
        id: "strongest",
        label: "Strongest",
        field: "magnitude",
        direction: "desc",
      },
    ],
  },
  emptyText: "No earthquakes in this period.",
};

export default earthquakes;
