import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * NASA GIBS thermal anomalies from VIIRS on NOAA-21 at 375 m, through the
 * GIBS WMS endpoint. Sharper than MODIS and about five times heavier. Data
 * from 2025-09-04.
 */
const fireHotspotsViirs: TileLayerDefinition = {
  id: "fire-hotspots-viirs",
  name: "Fire hotspots, sharper",
  description:
    "The same kind of heat marks from the VIIRS sensor on the NOAA-21 satellite, at about 375 m. Uses about five times more data.",
  group: "Fires",
  dataCost: "about 50 to 250 KB per screen",
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
      min: "2025-09-04",
      max: { daysAgo: 1 },
      default: { daysAgo: 1 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 1 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_NOAA21_Thermal_Anomalies_375m_All&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME={date}",
    tileSize: 256,
    maxzoom: 9,
  },
};

export default fireHotspotsViirs;
