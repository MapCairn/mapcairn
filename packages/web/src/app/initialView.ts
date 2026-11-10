import type { Settings, UrlStateValue, ViewState } from "@mapcairn/core";

/** The id of the map region, which the skip link moves focus to. */
export const MAP_REGION_ID = "map";

/** The id of the sheet, for `aria-controls` on Map options, Settings and Directions. */
export const SHEET_ID = "map-options";

/** The whole world, for a first visit with nothing shared or saved. */
export const WORLD_VIEW: ViewState = {
  center: { lat: 20, lng: 10 },
  zoom: 2,
  bearing: 0,
};

/** Where the map starts and which basemap a shared link asked for. */
export interface InitialMapState {
  readonly view: ViewState;
  /**
   * The basemap id from the link, which wins over the saved choice until the
   * person picks a basemap. Undefined when the link names none.
   */
  readonly basemapId: string | undefined;
}

/**
 * Decides the starting view: a shared link first, then the view saved at the
 * end of the last visit, then the whole world.
 */
export function initialMapState(
  url: UrlStateValue,
  settings: Pick<Settings, "lastView">,
): InitialMapState {
  return {
    view: url.view ?? settings.lastView ?? WORLD_VIEW,
    basemapId: url.basemapId,
  };
}
