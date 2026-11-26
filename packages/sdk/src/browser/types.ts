// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  LatLng,
  LocationProvider,
  MapEngineError,
  SearchProvider,
  SuggestionProvider,
  ThemeChoice,
  ViewState,
} from "@mapcairn/core";
import type { MountMapError } from "./MountMapError";

/**
 * The providers a page writes itself. Each is optional and none is used by
 * the first release's interface until a tool needs it.
 */
export interface MountServices {
  /** Finds places by name. Throw `SearchError` when a search fails. */
  readonly search?: SearchProvider;
  /** Suggests places while a person types. */
  readonly suggestions?: SuggestionProvider;
  /** Finds where the person is. Throw `LocationError` when it cannot. */
  readonly location?: LocationProvider;
}

/** Everything `mountMap` takes. Every option is optional. */
export interface MountMapOptions {
  /** The starting view. A view of the whole world when left out. */
  readonly view?: ViewState;
  /** The basemaps offered. The SDK's built-in basemaps when left out. */
  readonly basemaps?: readonly BasemapDefinition[];
  /** The id of the basemap to start on. The default of the basemaps, for the theme, when left out. */
  readonly basemap?: string;
  /** `"system"` (when left out) follows the device. */
  readonly theme?: ThemeChoice;
  /** The name of this map. Give each of several maps on a page its own. */
  readonly label?: string;
  /** Where the engine's worker is served from, on this page's origin. Beside the module when left out. */
  readonly workerUrl?: string;
  /** The providers the page writes. */
  readonly services?: MountServices;
}

/** Options for {@link MapHandle.setView}. */
export interface SetViewOptions {
  /** Whether the map moves smoothly. True when left out, unless the person asks for reduced motion. */
  readonly animate?: boolean;
}

/** What {@link MapHandle.update} can change after the map is mounted. */
export interface MapUpdate {
  /** The id of a basemap in the catalogue. */
  readonly basemap?: string;
  /** The theme choice. */
  readonly theme?: ThemeChoice;
}

/** What a map reports, by event name. Payloads are plain data. */
export interface MapEvents {
  /** The map stopped moving: the view it now shows. */
  readonly viewchange: ViewState;
  /** The map was clicked or tapped at this position. */
  readonly click: LatLng;
  /** The engine failed, or a call could not be honoured. */
  readonly error: MapEngineError | MountMapError;
}

/** The map `mountMap` made. */
export interface MapHandle {
  /** Resolves when the engine is drawing. Rejects with a `MapEngineError` when it cannot start, or a `MountMapError` of kind `destroyed`. */
  readonly ready: Promise<void>;
  /** The view the map shows, or last showed after `destroy()`. */
  getView(): ViewState;
  /** Moves the map. Does nothing after `destroy()`. */
  setView(view: Partial<ViewState>, options?: SetViewOptions): void;
  /** Changes the basemap or the theme. Does nothing after `destroy()`. */
  update(update: MapUpdate): void;
  /** Listens for an event and returns the function that stops listening. */
  on<K extends keyof MapEvents>(
    type: K,
    listener: (event: MapEvents[K]) => void,
  ): () => void;
  /** Removes the map and everything it added to the page. Safe to call again. */
  destroy(): void;
}
