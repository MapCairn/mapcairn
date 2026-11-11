import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * Rainfall estimated from satellites every half hour: the NASA GPM IMERG
 * 30-minute precipitation rate, served by NASA GIBS as WMTS tiles named by
 * the slot's start (`2026-11-11T14:30:00Z`), in millimetres of rain an hour,
 * on the same colour scale as the daily layer. Level 6 is the deepest tile
 * level. Probed on 2026-11-11: a slot first answered between about five and
 * three quarter hours and six hours ten minutes after it started (14:30 was
 * there at 20:14 UTC; 15:00 was a 404 until about 21:08), and the
 * capabilities document lagged an hour behind the tiles, so the newest slot
 * offered is seven hours back, worked out from the clock, never from the
 * capabilities. Recent slots come from the IMERG Early run and
 * older ones from the Final run. Tiles answer back to 2000-06-01; a slot GIBS
 * lacks answers 404, which shows as tiles that fail to load.
 */
const rainfallHalfHourly: TileLayerDefinition = {
  id: "rainfall-half-hourly",
  name: "Rainfall, half-hourly",
  description:
    "Rain estimated from satellites for the whole Earth, as the rain rate in one half hour in millimetres per hour (mm per hour). Rain runs from green (light, up to about 1) through yellow and orange (about 1 to 4) to red (about 5 to 20) and dark red (heavy, over 20; the scale stops at 53). Snow and other frozen precipitation use pale cyan, blue and purple over the same steps. Nothing is drawn below 0.1. Each half hour arrives six to seven hours late, and detail stops at about 10 km.",
  group: "Floods, storms and droughts",
  dataCost: "about 50 to 250 KB per screen",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
    {
      text: "GPM IMERG precipitation, Huffman, G. J., Stocker, E. F., Bolvin, D. T., Nelkin, E. J., Tan, J., NASA GES DISC",
      url: "https://doi.org/10.5067/GPM/IMERG/3B-HH-E/07",
    },
  ],
  disclaimer:
    "Not a forecast, and not for warnings. It is a satellite estimate, coarser than radar, and can miss or overstate rain. Recent half hours are early estimates that NASA revises later. For warnings, use your national weather service.",
  controls: [
    {
      kind: "datetime",
      id: "time",
      label: "Half hour shown",
      description:
        "A few half hours have no data. If tiles fail to load, try another time.",
      stepMinutes: 30,
      min: "2000-06-01t0000",
      max: { minutesAgo: 420 },
      default: { minutesAgo: 420 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.8 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate_30min/default/{time}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 6,
  },
};

export default rainfallHalfHourly;
