// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  clampZoom,
  type LatLng,
  type MapFitOptions,
  type MapMoveOptions,
  type PixelPoint,
  toEngineZoom,
  toNormalisedZoom,
  type ViewState,
} from "@mapcairn/core";
import type { AnimationOptions, Map as MapLibreMap } from "maplibre-gl";
import { positionOf } from "./positionOf";

/** Where a position is on `map`, in CSS pixels from its top left, or the origin when there is no map. */
export function pixelOf(
  map: MapLibreMap | undefined,
  latlng: LatLng,
): PixelPoint {
  if (!map) {
    return { x: 0, y: 0 };
  }
  const point = map.project([latlng.lng, latlng.lat]);
  return { x: point.x, y: point.y };
}

/** Bearing in degrees clockwise, in the range [0, 360) and never -0. */
function normaliseBearing(bearing: number): number {
  const normalised = ((bearing % 360) + 360) % 360;
  return normalised === 0 ? 0 : normalised;
}

/** The view of `map` in the port's terms (normalised zoom, bearing in [0, 360)). */
export function viewOfMap(map: MapLibreMap): ViewState {
  return {
    center: positionOf(map.getCenter()),
    zoom: toNormalisedZoom(map.getZoom()),
    bearing: normaliseBearing(map.getBearing()),
  };
}

/** What {@link Camera} needs from the adapter that owns the map and the basemap. */
export interface CameraHost {
  /** The map on screen, or undefined before `mount` and after `destroy`. */
  map(): MapLibreMap | undefined;
  /** The zoom limits of the current basemap, in normalised zoom. */
  zoomLimits(): { readonly min: number; readonly max: number };
}

interface CameraTarget {
  center?: [number, number];
  zoom?: number;
  bearing?: number;
}

/**
 * Moves the map on screen: pan, zoom, rotate, fit and the animation setting.
 * @remarks Zoom crosses the port boundary through `toEngineZoom`, clamped to
 *   the basemap's limits. Every move asks whether to animate: it does when the
 *   adapter allows animation and the call does not turn it off.
 */
export class Camera {
  private animationEnabled = true;

  constructor(private readonly host: CameraHost) {}

  /** The engine's zoom for a normalised zoom, held within the basemap's limits. */
  engineZoom(normalisedZoom: number): number {
    const { min, max } = this.host.zoomLimits();
    return toEngineZoom(clampZoom(normalisedZoom, min, max));
  }

  /**
   * Allows or forbids animation. Pan inertia is the only gesture animation
   * MapLibre 6 can change after construction: a pan speed limit of zero leaves
   * nothing to coast.
   */
  setAnimationEnabled(enabled: boolean): void {
    this.animationEnabled = enabled;
    if (!enabled) {
      this.host.map()?.stop();
    }
    this.applyInertia();
  }

  /** Sets pan inertia from the animation setting, on a map just made. */
  applyInertia(): void {
    this.host
      .map()
      ?.dragPan.enable(this.animationEnabled ? undefined : { maxSpeed: 0 });
  }

  setView(view: Partial<ViewState>, options?: MapMoveOptions): void {
    const camera: CameraTarget = {};
    if (view.center) {
      camera.center = [view.center.lng, view.center.lat];
    }
    if (view.zoom !== undefined) {
      camera.zoom = this.engineZoom(view.zoom);
    }
    if (view.bearing !== undefined) {
      camera.bearing = view.bearing;
    }
    this.moveCamera(camera, options);
  }

  zoomIn(options?: MapMoveOptions): void {
    this.host.map()?.zoomIn(this.animation(options));
  }

  zoomOut(options?: MapMoveOptions): void {
    this.host.map()?.zoomOut(this.animation(options));
  }

  panBy(dx: number, dy: number, options?: MapMoveOptions): void {
    this.host.map()?.panBy([dx, dy], this.animation(options));
  }

  rotateBy(degrees: number, options?: MapMoveOptions): void {
    const map = this.host.map();
    if (!map) {
      return;
    }
    this.moveCamera({ bearing: map.getBearing() + degrees }, options);
  }

  resetBearing(options?: MapMoveOptions): void {
    this.moveCamera({ bearing: 0 }, options);
  }

  fitBounds(bounds: Bounds, options?: MapFitOptions): void {
    const map = this.host.map();
    if (!map) {
      return;
    }
    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      {
        ...(options?.padding ? { padding: { ...options.padding } } : {}),
        ...(options?.maxZoom !== undefined
          ? { maxZoom: this.engineZoom(options.maxZoom) }
          : {}),
        // Without this MapLibre fits north-up and drops the user's rotation.
        bearing: map.getBearing(),
        ...this.animation(options),
      },
    );
  }

  private animation(options?: MapMoveOptions): AnimationOptions {
    // `essential` stops MapLibre's global reduced-motion flag from overriding
    // an animation the app has allowed.
    return this.shouldAnimate(options)
      ? { essential: true }
      : { animate: false, duration: 0 };
  }

  private shouldAnimate(options?: MapMoveOptions): boolean {
    return this.animationEnabled && options?.animate !== false;
  }

  private moveCamera(camera: CameraTarget, options?: MapMoveOptions): void {
    const map = this.host.map();
    if (!map) {
      return;
    }
    if (this.shouldAnimate(options)) {
      map.easeTo({ ...camera, essential: true });
    } else {
      map.jumpTo(camera);
    }
  }
}
