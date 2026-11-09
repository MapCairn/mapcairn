import {
  BASEMAPS,
  type BasemapDefinition,
  type ResolvedTheme,
  resolveBasemap,
} from "@karta/core";
import { useSettings } from "@karta/map";
import { useCallback, useState } from "react";

/**
 * The basemap shown when the device cannot draw vector maps: the first raster
 * (Leaflet) basemap whose appearance suits the theme, or else the first raster
 * basemap. With the built-ins that is Topographic in a light theme and
 * Satellite in a dark one. Derived from `BASEMAPS`, so a new list still works.
 */
export function rasterFallback(theme: ResolvedTheme): BasemapDefinition {
  const raster = BASEMAPS.filter((basemap) => basemap.engine === "leaflet");
  const fallback =
    raster.find((basemap) => basemap.appearance === theme) ?? raster[0];
  if (!fallback) {
    throw new Error("BASEMAPS has no raster basemap to fall back to.");
  }
  return fallback;
}

/** What {@link useBasemapChoice} returns. */
export interface BasemapChoice {
  /** The choice the picker shows: a basemap id or `AUTO_BASEMAP_ID`. */
  readonly choice: string;
  /** The basemap to draw, after "Auto" and any fallback are applied. */
  readonly basemap: BasemapDefinition;
  /** Stores the person's choice. It replaces a basemap named by a link. */
  readonly choose: (id: string) => void;
  /** True once a vector basemap failed for lack of WebGL. */
  readonly vectorUnavailable: boolean;
  /** Switches every later vector basemap to {@link rasterFallback}. */
  readonly markVectorUnavailable: () => void;
}

/**
 * The basemap choice: a basemap named by a shared link wins once, at load,
 * without overwriting the saved choice; after that the saved setting decides.
 * When WebGL is missing, vector basemaps are replaced by a raster one, so the
 * map is never blank.
 */
export function useBasemapChoice(
  linkedBasemapId: string | undefined,
  theme: ResolvedTheme,
): BasemapChoice {
  const { settings, update } = useSettings();
  const [linked, setLinked] = useState(linkedBasemapId);
  const [vectorUnavailable, setVectorUnavailable] = useState(false);
  const choice = linked ?? settings.basemapId;
  const chosen = resolveBasemap(choice, theme);
  const basemap =
    vectorUnavailable && chosen.engine === "maplibre"
      ? rasterFallback(theme)
      : chosen;

  const choose = useCallback(
    (id: string) => {
      setLinked(undefined);
      update({ basemapId: id });
    },
    [update],
  );
  const markVectorUnavailable = useCallback(() => {
    setVectorUnavailable(true);
  }, []);

  return { choice, basemap, choose, vectorUnavailable, markVectorUnavailable };
}
