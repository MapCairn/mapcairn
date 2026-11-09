import type {
  BasemapAttributionEntry,
  BasemapDefinition,
} from "../ports/basemap";

/**
 * The basemap shown when nobody has chosen one, in both interface themes, and
 * the one an unknown or retired id (such as the old "auto" or "dark") falls back to.
 */
export const DEFAULT_BASEMAP_ID = "liberty";

/**
 * The default basemap's background (land) colour: the `background` layer of
 * the OpenFreeMap Liberty style, written as that style writes it. The server
 * paints the map region in this colour before the map loads, in both themes,
 * so the first view does not flash a different colour before Liberty draws.
 */
export const DEFAULT_BASEMAP_BACKGROUND = "#f8f4f0";

const OPEN_STREET_MAP_CREDIT: BasemapAttributionEntry = {
  text: "© OpenStreetMap contributors",
  href: "https://www.openstreetmap.org/copyright",
};

const OPEN_FREE_MAP_CREDITS: readonly BasemapAttributionEntry[] = [
  OPEN_STREET_MAP_CREDIT,
  { text: "OpenFreeMap", href: "https://openfreemap.org" },
  { text: "OpenMapTiles", href: "https://openmaptiles.org" },
];

const OPEN_FREE_MAP_STYLES = "https://tiles.openfreemap.org/styles";

// Normalised (256 px) zoom limits. MapLibre's own maximum of 22 counts 512 px
// tiles, which is 23 on this scale, so vector styles are capped at 22 here
// to stay inside what the styles publish.
const VECTOR_MAX_ZOOM = 22;

// The standard OpenStreetMap tile layer serves levels 0 to 19.
const OSM_MAX_ZOOM = 19;

const LIBERTY: BasemapDefinition = {
  id: "liberty",
  name: "Liberty",
  source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/liberty` },
  minZoom: 0,
  maxZoom: VECTOR_MAX_ZOOM,
  thumbnail: "/basemaps/liberty.jpg",
  attribution: OPEN_FREE_MAP_CREDITS,
  appearance: "light",
  // The Natural Earth shaded relief raster layer (source "ne2_shaded"), drawn
  // from zoom 0 to 7. It is 933 KB of a 2.7 MB first view of the world, and
  // the vector layers carry the same map without it.
  saveDataOmitLayers: ["natural_earth"],
};

/** Every built-in basemap, in the order the picker shows them, the default first. */
export const BASEMAPS: readonly BasemapDefinition[] = [
  LIBERTY,
  {
    id: "positron",
    name: "Positron",
    source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/positron` },
    minZoom: 0,
    maxZoom: VECTOR_MAX_ZOOM,
    thumbnail: "/basemaps/positron.jpg",
    attribution: OPEN_FREE_MAP_CREDITS,
    appearance: "light",
  },
  {
    // The OpenStreetMap Foundation's standard tile layer. Its usage policy
    // (operations.osmfoundation.org/policies/tiles) asks for visible
    // attribution and a valid Referer, which browsers send by default under
    // the site's `strict-origin-when-cross-origin` referrer policy.
    id: "osm",
    name: "Streets",
    source: {
      kind: "raster",
      tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      tileSize: 256,
    },
    minZoom: 0,
    maxZoom: OSM_MAX_ZOOM,
    thumbnail: "/basemaps/osm.jpg",
    attribution: [OPEN_STREET_MAP_CREDIT],
    appearance: "light",
  },
];

const BASEMAPS_BY_ID: ReadonlyMap<string, BasemapDefinition> = new Map(
  BASEMAPS.map((basemap) => [basemap.id, basemap]),
);

/** Finds a built-in basemap by id. */
export function getBasemap(id: string): BasemapDefinition | undefined {
  return BASEMAPS_BY_ID.get(id);
}

/**
 * Turns a stored or linked basemap id into a basemap.
 * @param choiceId - A basemap id.
 * @remarks The basemap does not depend on the interface theme. An id that
 *   names no built-in basemap (one that has been removed, such as "dark", or the retired
 *   "auto" choice from an earlier version) gives the default basemap.
 */
export function resolveBasemap(choiceId: string): BasemapDefinition {
  return getBasemap(choiceId) ?? LIBERTY;
}

/**
 * The style layer ids a basemap leaves out, given whether Save data is on.
 * Empty when it is off, or when the basemap names none.
 */
export function omittedLayers(
  basemap: BasemapDefinition,
  saveData: boolean,
): readonly string[] {
  return saveData ? (basemap.saveDataOmitLayers ?? []) : [];
}

/**
 * The credits of a basemap and the layers drawn over it as one line of
 * text, for a saved image that keeps its sources.
 */
export function creditsLine(
  basemap: BasemapDefinition,
  layerCredits: readonly { readonly text: string }[] = [],
): string {
  return [...buildAttribution(basemap), ...layerCredits]
    .map((credit) => credit.text)
    .join(" | ");
}

/** The credit for MapLibre GL JS, which draws every basemap. */
export const MAPLIBRE_CREDIT: BasemapAttributionEntry = {
  text: "MapLibre",
  href: "https://maplibre.org",
};

/**
 * The credits to show for a basemap: the provider's entries followed by
 * MapLibre's own credit.
 */
export function buildAttribution(
  basemap: BasemapDefinition,
): readonly BasemapAttributionEntry[] {
  return [...basemap.attribution, MAPLIBRE_CREDIT];
}
