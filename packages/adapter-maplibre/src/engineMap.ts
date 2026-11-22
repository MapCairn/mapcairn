// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapDefinition,
  toEngineZoom,
  type ViewState,
} from "@mapcairn/core";
import type {
  Map as MapLibreMap,
  MapOptions,
  RequestTransformFunction,
} from "maplibre-gl";
import { styleFor } from "./basemapStyle";

/** What the map on screen is built from. */
export interface EngineMapSettings {
  readonly container: HTMLElement;
  readonly basemap: BasemapDefinition;
  readonly view: ViewState;
  /** The engine's zoom for `view.zoom`, already held within the basemap's limits. */
  readonly engineZoom: number;
  readonly reducedMotion: boolean;
  /** The engine's request transform; it sets the referrer policy of a data layer's tiles. */
  readonly transformRequest: RequestTransformFunction;
}

/**
 * The options of the map on screen: MapLibre owns every pointer and touch
 * gesture, pitch is locked at 0 (the app is a flat 2D map; rotation is
 * supported) and the adapter adds no controls, markers or popups.
 */
export function engineMapOptions({
  container,
  basemap,
  view,
  engineZoom,
  reducedMotion,
  transformRequest,
}: EngineMapSettings): MapOptions {
  return {
    container,
    style: styleFor(basemap),
    transformRequest,
    center: [view.center.lng, view.center.lat],
    zoom: engineZoom,
    bearing: view.bearing,
    pitch: 0,
    minZoom: toEngineZoom(basemap.minZoom),
    maxZoom: toEngineZoom(basemap.maxZoom),
    maxPitch: 0,
    attributionControl: false,
    maplibreLogo: false,
    // The ui implements the keys itself.
    keyboard: false,
    cooperativeGestures: false,
    boxZoom: false,
    dragPan: true,
    dragRotate: true,
    pitchWithRotate: false,
    touchPitch: false,
    touchZoomRotate: true,
    scrollZoom: true,
    doubleClickZoom: true,
    // Constructor-only in MapLibre 6. `reduceMotion` turns off gesture
    // inertia and wheel easing; it must always be passed explicitly because
    // MapLibre stores it globally and the ui already folds in the OS setting.
    reduceMotion: reducedMotion,
    ...(reducedMotion ? { fadeDuration: 0 } : {}),
  };
}

/**
 * Removes MapLibre's own accessibility semantics so the ui's map host stays
 * the single focus stop and the single "Map" region.
 * @remarks MapLibre sets `role="region"`, `aria-label="Map"` and
 *   `tabindex="0"` on its `<canvas>` (not the canvas container) once, when the
 *   map is built. This removes all three and sets `aria-hidden="true"` on the
 *   canvas. Without a `tabindex` the canvas is not focusable, so clicking it
 *   focuses the host. MapLibre's keyboard handler listens on the canvas
 *   container, so it can only receive keys while focus is inside it.
 */
export function neutraliseEngineAccessibility(map: MapLibreMap): void {
  const canvas = map.getCanvas();
  canvas.removeAttribute("role");
  canvas.removeAttribute("aria-label");
  canvas.removeAttribute("tabindex");
  canvas.setAttribute("aria-hidden", "true");
}
