// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerDefinition } from "@mapcairn/core";

/*
 * Layers for the scripted catalogue specs, as data. Each one reads the USGS
 * earthquake feed, an origin the production policy allows and
 * `mockLayerProviders` answers, so turning one on requests nothing real.
 */

/** The feed every catalogue layer reads, which `mockLayerProviders` answers. */
const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

/** A feed layer with this id and name, in a group of its own. */
export function catalogueLayer(
  id: string,
  name: string,
  group: string,
): LayerDefinition {
  return {
    id,
    name,
    description: `${name}, from a scripted catalogue.`,
    group,
    dataCost: "about 30 KB",
    attribution: [{ text: "Credit: U.S. Geological Survey" }],
    controls: [],
    source: {
      kind: "feed",
      url: FEED_URL,
      decoder: "geojson",
      fields: { id: "id", title: "properties.title" },
    },
    style: { colour: { kind: "fixed", colour: "blue", label: name } },
    card: { title: "{title}", lines: [] },
    list: {
      secondary: name,
      sorts: [{ id: "name", label: "Name", field: "title", direction: "asc" }],
    },
    emptyText: "Nothing here.",
  };
}

/** Two layers in two groups, which a scripted catalogue offers. */
export const RAINFALL = catalogueLayer("catalogue-rain", "Rainfall", "Weather");
export const WINDS = catalogueLayer("catalogue-wind", "Winds", "Weather");
export const QUAKES = catalogueLayer("catalogue-quakes", "Quakes", "Hazards");

/** A definition no catalogue accepts, which is skipped and counted. */
export const BROKEN: object = { id: "catalogue-broken" };
