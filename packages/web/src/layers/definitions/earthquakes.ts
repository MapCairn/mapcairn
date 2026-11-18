// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition } from "@mapcairn/core";

/**
 * USGS earthquakes from the live GeoJSON summary feeds. The feed file name
 * combines the period and whether smaller quakes are included, so it is a
 * derived variable. The hour is offered unfiltered only (its 2.5 feed is
 * usually empty) and the week at 2.5 and above only (the full week is over
 * 1 MB). USGS sends `max-age=60`, which the source honours.
 */
const earthquakes: FeedLayerDefinition = {
  id: "earthquakes",
  name: "layer.earthquakes.name",
  description: "layer.earthquakes.description",
  group: "layer.group.earthquakesAndVolcanoes",
  dataCost: "layer.earthquakes.dataCost",
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
      label: "layer.earthquakes.control.window.label",
      options: [
        {
          value: "hour",
          label: "layer.earthquakes.control.window.option.hour",
        },
        { value: "day", label: "layer.earthquakes.control.window.option.day" },
        {
          value: "week",
          label: "layer.earthquakes.control.window.option.week",
        },
      ],
      default: "day",
    },
    {
      kind: "switch",
      id: "small",
      label: "layer.earthquakes.control.small.label",
      description: "layer.earthquakes.control.small.description",
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
        { min: -10, label: "layer.earthquakes.key.1", colour: "ordinal-1" },
        { min: 2.5, label: "layer.earthquakes.key.2", colour: "ordinal-2" },
        { min: 4.5, label: "layer.earthquakes.key.3", colour: "ordinal-3" },
        { min: 6, label: "layer.earthquakes.key.4", colour: "ordinal-4" },
        { min: 7, label: "layer.earthquakes.key.5", colour: "ordinal-5" },
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
        "layer.earthquakes.key.1",
        "layer.earthquakes.key.2",
        "layer.earthquakes.key.3",
        "layer.earthquakes.key.4",
        "layer.earthquakes.key.5",
      ],
    },
  },
  card: {
    title: "{place}",
    lines: [
      {
        key: "earthquakes.card.magnitude",
        text: "Magnitude {magnitude|number}",
      },
      { key: "earthquakes.card.depth", text: "{depth|km} deep" },
      "{time|date} ({time|relative})",
    ],
    link: { field: "url", label: "layer.earthquakes.card.link" },
  },
  list: {
    secondary: {
      key: "earthquakes.list.secondary",
      text: "Magnitude {magnitude|number}, {time|relative}",
    },
    sorts: [
      {
        id: "newest",
        label: "layer.earthquakes.sort.newest",
        field: "time",
        direction: "desc",
      },
      {
        id: "strongest",
        label: "layer.earthquakes.sort.strongest",
        field: "magnitude",
        direction: "desc",
      },
    ],
  },
  emptyText: "layer.earthquakes.emptyText",
};

export default earthquakes;
