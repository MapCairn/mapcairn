// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  LatLng,
  LayerDefinition,
  LayerSource,
  LocationProvider,
  MapEngineError,
  MapFeatureTap,
  MessageKey,
  SearchProvider,
  SuggestionProvider,
  ThemeChoice,
  ViewState,
} from "@mapcairn/core";
import type { MountMapError } from "./MountMapError";
import type { MapTool } from "./tools";

/**
 * The providers a page writes itself. Each is optional. A tool that needs one
 * (`"search"`, `"locate"`) is left out, with one warning that names the fix, when it is missing.
 */
export interface MountServices {
  /** Finds places by name. Throw `SearchError` when a search fails. */
  readonly search?: SearchProvider;
  /** Suggests places while a person types. */
  readonly suggestions?: SuggestionProvider;
  /** Finds where the person is. Throw `LocationError` when it cannot. */
  readonly location?: LocationProvider;
  /**
   * Loads the features of a layer that comes from a feed or a query, and
   * answers a tap on a layer that identifies. Needed by such layers only.
   */
  readonly layerSource?: LayerSource;
}

/** A language a page adds to English, as plain data. */
export interface MountLanguage {
  /** A language tag such as `"af"`. Each language has its own, and `"en-GB"` is taken by English. */
  readonly tag: string;
  /** The language's name, in that language. It is what the language switcher shows. */
  readonly label: string;
  /** The reading direction, when it is not the one the tag implies. */
  readonly direction?: "ltr" | "rtl";
  /** The text, by message key. A key left out reads in English. */
  readonly messages: Partial<Record<MessageKey, string>>;
}

/** Everything `mountMap` takes. Every option is optional. */
export interface MountMapOptions {
  /** The starting view. A view of the whole world when left out. */
  readonly view?: ViewState;
  /** The basemaps offered. The SDK's built-in basemaps when left out. */
  readonly basemaps?: readonly BasemapDefinition[];
  /** The id of the basemap to start on. The default of the basemaps, for the theme, when left out. */
  readonly basemap?: string;
  /**
   * The layers a person can turn on, as plain definitions or a function that
   * loads them. The layers are listed in the Map options sheet, so name
   * `"map-options"` in `tools`; without it they are not shown. Every layer
   * starts off. A list is checked when the map is mounted, even when
   * `"map-options"` is not named, and throws if it is not valid or if a layer
   * in it needs `services.layerSource` (a feed, a query or a heatmap layer, or
   * a tile layer with an `identify` block) and none was given. A tile or vector
   * layer without an `identify` block never needs one. A function that fails, a
   * layer it returns that is not valid and one that needs
   * `services.layerSource` when there is none are reported through the `error`
   * event, and the rest are kept.
   */
  readonly layers?:
    | readonly LayerDefinition[]
    | (() => Promise<readonly LayerDefinition[]>);
  /** Languages to offer besides English. The language switcher is in Settings. */
  readonly languages?: readonly MountLanguage[];
  /** The tag of the language to start on, from `languages` or `"en-GB"`. The browser's choice when left out. */
  readonly language?: string;
  /** `"system"` (when left out) follows the device. */
  readonly theme?: ThemeChoice;
  /** The name of this map. Give each of several maps on a page its own. */
  readonly label?: string;
  /** The tools to add. None when left out: zoom, the compass, the credits and the scale are always there. */
  readonly tools?: readonly MapTool[];
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
  /** A point, shape or line of a layer was tapped. Not emitted while the measure tool is on. */
  readonly featuretap: MapFeatureTap;
  /**
   * The engine failed (`MapEngineError`), or the layers a page gave cannot all
   * be used (`MountMapError`): the function that loads them failed (kind
   * `layers-unavailable`), or a layer it returned was left out because it is
   * not valid or needs `services.layerSource` (kind `invalid-option`).
   */
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
