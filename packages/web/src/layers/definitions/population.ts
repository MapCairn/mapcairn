import type { TileLayerDefinition } from "@mapcairn/core";

/**
 * Gridded Population of the World (GPWv4) population density for 2020, served
 * by NASA GIBS from SEDAC as WMTS tiles. A static map with no date control.
 */
const population: TileLayerDefinition = {
  id: "population",
  name: "Where people live",
  description:
    "Population density across the world in 2020, from dark and empty to bright and crowded. Detail stops at about 5 km. Antarctica is not shown.",
  group: "People",
  dataCost: "about 20 to 100 KB per screen",
  attribution: [
    {
      text: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
      url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api",
    },
    {
      text: "Center for International Earth Science Information Network (CIESIN), Columbia University: Gridded Population of the World, Version 4 (GPWv4), NASA SEDAC",
      url: "https://sedac.ciesin.columbia.edu/data/collection/gpw-v4",
    },
  ],
  controls: [
    { kind: "opacity", id: "opacity", label: "Opacity", default: 0.75 },
  ],
  source: {
    kind: "tiles",
    tiles:
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png",
    tileSize: 256,
    maxzoom: 7,
    // GIBS serves opaque black and noisy grey filler south of 60 degrees south.
    // A flat map shows it as dark rectangles; a globe stretches the polar row of
    // tiles over the pole, so it shows as wedges meeting there.
    bounds: [-180, -60, 180, 85],
  },
};

export default population;
