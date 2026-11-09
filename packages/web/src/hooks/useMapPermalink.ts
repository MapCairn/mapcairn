import { getRegisteredBasemapIds } from "@karta/map";
import { useEffect, useMemo } from "react";
import { getLayerStructure } from "../layers/registry";
import { getDefaultMapUiState, useMapUiStore } from "../stores/useMapUiStore";

/** State carried by a shareable map URL. */
export interface MapPermalinkState {
  visibleLayerIds: string[];
  basemap: string;
}

/** Valid state recovered from a URL. */
export type ParsedMapPermalink = Partial<MapPermalinkState>;

/** Discards unknown layers, basemaps and obsolete dataset-specific parameters. */
export function parseMapPermalink(
  search: string,
  knownLayerIds: readonly string[],
): ParsedMapPermalink {
  const params = new URLSearchParams(search);
  const result: ParsedMapPermalink = {};
  const layers = params.get("layers");
  if (layers !== null) {
    result.visibleLayerIds = layers
      .split(",")
      .filter((id) => knownLayerIds.includes(id));
  }
  const basemap = params.get("basemap");
  if (basemap && getRegisteredBasemapIds().includes(basemap)) {
    result.basemap = basemap;
  }
  return result;
}

/** Serialises only non-default state in stable catalogue order. */
export function buildMapPermalinkSearch(
  state: MapPermalinkState,
  defaults: MapPermalinkState,
  layerOrder: readonly string[],
): string {
  const params = new URLSearchParams();
  const layers = layerOrder.filter((id) => state.visibleLayerIds.includes(id));
  const defaultLayers = layerOrder.filter((id) =>
    defaults.visibleLayerIds.includes(id),
  );
  if (layers.join(",") !== defaultLayers.join(",")) {
    params.set("layers", layers.join(","));
  }
  if (state.basemap !== defaults.basemap) {
    params.set("basemap", state.basemap);
  }
  return params.toString();
}

/** Restores layer and basemap state, then updates the current URL without adding history entries. */
export function useMapPermalink(): void {
  const layerIds = useMemo(
    () => getLayerStructure().map((layer) => layer.id),
    [],
  );
  const defaults = useMemo(() => getDefaultMapUiState(), []);
  useEffect(() => {
    useMapUiStore.setState(parseMapPermalink(window.location.search, layerIds));
  }, [layerIds]);
  const visibleLayerIds = useMapUiStore((state) => state.visibleLayerIds);
  const basemap = useMapUiStore((state) => state.basemap);
  useEffect(() => {
    const search = buildMapPermalinkSearch(
      { visibleLayerIds, basemap },
      defaults,
      layerIds,
    );
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`,
    );
  }, [visibleLayerIds, basemap, defaults, layerIds]);
}
