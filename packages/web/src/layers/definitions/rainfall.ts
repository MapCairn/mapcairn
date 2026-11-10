import type { TileLayerDefinition } from "@karta/core";

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
  name: "Rainfall",
  description:
    "Rain estimated from satellites for the whole Earth, as the rain rate for the chosen day in millimetres per hour (mm per hour). Rain runs from green (light, up to about 1) through yellow and orange (about 1 to 4) to red (about 5 to 20) and dark red (heavy, over 20; the scale stops at 53). Snow and other frozen precipitation use pale cyan, blue and purple over the same steps. Nothing is drawn below 0.1. Each day arrives two to three days late, and detail stops at about 10 km.",
  group: "Floods, storms and droughts",
  dataCost: "about 50 to 160 KB per screen",
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
  disclaimer:
    "Not a forecast, and not for warnings. It is a satellite estimate, coarser than radar, and can miss or overstate rain. For warnings, use your national weather service.",
  controls: [
    {
      kind: "date",
      id: "date",
      label: "Date",
      description:
        "A few days have no data. If tiles fail to load, try the day before or after.",
      min: "2000-06-01",
      max: { daysAgo: 3 },
      default: { daysAgo: 3 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
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
