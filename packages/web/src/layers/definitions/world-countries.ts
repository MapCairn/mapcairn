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
 *
 * Saving is allowed: the Natural Earth terms of use put all its vector data
 * in the public domain, for use in any manner including electronic
 * dissemination, and say crediting is unnecessary. The credit still travels
 * in the saved file.
 */
const worldCountries: FeedLayerDefinition<ShapeStyle> = {
  id: "world-countries",
  name: "layer.world-countries.name",
  description: "layer.world-countries.description",
  group: "layer.group.boundaries",
  attribution: [
    {
      text: "Made with Natural Earth",
      url: "https://www.naturalearthdata.com/",
    },
  ],
  disclaimer: "layer.world-countries.disclaimer",
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
          label: "layer.world-countries.key.1",
          colour: "ordinal-1",
          width: 0.8,
        },
        {
          min: 1_000_000,
          label: "layer.world-countries.key.2",
          colour: "ordinal-2",
          width: 1.2,
        },
        {
          min: 10_000_000,
          label: "layer.world-countries.key.3",
          colour: "ordinal-3",
          width: 1.8,
        },
        {
          min: 50_000_000,
          label: "layer.world-countries.key.4",
          colour: "ordinal-4",
          width: 2.6,
        },
        {
          min: 200_000_000,
          label: "layer.world-countries.key.5",
          colour: "ordinal-5",
          width: 3.6,
        },
      ],
    },
    label: { template: "{title}", minzoom: 3 },
  },
  card: {
    title: "{title}",
    lines: [
      {
        key: "world-countries.card.population",
        text: "Population about {population|number}",
      },
      "{continent}",
    ],
  },
  list: {
    secondary: {
      key: "world-countries.list.secondary",
      text: "About {population|number} people",
    },
    sorts: [
      {
        id: "name",
        label: "layer.world-countries.sort.name",
        field: "title",
        direction: "asc",
      },
      {
        id: "population",
        label: "layer.world-countries.sort.population",
        field: "population",
        direction: "desc",
      },
    ],
  },
  emptyText: "layer.world-countries.emptyText",
  saveFeatures: true,
};

export default worldCountries;
