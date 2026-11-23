// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * Rainfall estimated from satellites: the NASA GPM IMERG daily precipitation
 * rate, served by NASA GIBS as WMTS tiles, one image a day, in millimetres of
 * rain an hour. GIBS makes each daily image from the 30-minute IMERG data (no
 * single published daily product matches it), so the credit points at those
 * collections. GIBS draws the colours, so the key is in the description (the
 * legend field only takes the interface's own data palette). Level 6 is the
 * deepest tile level. A day arrives two to three days late, so the newest
 * date offered is three days ago. The series starts on 2000-06-01 but some
 * days are missing (for example 2025-10-23 to 2025-10-29, 2026-01-08,
 * 2026-02-03, 2026-02-10 and 2026-02-11, and 2026-05-25 to 2026-05-26); GIBS
 * answers those with a 404, which shows as tiles that fail to load.
 */
const rainfall: TileLayerDefinition = {
  id: "rainfall",
  name: "layer.rainfall.name",
  description: "layer.rainfall.description",
  group: "layer.group.floodsStormsAndDroughts",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
    {
      text: "GPM IMERG precipitation, Huffman, G. J., Stocker, E. F., Bolvin, D. T., Nelkin, E. J., Tan, J., NASA GES DISC",
      url: "https://doi.org/10.5067/GPM/IMERG/3B-HH/07",
    },
  ],
  disclaimer: "layer.rainfall.disclaimer",
  controls: [
    {
      kind: "date",
      id: "date",
      label: "layer.control.date",
      description: "layer.rainfall.control.date.description",
      min: "2000-06-01",
      max: { daysAgo: 3 },
      default: { daysAgo: 3 },
    },
    {
      kind: "opacity",
      id: "opacity",
      label: "layer.control.opacity",
      default: 0.8,
    },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/{date}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 6,
  },
};

export default rainfall;
