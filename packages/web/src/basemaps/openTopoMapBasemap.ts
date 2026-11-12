import type {
  BasemapAttributionEntry,
  BasemapDefinition,
} from "@mapcairn/core";

// This file imports types only, so `scripts/generateBasemapThumbnails.mjs` can
// load it with plain Node, as it does the SDK's basemaps.

// OpenTopoMap renders levels 0 to 17; the server answers a deeper request with
// a blank placeholder tile (checked 2026-11-11), so the map stops at 17.
const OPEN_TOPO_MAP_MAX_ZOOM = 17;

// OpenTopoMap (opentopomap.org/about) is CC-BY-SA, "erlaubt deren kommerzielle
// Nutzung" (allows commercial use), with no fee and no key. Its credit is
// "Kartendaten: © OpenStreetMap-Mitwirkende, SRTM | Kartendarstellung: ©
// OpenTopoMap (CC-BY-SA)", given here in English. It asks that the server is
// not overloaded by mass downloads and gives no availability guarantee; it
// asks to be told of use, a short note that is a courtesy and not a code change.
// That is why the reference host defines it and the SDK does not: a volunteer-
// run server should not be handed the traffic of every app built on the SDK.
const OPEN_TOPO_MAP_CREDITS: readonly BasemapAttributionEntry[] = [
  {
    text: "© OpenStreetMap contributors",
    href: "https://www.openstreetmap.org/copyright",
  },
  {
    text: "SRTM",
    href: "https://www.earthdata.nasa.gov/data/instruments/srtm",
  },
  { text: "© OpenTopoMap", href: "https://opentopomap.org" },
  {
    text: "CC-BY-SA",
    href: "https://creativecommons.org/licenses/by-sa/3.0/",
  },
];

/**
 * The Topographic basemap of the reference host: OpenTopoMap raster tiles with
 * contour lines and shaded relief. It is defined here, not in the SDK, so an
 * app built on the SDK does not send its users to a volunteer-run tile server
 * unless its own host chooses to.
 */
export const OPEN_TOPO_MAP_BASEMAP: BasemapDefinition = {
  id: "topographic",
  name: "Topographic",
  source: {
    kind: "raster",
    tileUrl: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
    tileSize: 256,
  },
  minZoom: 0,
  maxZoom: OPEN_TOPO_MAP_MAX_ZOOM,
  attribution: OPEN_TOPO_MAP_CREDITS,
  appearance: "light",
};
