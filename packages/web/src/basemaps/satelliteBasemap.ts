import type {
  BasemapAttributionEntry,
  BasemapDefinition,
} from "@mapcairn/core";

// This file imports types only, so `scripts/generateBasemapThumbnails.mjs` can
// load it with plain Node, as it does the SDK's basemaps.

/**
 * The year of the EOX Sentinel-2 cloudless layer the map draws. EOX publishes
 * one layer a year; the layer id and the credit both name it, so they change
 * together. The 2025 layer was the newest on 2026-11-11 (2026 answered 404).
 */
export const SATELLITE_IMAGERY_YEAR = "2025";

// Sentinel-2 imagery is 10 m a pixel, about tile level 14. EOX serves deeper
// levels too, but they are level 14 enlarged (checked 2026-11-11), so the map
// asks for nothing deeper and lets MapLibre enlarge it instead.
const SATELLITE_MAX_TILE_ZOOM = 14;

// Deep enough to read street names over the enlarged imagery, which is blurred
// by then; deeper would show nothing more of it.
const SATELLITE_MAX_ZOOM = 17;

// EOX's non-commercial licence page (cloudless.eox.at, checked 2026-11-11):
// the 2018 to 2025 layers are CC BY-NC-SA 4.0, "free to use for non-commercial
// purposes, provided appropriate attribution is given", and the credit is
// "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains
// modified Copernicus Sentinel data <year>)". It is kept word for word, with the
// address in the text, so a saved image, which cannot carry links, still names
// it. The tile service's own page (maps.eox.at, checked 2026-11-11) adds "We
// just ask for a link back to EOX::Maps as well as appropriate attribution",
// so that link follows the licence. The labels and roads are OpenFreeMap's, so
// their credits come last.
const SATELLITE_CREDITS: readonly BasemapAttributionEntry[] = [
  {
    text: `EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data ${SATELLITE_IMAGERY_YEAR})`,
    href: "https://cloudless.eox.at",
  },
  {
    text: "CC BY-NC-SA 4.0",
    href: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  },
  { text: "EOX::Maps", href: "https://maps.eox.at" },
  {
    text: "© OpenStreetMap contributors",
    href: "https://www.openstreetmap.org/copyright",
  },
  { text: "OpenFreeMap", href: "https://openfreemap.org" },
  { text: "OpenMapTiles", href: "https://openmaptiles.org" },
];

/**
 * The Satellite basemap of the reference host: EOX's Sentinel-2 cloudless
 * imagery with the place names, roads and borders of OpenFreeMap Bright over
 * it. The imagery's licence is non-commercial, so it is defined here and never
 * in the SDK, which stays free for commercial use, and it is marked so that no
 * agent tool offers it. EOX's tile service is a free demo with no guarantee and
 * rate limits, which is what basemap-unavailable detection is for.
 */
export const SATELLITE_BASEMAP: BasemapDefinition = {
  id: "satellite",
  name: "Satellite",
  source: {
    kind: "hybrid",
    // The EOX WMTS in Web Mercator ("g" is its GoogleMapsCompatible tile
    // matrix set), which puts the row before the column.
    tileUrl: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-${SATELLITE_IMAGERY_YEAR}_3857/default/g/{z}/{y}/{x}.jpg`,
    tileSize: 256,
    maxTileZoom: SATELLITE_MAX_TILE_ZOOM,
    labelStyleUrl: "https://tiles.openfreemap.org/styles/bright",
    labelSourceLayers: [
      "transportation",
      "transportation_name",
      "boundary",
      "place",
      "water_name",
      "aerodrome_label",
    ],
    // Bright's dashed ferry routes (a `transportation` layer) streak the sea
    // over imagery at every zoom, so they are left out.
    labelOmitLayers: ["ferry"],
  },
  minZoom: 0,
  maxZoom: SATELLITE_MAX_ZOOM,
  attribution: SATELLITE_CREDITS,
  appearance: "dark",
  // A dark green of the host's own choosing, not sampled from the imagery, so
  // the plain tile Save data mode shows reads as a dark map.
  swatch: "#2b3a2e",
  nonCommercial: true,
};
