import type {
  BasemapAttributionEntry,
  BasemapDefinition,
} from "../ports/basemap";

/**
 * The basemap shown when nobody has chosen one, in both interface themes, and
 * the one an unknown or retired id (such as the old "auto") falls back to.
 */
export const DEFAULT_BASEMAP_ID = "bright";

/**
 * The default basemap's background (land) colour: the `background` layer of
 * the OpenFreeMap Bright style, written as that style writes it (Liberty's is
 * the same). The server paints the map region in this colour before the map
 * loads, in both themes, so the first view does not flash a different colour
 * before Bright draws.
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

// The public VersaTiles tile server
// (docs.versatiles.org/guides/use_tiles_versatiles_org.html) is free and open
// to everyone, with no key and no registration, "without any guarantees". Its
// guide says "Our pre-built styles already contain the required attribution":
// OpenStreetMap contributors, and for the land cover tiles "ESA WorldCover 2021
// (CC BY 4.0)". The land cover tiles also carry ESA's own wording, which the
// tilesets page (docs.versatiles.org/basics/tilesets.html) and ESA's download
// page give as the required credit when the data is shown in a map, so that
// longer text is shown in full, with the licence linked as CC BY 4.0 asks. The
// image export wraps long credits onto more lines. VersaTiles asks for no credit
// of its own; it is named as the provider.
const VERSATILES_CREDITS: readonly BasemapAttributionEntry[] = [
  OPEN_STREET_MAP_CREDIT,
  { text: "VersaTiles", href: "https://versatiles.org" },
  {
    text: "© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium",
    href: "https://esa-worldcover.org/en/data-access",
  },
  {
    text: "CC BY 4.0",
    href: "https://creativecommons.org/licenses/by/4.0/",
  },
];

// Normalised (256 px) zoom limits. MapLibre's own maximum of 22 counts 512 px
// tiles, which is 23 on this scale, so vector styles are capped at 22 here
// to stay inside what the styles publish.
const VECTOR_MAX_ZOOM = 22;

// The standard OpenStreetMap tile layer serves levels 0 to 19.
const OSM_MAX_ZOOM = 19;

const BRIGHT: BasemapDefinition = {
  id: "bright",
  name: "Bright",
  source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/bright` },
  minZoom: 0,
  maxZoom: VECTOR_MAX_ZOOM,
  thumbnail: "/basemaps/bright.jpg",
  attribution: OPEN_FREE_MAP_CREDITS,
  appearance: "light",
  // Nothing to leave out in Save data mode: the style names the Natural Earth
  // raster source but draws no raster layer from it, so every byte of its first
  // view is vector tiles, glyphs and the sprite.
};

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

const COLORFUL: BasemapDefinition = {
  id: "colorful",
  name: "Colorful",
  source: {
    kind: "vector",
    styleUrl: "https://tiles.versatiles.org/assets/styles/colorful/style.json",
  },
  minZoom: 0,
  maxZoom: VECTOR_MAX_ZOOM,
  thumbnail: "/basemaps/colorful.jpg",
  attribution: VERSATILES_CREDITS,
  appearance: "light",
  // Nothing is left out in Save data mode, on purpose. The style draws only
  // vector layers, no raster. Its nine `landcover-*` fill layers read a second
  // tileset that is 27 to 40 percent of the bytes of a typical zoom 4 to 6 tile
  // pair (measured 2026-11-11), but they are the style's land colouring (forest,
  // farmland, grass) at every zoom up to 12, so leaving them out would turn
  // Colorful into a plain map. Its background, rgb(248,244,240), is the default
  // land colour, so the plain tile Save data mode shows needs no swatch of its
  // own.
};

const FIORD: BasemapDefinition = {
  id: "fiord",
  name: "Fiord",
  source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/fiord` },
  minZoom: 0,
  maxZoom: VECTOR_MAX_ZOOM,
  thumbnail: "/basemaps/fiord.jpg",
  attribution: OPEN_FREE_MAP_CREDITS,
  appearance: "dark",
  // Fiord's own land colour (the `background` layer of its style), so the
  // plain tile Save data mode shows reads as a dark map, not as Bright's.
  swatch: "#45516e",
  // Nothing to leave out in Save data mode: like Bright, the style names the
  // Natural Earth raster source but draws no raster layer from it.
};

const DARK: BasemapDefinition = {
  id: "dark",
  name: "Dark",
  source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/dark` },
  minZoom: 0,
  maxZoom: VECTOR_MAX_ZOOM,
  thumbnail: "/basemaps/dark.jpg",
  attribution: OPEN_FREE_MAP_CREDITS,
  appearance: "dark",
  // Dark's own land colour (the `background` layer of its style, rgb(12,12,12)),
  // so the plain tile Save data mode shows reads as a dark map.
  swatch: "#0c0c0c",
  // Nothing to leave out in Save data mode: the style names the Natural Earth
  // raster source but draws no raster layer from it (checked 2026-11-11).
};

/** Every built-in basemap, in the order the picker shows them, the default first. */
export const BASEMAPS: readonly BasemapDefinition[] = [
  BRIGHT,
  LIBERTY,
  COLORFUL,
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
  FIORD,
  DARK,
];

const BASEMAPS_BY_ID: ReadonlyMap<string, BasemapDefinition> = new Map(
  BASEMAPS.map((basemap) => [basemap.id, basemap]),
);

/** Finds a built-in basemap by id. */
export function getBasemap(id: string): BasemapDefinition | undefined {
  return BASEMAPS_BY_ID.get(id);
}

/**
 * The basemaps a host offers, with the one used when nothing, or nothing
 * known, has been chosen. Plain data: a host builds one with
 * {@link createBasemapCatalogue} and passes it as `Services.basemaps`.
 */
export interface BasemapCatalogue {
  /** Every basemap, in the order the picker shows them. */
  readonly basemaps: readonly BasemapDefinition[];
  /** The id of the default basemap, which is in `basemaps`. */
  readonly defaultId: string;
  /** Finds a basemap by id. */
  get(id: string): BasemapDefinition | undefined;
  /**
   * Turns a stored or linked id into a basemap. An id that names none (a
   * removed one, or the retired "auto" choice) gives the default.
   */
  resolve(id: string): BasemapDefinition;
}

/**
 * Builds a {@link BasemapCatalogue}.
 * @param basemaps - At least one basemap, with unique ids.
 * @param defaultId - The default basemap's id. Defaults to the first basemap.
 * @throws When the list is empty, repeats an id, or does not hold `defaultId`.
 */
export function createBasemapCatalogue(
  basemaps: readonly BasemapDefinition[],
  defaultId: string | undefined = basemaps[0]?.id,
): BasemapCatalogue {
  const byId = new Map<string, BasemapDefinition>();
  for (const basemap of basemaps) {
    if (byId.has(basemap.id)) {
      throw new Error(`The basemap id "${basemap.id}" is used twice.`);
    }
    byId.set(basemap.id, basemap);
  }
  const fallback = defaultId === undefined ? undefined : byId.get(defaultId);
  if (fallback === undefined) {
    throw new Error(
      defaultId === undefined
        ? "A basemap catalogue needs at least one basemap."
        : `The default basemap "${defaultId}" is not in the catalogue.`,
    );
  }
  return {
    basemaps,
    defaultId: fallback.id,
    get: (id) => byId.get(id),
    resolve: (id) => byId.get(id) ?? fallback,
  };
}

/** The catalogue of the built-in basemaps, Bright the default. */
export const BUILT_IN_BASEMAP_CATALOGUE: BasemapCatalogue =
  createBasemapCatalogue(BASEMAPS, DEFAULT_BASEMAP_ID);

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
 * Whether a basemap draws image tiles (a raster map, or imagery under labels),
 * which cost more data than vector tiles. The picker says so in Save data mode.
 */
export function usesMoreData(basemap: BasemapDefinition): boolean {
  return basemap.source.kind !== "vector";
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
