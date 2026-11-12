// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * How much warmer or cooler the sea surface is than normal, from the JPL MUR
 * analysis served by NASA GIBS as WMTS tiles, one image a day. Unusually warm
 * water along the equator in the eastern and central Pacific is the sign of
 * El Nino, and unusually cool water is La Nina. The newest images arrive a
 * couple of days late, so the newest date is three days ago, and the series
 * starts on 2026-01-11.
 */
const seaTemperatureAnomaly: TileLayerDefinition = {
  id: "sea-temperature-anomaly",
  name: "Sea temperature compared with normal",
  description:
    "Warm colours, from yellow to dark red, show sea water warmer than usual for the time of year. Grey is about normal, and cyan to blue is cooler. Unusually warm water along the equator in the Pacific is the sign of El Niño, and unusually cool water is La Niña. Detail stops at about 5 km.",
  group: "Oceans",
  dataCost: "about 20 to 60 KB per screen",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
    {
      text: "GHRSST Level 4 MUR sea surface temperature analysis, NASA JPL PO.DAAC",
      url: "https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1",
    },
  ],
  controls: [
    {
      kind: "date",
      id: "date",
      label: "Date",
      min: "2026-01-11",
      max: { daysAgo: 3 },
      default: { daysAgo: 3 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies/default/{date}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 7,
  },
};

export default seaTemperatureAnomaly;
