// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LatLng,
  type MapPlacement,
  type MapProjection,
  mapMetresPerPixel,
  type ViewState,
} from "@mapcairn/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import { pixelOf } from "./camera";
import type { MapLibreModule } from "./engineLoader";

/** What {@link OverlayPlacement} needs from the adapter that owns the maps. */
export interface OverlayPlacementHost {
  /** The map on screen, or undefined before `mount` and after `destroy`. */
  map(): MapLibreMap | undefined;
  /** The view of `map`, or the view the adapter mounted with when there is none. */
  viewOf(map: MapLibreMap | undefined): ViewState;
}

/**
 * The shape the ui chose (flat or globe) and what depends on it: whether a
 * place is hidden by the horizon, how the ui places its overlay marks, and the
 * scale at a latitude.
 */
export class OverlayPlacement {
  /** The shape the ui chose. It wins over any projection a style asks for. */
  private shape: MapProjection = "flat";
  /** MapLibre's `LngLat`, kept from the engine load, for the occlusion test. */
  private lngLat: MapLibreModule["LngLat"] | undefined;

  constructor(private readonly host: OverlayPlacementHost) {}

  get projection(): MapProjection {
    return this.shape;
  }

  choose(projection: MapProjection): void {
    this.shape = projection;
  }

  /** Keeps MapLibre's `LngLat` from the engine load. */
  keepEngine(maplibre: MapLibreModule): void {
    this.lngLat = maplibre.LngLat;
  }

  /** Sets the chosen shape on `map`; a style that has not loaded gets it from its `style.load`. */
  apply(map: MapLibreMap | undefined): void {
    map?.setProjection({ type: this.shape === "globe" ? "globe" : "mercator" });
  }

  /**
   * The engine's own horizon test, which hides a place when the planet lies
   * between the camera and it, on any map the adapter made. A flat map hides
   * nothing.
   */
  isVisible(map: MapLibreMap | undefined, latlng: LatLng): boolean {
    const LngLat = this.lngLat;
    if (!map || !LngLat || this.shape === "flat") {
      return true;
    }
    // `_camera.transform` is what MapLibre's own `Marker` asks. The public
    // `map.transform` is gone from the 6.x typings, and no public call tests
    // the horizon. The adapter contract suite covers it against the stand-in.
    return !map._camera.transform.isLocationOccluded(
      new LngLat(latlng.lng, latlng.lat),
    );
  }

  /**
   * How the ui places its overlay marks on `map` (the map on screen unless an
   * export asks for its render map), so presses and the exported image agree
   * with what it draws.
   */
  of(map = this.host.map()): MapPlacement {
    return {
      projection: this.shape,
      view: this.host.viewOf(map),
      project: (position) => pixelOf(map, position),
      isVisible: (position) => this.isVisible(map, position),
    };
  }

  /** Metres a pixel spans at `lat` (the view's centre latitude when omitted), for `view`. */
  metresPerPixel(view: ViewState, lat?: number): number {
    return mapMetresPerPixel(
      this.shape,
      lat ?? view.center.lat,
      view.center.lat,
      view.zoom,
    );
  }
}
