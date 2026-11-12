// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerFeature } from "@mapcairn/core";
import type { ServerLayerList } from "./serverMetadata";

/**
 * The made-up server's answer: four layers, as a host's own server might
 * describe them. Nothing requests it. `createExampleCatalogue` hands it to
 * `mapServerLayers`, and its URLs are never fetched: the fake layer source
 * answers with {@link SAMPLE_SERVER_FEATURES} instead.
 *
 * Three layers can be mapped (points coloured by category, polygons coloured
 * by class breaks, and raster tiles with a legend). `survey-notes` has no text
 * field to title a feature with, so the catalogue skips it and says why.
 */
export const SAMPLE_SERVER_LAYERS: ServerLayerList = {
  layers: [
    {
      id: "Huts_2024",
      title: "Mountain huts",
      description: "Huts a walker can shelter in, and whether each is open.",
      geometryType: "point",
      fields: [
        { name: "OBJECTID", label: "Record", type: "oid" },
        { name: "hut_name", label: "Name", type: "string" },
        { name: "status", label: "Status", type: "string" },
        { name: "elevation_m", label: "Elevation (m)", type: "integer" },
        { name: "last_checked", label: "Last checked", type: "date" },
        { name: "photo", label: "Photo", type: "blob" },
      ],
      renderer: {
        type: "uniqueValue",
        field: "status",
        values: [
          { value: "open", label: "Open" },
          { value: "locked", label: "Locked" },
        ],
        otherLabel: "Unknown",
      },
      service: {
        kind: "features",
        url: "https://example.org/server/huts/query?f=geojson",
      },
      visibleValues: { field: "status", values: ["open", "locked"] },
      approximateSize: "about 2 KB",
      credit: { text: "Example hut register", url: "https://example.org/" },
    },
    {
      id: "glens_rainfall",
      title: "Rainfall by glen",
      description: "Average yearly rainfall in each glen.",
      geometryType: "polygon",
      fields: [
        { name: "OBJECTID", label: "Record", type: "oid" },
        { name: "glen", label: "Glen", type: "string" },
        { name: "rain_mm", label: "Yearly rain (mm)", type: "double" },
      ],
      renderer: {
        type: "classBreaks",
        field: "rain_mm",
        breaks: [
          { min: 0, label: "Under 1,000 mm" },
          { min: 1000, label: "1,000 to 1,499 mm" },
          { min: 1500, label: "1,500 mm and over" },
        ],
      },
      service: {
        kind: "features",
        url: "https://example.org/server/glens/query?f=geojson",
      },
      approximateSize: "about 6 KB",
      credit: { text: "Example weather service", url: "https://example.org/" },
    },
    {
      id: "snow_cover",
      title: "Snow cover",
      description: "How much of each tile is under snow.",
      geometryType: "polygon",
      fields: [],
      renderer: { type: "simple", label: "Snow" },
      service: {
        kind: "tiles",
        url: "https://example.org/server/snow/{z}/{x}/{y}.png",
        tileSize: 256,
        maxZoom: 10,
        legend: [
          { label: "Patchy" },
          { label: "Mostly covered" },
          { label: "Deep" },
        ],
      },
      approximateSize: "about 40 KB a view",
      credit: { text: "Example weather service" },
    },
    {
      id: "survey-notes",
      title: "Survey notes",
      description: "Counts from a ground survey.",
      geometryType: "point",
      fields: [
        { name: "OBJECTID", label: "Record", type: "oid" },
        { name: "visitors", label: "Visitors", type: "integer" },
        { name: "cairns", label: "Cairns", type: "integer" },
      ],
      renderer: { type: "simple", label: "Survey point" },
      service: {
        kind: "features",
        url: "https://example.org/server/survey/query?f=geojson",
      },
      approximateSize: "about 1 KB",
      credit: { text: "Example survey" },
    },
  ],
};

/**
 * The decoded features the fake layer source returns for each mapped layer,
 * by the id `mapServerLayers` gives it.
 */
export const SAMPLE_SERVER_FEATURES: Readonly<
  Record<string, readonly LayerFeature[]>
> = {
  "huts-2024": [
    {
      id: "huts-1",
      geometry: { type: "Point", coordinates: [-3.72, 57.08] },
      fields: {
        title: "Corrour bothy",
        status: "open",
        elevation_m: 820,
        last_checked: "2026-10-02T09:30:00Z",
      },
    },
    {
      id: "huts-2",
      geometry: { type: "Point", coordinates: [-3.58, 57.03] },
      fields: {
        title: "Ridge refuge",
        status: "locked",
        elevation_m: 1010,
        last_checked: "2026-09-18T14:10:00Z",
      },
    },
  ],
  "glens-rainfall": [
    {
      id: "glen-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-3.8, 57.0],
            [-3.7, 57.0],
            [-3.7, 57.1],
            [-3.8, 57.1],
            [-3.8, 57.0],
          ],
        ],
      },
      fields: { title: "Glen Eagle", rain_mm: 1240 },
    },
  ],
};
