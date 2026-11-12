// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * The GloFAS 100-year flood hazard map (Copernicus CEMS), a static WMS layer
 * with no time dimension, so it has no date control. Dry areas return
 * near-empty tiles.
 */
const floodHazard: TileLayerDefinition = {
  id: "flood-hazard",
  name: "Flood hazard map",
  description:
    "Land a river flood with a 1 in 100 chance each year would cover, from the Copernicus Global Flood Awareness System. A long-term hazard map, not a forecast.",
  group: "Floods, storms and droughts",
  dataCost: "about 5 to 50 KB per screen",
  attribution: [
    {
      text: "Generated using Copernicus Emergency Management Service information {year}",
      url: "https://www.globalfloods.eu/",
    },
  ],
  disclaimer:
    "For information only. It shows where floods could reach, not where they are now.",
  controls: [
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.7 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://ows.globalfloods.eu/glofas-ows/ows.py?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=FloodHazard100y&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}",
    tileSize: 256,
    maxzoom: 10,
  },
};

export default floodHazard;
