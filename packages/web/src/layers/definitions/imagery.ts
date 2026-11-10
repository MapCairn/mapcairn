import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * NASA GIBS daily true-colour imagery from VIIRS on NOAA-21, as WMTS tiles.
 * GIBS stops at level 9, so the engine scales the tiles beyond it and the
 * opacity control lets people read the street map through them. NOAA-21 runs
 * daily from 2024-02-29; today is partial, so the newest day is yesterday.
 */
const imagery: TileLayerDefinition = {
  id: "imagery",
  name: "Satellite imagery",
  description:
    "A daily true-colour picture of the whole Earth from the NOAA-21 satellite. Detail stops at about 300 m.",
  group: "Imagery",
  dataCost: "about 0.5 to 1 MB per screen",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
  ],
  controls: [
    {
      kind: "date",
      id: "date",
      label: "Date",
      min: "2024-02-29",
      max: { daysAgo: 1 },
      default: { daysAgo: 1 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.85 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
    tileSize: 256,
    maxzoom: 9,
  },
};

export default imagery;
