// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  BasemapDefinition,
  LatLng,
  MapEngineError,
  MapFeatureTap,
  ViewState,
} from "@mapcairn/core";
import type { MountMapError } from "../MountMapError";
import type {
  MapHandle,
  MountLanguage,
  MountMapOptions,
  MountServices,
} from "../types";

/**
 * The events a `<mapcairn-map>` sends, by name. Each is a `CustomEvent` that
 * bubbles, with what happened in `detail`. They carry
 * a prefix because a bare `click` is the browser's own.
 */
export interface MapCairnMapEventMap {
  /** The map stopped moving: `detail` is the view it now shows. */
  "mapcairn-view-change": CustomEvent<ViewState>;
  /** The map was clicked or tapped: `detail` is the position. */
  "mapcairn-click": CustomEvent<LatLng>;
  /** A point, shape or line of a layer was tapped. */
  "mapcairn-feature-tap": CustomEvent<MapFeatureTap>;
  /**
   * Something went wrong: `detail` is a `MountMapError` when the map could not
   * be drawn from what the element was given, and a `MapEngineError` when the
   * engine failed.
   */
  "mapcairn-error": CustomEvent<MapEngineError | MountMapError>;
}

/**
 * The `<mapcairn-map>` element. A bare tag draws a map; attributes set the
 * starting view, `basemap` and `theme`, and the properties take the data an
 * attribute cannot hold. Give the element a height in CSS.
 *
 * `label`, `language` and `tools` are read when the element is added to the
 * page. Change one by removing the element and adding it again.
 */
export interface MapCairnMapElement extends HTMLElement {
  /** The providers the page writes: search, suggestions, location and a layer source. Setting it draws the map again. */
  services: MountServices | undefined;
  /** The basemaps offered, as plain definitions. The built-in ones when unset. Setting it draws the map again. */
  basemaps: readonly BasemapDefinition[] | undefined;
  /** The layers a person can turn on, as definitions or a function that loads them. Setting it draws the map again. */
  layers: MountMapOptions["layers"];
  /** Languages to offer besides English. Setting it draws the map again. */
  languages: readonly MountLanguage[] | undefined;
  /**
   * The view the map shows, or the one it last showed. Setting it moves the
   * map, and the latest of this and the `latitude`, `longitude`, `zoom` and
   * `bearing` attributes wins. Nothing is written back to an attribute.
   */
  view: ViewState | undefined;
  /** The map's handle, once it is drawn: `undefined` before and after. */
  readonly map: MapHandle | undefined;

  /** Listens for one of the element's events, typed by its name. */
  addEventListener<K extends keyof MapCairnMapEventMap>(
    type: K,
    listener: (this: MapCairnMapElement, event: MapCairnMapEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  /** Listens for any other event, such as a `click` or a `focusin`. */
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  /** Stops listening for one of the element's events. */
  removeEventListener<K extends keyof MapCairnMapEventMap>(
    type: K,
    listener: (this: MapCairnMapElement, event: MapCairnMapEventMap[K]) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  /** Stops listening for any other event. */
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}

/** The class `defineMapElement` registers. */
export type MapCairnMapElementClass = new () => MapCairnMapElement;

/** How the element draws its map: `mountMap`, or a stand-in in a test. */
export type ElementMount = (
  element: HTMLElement,
  options: MountMapOptions,
) => MapHandle;
