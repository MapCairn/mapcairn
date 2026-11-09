import type { TileLayerDefinition } from "@karta/core";

/**
 * NASA's Black Marble: a cloud-free picture of the Earth's lights at night
 * from VIIRS, a single annual composite for 2016, as WMTS tiles. It has no
 * date control, because GIBS holds one image for it.
 */
const earthAtNight: TileLayerDefinition = {
  id: "earth-at-night",
  name: "Earth at night",
  description:
    "The lights of cities, roads and ships seen from space, as a cloud-free picture from 2016. Detail stops at about 500 m.",
  group: "Imagery",
  dataCost: "about 0.3 to 1 MB per screen",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
    {
      text: "VIIRS Black Marble night lights, NASA Earth Observatory",
      url: "https://blackmarble.gsfc.nasa.gov/",
    },
  ],
  controls: [
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.9 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 8,
  },
};

export default earthAtNight;
