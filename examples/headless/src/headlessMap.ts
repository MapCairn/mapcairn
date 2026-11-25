// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapAttributionEntry,
  type BasemapDefinition,
  buildAttribution,
  getBasemap,
  type MapAdapter,
  MapEngineError,
  type MapFeature,
  type MapHostElement,
  type ViewState,
} from "@mapcairn/core";

/** The view the map starts at. */
const START_VIEW: ViewState = {
  center: { lat: -33.92, lng: 18.42 },
  zoom: 11,
  bearing: 0,
};

/** The basemap the map starts with, by its id in the built-in catalogue. */
export const START_BASEMAP_ID = "bright";

/** The id of the one data layer the page draws. */
export const PLACES_LAYER_ID = "places";

/** How far an arrow key pans the map, in CSS pixels. */
export const KEY_PAN_PIXELS = 80;

/** The decimal places of a coordinate in the status line. */
const COORDINATE_DECIMALS = 3;

/** The decimal places of the zoom in the status line. */
const ZOOM_DECIMALS = 1;

const PLACE_COLOUR = "#b34700";
const PLACE_RADIUS = 9;

/** A place the page draws. Invented for this example. */
export interface Place {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** The places the data layer draws. */
export const PLACES: readonly Place[] = [
  { id: "north-cairn", name: "North cairn", lat: -33.88, lng: 18.4 },
  { id: "harbour-cairn", name: "Harbour cairn", lat: -33.92, lng: 18.43 },
  { id: "ridge-cairn", name: "Ridge cairn", lat: -33.96, lng: 18.46 },
];

/** The points of the data layer, with their look already worked out. */
export function placeFeatures(): MapFeature[] {
  return PLACES.map((place) => ({
    id: place.id,
    position: { lat: place.lat, lng: place.lng },
    colour: PLACE_COLOUR,
    radius: PLACE_RADIUS,
    shape: "circle",
  }));
}

/** What the page shows and the map's state it reports. The page's own code fills these in. */
export interface Page {
  /** Sets the status line, which a screen reader announces. */
  setStatus(text: string): void;
  /** Marks the map region busy or not. */
  setBusy(busy: boolean): void;
  /** Shows the credits the basemap's provider requires. */
  setCredits(entries: readonly BasemapAttributionEntry[]): void;
}

/** What {@link showMap} needs. */
export interface ShowMapOptions {
  readonly adapter: MapAdapter;
  readonly host: MapHostElement;
  readonly page: Page;
  /** True when the person asked their system for less motion. */
  readonly reducedMotion: boolean;
}

/** A map that is showing, and what the page can do to it. */
export interface HeadlessMap {
  /** Swaps the basemap for one in the built-in catalogue. Rejects for an id it does not hold; says on the page when the swap fails. */
  switchBasemap(id: string): Promise<void>;
  /** Moves the map for an arrow key, or zooms it for plus or minus. False for any other key. */
  handleKey(key: string): boolean;
  /** Stops listening and takes the map down. */
  destroy(): void;
}

/** The status line for a view. */
export function describeView(view: ViewState): string {
  const { lat, lng } = view.center;
  return `Centre ${lat.toFixed(COORDINATE_DECIMALS)}, ${lng.toFixed(COORDINATE_DECIMALS)}, zoom ${view.zoom.toFixed(ZOOM_DECIMALS)}.`;
}

function basemapNamed(id: string): BasemapDefinition {
  const basemap = getBasemap(id);
  if (!basemap) {
    throw new Error(`There is no basemap "${id}" in the built-in catalogue.`);
  }
  return basemap;
}

/** Subscribes to the events the page cares about. Returns one function that unsubscribes from all. */
function listen(adapter: MapAdapter, page: Page): () => void {
  const stops = [
    adapter.on("moveEnd", (view) => page.setStatus(describeView(view))),
    adapter.on("loading", (busy) => page.setBusy(busy)),
    adapter.on("featureTap", ({ featureId }) => {
      const place = PLACES.find((each) => each.id === featureId);
      if (place) {
        page.setStatus(`Selected ${place.name}.`);
      }
    }),
    adapter.on("basemapUnavailable", (basemap) =>
      page.setStatus(`The ${basemap.id} basemap did not load. Try another.`),
    ),
    adapter.on("fatalError", () =>
      page.setStatus("The map stopped working. Reload the page."),
    ),
  ];
  return () => {
    for (const stop of stops) {
      stop();
    }
  };
}

/**
 * Mounts the map in `host`, draws the places over the basemap and keeps the
 * page told about the view, the selection and the map's busy state.
 *
 * @throws The adapter's `MapEngineError` when the engine cannot start. The
 *   page has been told, and the adapter is destroyed.
 */
export async function showMap({
  adapter,
  host,
  page,
  reducedMotion,
}: ShowMapOptions): Promise<HeadlessMap> {
  const stopListening = listen(adapter, page);
  const basemap = basemapNamed(START_BASEMAP_ID);
  try {
    await adapter.mount(host, { view: START_VIEW, basemap, reducedMotion });
  } catch (error) {
    stopListening();
    adapter.destroy();
    if (error instanceof MapEngineError) {
      page.setStatus(`The map could not start: ${error.reason}.`);
    }
    throw error;
  }
  adapter.setFeatureLayer(PLACES_LAYER_ID, placeFeatures());
  page.setCredits(buildAttribution(basemap));
  return {
    async switchBasemap(id) {
      const next = basemapNamed(id);
      try {
        await adapter.setBasemap(next);
      } catch {
        page.setStatus(`The ${next.id} basemap could not load.`);
        return;
      }
      page.setCredits(buildAttribution(next));
    },
    handleKey(key) {
      return pan(adapter, key) || zoom(adapter, key);
    },
    destroy() {
      stopListening();
      adapter.destroy();
    },
  };
}

const PAN_BY_KEY: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [0, -KEY_PAN_PIXELS],
  ArrowDown: [0, KEY_PAN_PIXELS],
  ArrowLeft: [-KEY_PAN_PIXELS, 0],
  ArrowRight: [KEY_PAN_PIXELS, 0],
};

function pan(adapter: MapAdapter, key: string): boolean {
  const step = PAN_BY_KEY[key];
  if (!step) {
    return false;
  }
  adapter.panBy(step[0], step[1]);
  return true;
}

function zoom(adapter: MapAdapter, key: string): boolean {
  if (key === "+" || key === "=") {
    adapter.zoomIn();
    return true;
  }
  if (key === "-") {
    adapter.zoomOut();
    return true;
  }
  return false;
}
