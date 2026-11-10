import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * NASA GIBS thermal anomalies from MODIS on Terra, rendered by the GIBS WMS
 * endpoint (the native vector tiles did not answer when checked). MapLibre
 * fills `{bbox-epsg-3857}` for each tile. Data from 2026-02-10.
 */
const fireHotspots: TileLayerDefinition = {
  id: "fire-hotspots",
  name: "Fire hotspots",
  description:
    "Places where the MODIS sensor on the Terra satellite saw unusual heat on the chosen day, such as fires. Each mark is about 1 km.",
  group: "Fires",
  dataCost: "about 10 to 50 KB per screen",
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
      min: "2026-02-10",
      max: { daysAgo: 1 },
      default: { daysAgo: 1 },
    },
    { kind: "opacity", id: "opacity", label: "Opacity", default: 1 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_Thermal_Anomalies_All&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME={date}",
    tileSize: 256,
    maxzoom: 9,
  },
};

export default fireHotspots;
