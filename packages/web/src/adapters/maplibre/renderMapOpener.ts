// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type Bounds,
  MAX_IMAGE_SIDE_PX,
  MapImageExportError,
  type MapImageView,
  type MapProjection,
  refuseBoxOnGlobe,
  toEngineZoom,
} from "@mapcairn/core";
import type { Map as MapLibreMap, MapOptions } from "maplibre-gl";
import { loadEngine } from "./engineLoader";
import {
  notMounted,
  type RenderMap,
  type RenderMapRequest,
} from "./imageExport";
import { addDataLayerImages, coversBounds, dataLayerImages } from "./renderMap";
import { TILE_SETTLE_NUDGE_MS } from "./repaintUntilIdle";

/** What {@link RenderMapOpener} needs from the adapter that owns the map on screen. */
export interface RenderMapOpenerHost {
  /** The map on screen, or undefined before `mount` and once the adapter is destroyed. */
  sourceMap(): MapLibreMap | undefined;
  /** The shape the ui chose; it wins over any projection a style asks for. */
  projection(): MapProjection;
  /** The zoom limits of the current basemap, in normalised zoom. */
  zoomLimits(): { readonly min: number; readonly max: number };
  /** The engine's zoom for a normalised zoom. */
  engineZoom(normalisedZoom: number): number;
  /** Sets the chosen shape on `map`. */
  applyProjection(map: MapLibreMap): void;
}

/** A box and the options to fit it with, never past `maxZoom`. */
function fitOf(
  { west, south, east, north }: Bounds,
  maxZoom: number,
): Pick<MapOptions, "bounds" | "fitBoundsOptions"> {
  return {
    bounds: [
      [west, south],
      [east, north],
    ],
    fitBoundsOptions: { maxZoom },
  };
}

/**
 * Starts a map of its own from the style of the map on screen, so it draws the
 * same basemap and data layers and requests nothing else, at the view and
 * pixel ratio of a requested image. The map on screen is only read.
 */
export class RenderMapOpener {
  constructor(
    private readonly host: RenderMapOpenerHost,
    private readonly workerCacheKey: string | undefined,
  ) {}

  async open({
    container,
    pixelRatio,
    view,
  }: RenderMapRequest): Promise<RenderMap> {
    refuseBoxOnGlobe(view, this.host.projection());
    const maplibre = await loadEngine(this.workerCacheKey);
    // The adapter can be destroyed while the engine loads.
    const source = this.host.sourceMap();
    if (!source) {
      throw notMounted();
    }
    const { min, max } = this.host.zoomLimits();
    const images = dataLayerImages(source);
    const map = new maplibre.Map({
      container,
      style: source.getStyle(),
      ...this.camera(view, max),
      bearing: 0,
      pitch: 0,
      minZoom: toEngineZoom(min),
      maxZoom: toEngineZoom(max),
      maxPitch: 0,
      interactive: false,
      attributionControl: false,
      maplibreLogo: false,
      // Nothing fades in, so the first full frame is the finished one.
      fadeDuration: 0,
      pixelRatio,
      // The engine lowers the ratio of a canvas over this size, so it is
      // the cap the port enforces, not MapLibre's smaller default.
      maxCanvasSize: [MAX_IMAGE_SIDE_PX, MAX_IMAGE_SIDE_PX],
    });
    // The constructor keeps its default camera when it cannot fit the box,
    // and MapLibre keeps the camera inside what the projection allows, so a
    // box can come back cropped. Either would save the wrong place.
    if ("bounds" in view && !coversBounds(map.getBounds(), view.bounds)) {
      map.remove();
      throw new MapImageExportError(
        "invalid",
        "The view cannot be framed at this size.",
      );
    }
    // A style's own projection can differ from the app's, which wins; and
    // `getStyle()` leaves out the images the data layers use.
    map.on("style.load", () => {
      this.host.applyProjection(map);
      addDataLayerImages(map, images);
    });
    return { map, idle: untilSettled(map) };
  }

  /** The engine's camera options for a requested view, north-up. */
  private camera(view: MapImageView, maxZoom: number): Partial<MapOptions> {
    if ("bounds" in view) {
      return fitOf(view.bounds, toEngineZoom(maxZoom));
    }
    return {
      center: [view.center.lng, view.center.lat],
      zoom: this.host.engineZoom(view.zoom),
    };
  }
}

/**
 * Resolves when the render map reports `idle`. A tile that answers 404 fires
 * no event and asks for no frame, so a map over a sparse tile layer would
 * never report it (see {@link TILE_SETTLE_NUDGE_MS}); it is painted every
 * {@link TILE_SETTLE_NUDGE_MS} until it does, or until it is removed. This is
 * the render map that exports an image; the live map's own nudge, started by a
 * tile layer's or the basemap's tiles, is `RepaintUntilIdle`.
 */
function untilSettled(map: MapLibreMap): Promise<void> {
  return new Promise((resolve) => {
    const nudge = setInterval(() => {
      map.triggerRepaint();
    }, TILE_SETTLE_NUDGE_MS);
    map.on("remove", () => clearInterval(nudge));
    map.on("idle", () => {
      clearInterval(nudge);
      resolve();
    });
  });
}
