import type {
  BasemapAttributionEntry,
  BasemapDefinition,
} from "../ports/basemap";
import type { ResolvedTheme } from "../ports/settings";

/** The pseudo-choice that follows the interface theme. It is not a basemap. */
export const AUTO_BASEMAP_ID = "auto";

/** The basemap used for "Auto" in a light theme, and for unknown ids. */
export const DEFAULT_BASEMAP_ID = "positron";

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

const POSITRON: BasemapDefinition = {
  id: "positron",
  name: "Positron",
  source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/positron` },
  minZoom: 0,
  maxZoom: VECTOR_MAX_ZOOM,
  thumbnail: "/basemaps/positron.jpg",
  attribution: OPEN_FREE_MAP_CREDITS,
  appearance: "light",
  darkVariantId: "dark",
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
};

/** Every built-in basemap, in the order the picker shows them. */
export const BASEMAPS: readonly BasemapDefinition[] = [
  POSITRON,
  {
    id: "liberty",
    name: "Liberty",
    source: { kind: "vector", styleUrl: `${OPEN_FREE_MAP_STYLES}/liberty` },
    minZoom: 0,
    maxZoom: VECTOR_MAX_ZOOM,
    thumbnail: "/basemaps/liberty.jpg",
    attribution: OPEN_FREE_MAP_CREDITS,
    appearance: "light",
    darkVariantId: "dark",
  },
  DARK,
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
 * Whether a stored or linked choice is one the picker can show: "Auto" or a
 * built-in basemap id. A basemap that has been removed is not.
 */
export function isKnownBasemapChoice(choiceId: string): boolean {
  return choiceId === AUTO_BASEMAP_ID || BASEMAPS_BY_ID.has(choiceId);
}

/**
 * Turns the user's basemap choice into a basemap.
 * @param choiceId - A basemap id, or {@link AUTO_BASEMAP_ID}.
 * @param theme - The theme being shown, used only for "auto".
 * @remarks "Auto" gives the default basemap in a light theme and its dark
 *   variant (its `darkVariantId`, which is the Dark basemap) in a dark one.
 *   An explicit id gives that basemap whatever the theme. An unknown id gives
 *   the default basemap.
 */
export function resolveBasemap(
  choiceId: string,
  theme: ResolvedTheme,
): BasemapDefinition {
  if (choiceId === AUTO_BASEMAP_ID) {
    return theme === "dark" ? DARK : POSITRON;
  }
  return getBasemap(choiceId) ?? POSITRON;
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
