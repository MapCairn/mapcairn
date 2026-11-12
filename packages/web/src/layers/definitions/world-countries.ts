// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { FeedLayerDefinition, ShapeStyle } from "@mapcairn/core";

/**
 * Country outlines from Natural Earth, shaded by estimated population in
 * five graduated classes. It shows the polygon style: the classes are
 * ordered ordinal colours, and the outline gets thicker with each class, so
 * the order never rests on colour alone. The file is served by a public
 * content delivery network, pinned to a release tag so it cannot change
 * under the layer, and the whole world is about 840 KB.
 */
const worldCountries: FeedLayerDefinition<ShapeStyle> = {
  id: "world-countries",
  name: "Countries by population",
  description:
    "Country outlines shaded by estimated population, from Natural Earth.",
  group: "Boundaries",
  dataCost: "about 840 KB",
  attribution: [
    {
      text: "Made with Natural Earth",
      url: "https://www.naturalearthdata.com/",
    },
  ],
  disclaimer: "Population figures are estimates, not official counts.",
  controls: [],
  source: {
    kind: "feed",
    url: "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson",
    decoder: "geojson",
    fields: {
      id: "properties.ADM0_A3",
      title: "properties.NAME",
      population: "properties.POP_EST",
      continent: "properties.CONTINENT",
    },
  },
  style: {
    kind: "shapes",
    geometry: "area",
    fillOpacity: 0.65,
    colour: {
      kind: "steps",
      field: "population",
      steps: [
        {
          min: 0,
          label: "Under 1 million",
          colour: "ordinal-1",
          width: 0.8,
        },
        {
          min: 1_000_000,
          label: "1 to 10 million",
          colour: "ordinal-2",
          width: 1.2,
        },
        {
          min: 10_000_000,
          label: "10 to 50 million",
          colour: "ordinal-3",
          width: 1.8,
        },
        {
          min: 50_000_000,
          label: "50 to 200 million",
          colour: "ordinal-4",
          width: 2.6,
        },
        {
          min: 200_000_000,
          label: "200 million and above",
          colour: "ordinal-5",
          width: 3.6,
        },
      ],
    },
    label: { template: "{title}", minzoom: 3 },
  },
  card: {
    title: "{title}",
    lines: ["Population about {population|number}", "{continent}"],
  },
  list: {
    secondary: "About {population|number} people",
    sorts: [
      { id: "name", label: "Name", field: "title", direction: "asc" },
      {
        id: "population",
        label: "Most people",
        field: "population",
        direction: "desc",
      },
    ],
  },
  emptyText: "No countries could be shown.",
};

export default worldCountries;
