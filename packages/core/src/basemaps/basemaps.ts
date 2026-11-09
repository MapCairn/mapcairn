import type {
  BasemapAttributionEntry,
  BasemapDefinition,
  BasemapEngineId,
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
const ESRI_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services";

// Normalised (256 px) zoom limits. MapLibre's own maximum of 22 counts 512 px
// tiles, which is 23 on this scale, so vector styles are capped at 22 here
// to stay inside what the styles publish.
const VECTOR_MAX_ZOOM = 22;
const RASTER_MAX_ZOOM = 18;

const POSITRON: BasemapDefinition = {
  id: "positron",
  name: "Positron",
  engine: "maplibre",
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
  engine: "maplibre",
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
    engine: "maplibre",
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
    id: "satellite",
    name: "Satellite",
    engine: "leaflet",
    source: {
      kind: "raster",
      tileUrl: `${ESRI_TILES}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
      tileSize: 256,
    },
    minZoom: 0,
    maxZoom: RASTER_MAX_ZOOM,
    thumbnail: "/basemaps/satellite.jpg",
    attribution: [
      {
        text: "Tiles © Esri, Maxar, Earthstar Geographics",
        href: "https://www.esri.com",
      },
    ],
    appearance: "dark",
  },
  {
    id: "topo",
    name: "Topographic",
    engine: "leaflet",
    source: {
      kind: "raster",
      tileUrl: `${ESRI_TILES}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
      tileSize: 256,
    },
    minZoom: 0,
    maxZoom: RASTER_MAX_ZOOM,
    thumbnail: "/basemaps/topo.jpg",
    attribution: [
      {
        text: "Tiles © Esri: Esri, HERE, Garmin, and the GIS User Community",
        href: "https://www.esri.com",
      },
    ],
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

const ENGINE_CREDITS: Readonly<
  Record<BasemapEngineId, BasemapAttributionEntry>
> = {
  leaflet: { text: "Leaflet", href: "https://leafletjs.com" },
  maplibre: { text: "MapLibre", href: "https://maplibre.org" },
};

/**
 * The credits to show for a basemap rendered by a given engine: the
 * provider's entries followed by the engine's own credit.
 */
export function attributionFor(
  basemap: BasemapDefinition,
  engine: BasemapEngineId,
): readonly BasemapAttributionEntry[] {
  return [...basemap.attribution, ENGINE_CREDITS[engine]];
}

/** The credits for a basemap rendered by its own engine. */
export function buildAttribution(
  basemap: BasemapDefinition,
): readonly BasemapAttributionEntry[] {
  return attributionFor(basemap, basemap.engine);
}
