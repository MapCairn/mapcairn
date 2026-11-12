// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { wrapLongitude } from "../globe/longitude";
import { MapImageExportError } from "../ports/errors";
import type { Bounds, LatLng, ViewState } from "../ports/geometry";
import type {
  MapImageOptions,
  MapImageSize,
  MapImageView,
  MapProjection,
} from "../ports/map";
import { MAX_MERCATOR_LATITUDE } from "../zoom/zoom";

/** The furthest a longitude can be from the prime meridian. */
const MAX_LONGITUDE_DEGREES = 180;

/**
 * The most image pixels on one side. It is the limit the engine is asked to
 * allow, and a smaller GPU limit is reported as `too-large` rather than
 * silently lowering the size.
 */
export const MAX_IMAGE_SIDE_PX = 8192;

/**
 * The most pixels in one image, 4096 by 4096. A canvas has to hold the map as
 * four bytes a pixel, twice (the engine's and the copy), and Safari refuses a
 * canvas of more than this many pixels.
 */
export const MAX_IMAGE_PIXELS = 16_777_216;

/** The pixel ratio of a requested image that names none, so its size does not depend on the device. */
export const DEFAULT_IMAGE_PIXEL_RATIO = 1;

/** The map on screen, which a request falls back to where it names no size or view. */
export interface VisibleMap {
  readonly size: MapImageSize;
  readonly view: ViewState;
}

/** A request with every default filled in and its size checked. */
export interface RequestedImage {
  /** The map's size in CSS pixels. */
  readonly size: MapImageSize;
  readonly pixelRatio: number;
  readonly view: MapImageView;
  /** The image's width in pixels, as the engine rounds it. */
  readonly pixelWidth: number;
  /** The image's height in pixels, as the engine rounds it. */
  readonly pixelHeight: number;
}

/**
 * Works out what a request for an image asks for, so every adapter refuses
 * the same requests: the map on screen as it is gives `undefined`, and
 * anything with a size, a pixel ratio or a view gives the request in full.
 *
 * The CSS size is rounded to whole pixels, because MapLibre draws a canvas of
 * `round(ratio * floor(width))` pixels from a container's width, and the
 * rounded size is the one returned. A box has its west below its east, so a
 * box across the antimeridian is not accepted yet.
 * @throws MapImageExportError of kind `invalid` for a size, ratio or view that
 *   is not a finite, positive or on-planet number (latitudes within the Web
 *   Mercator limit, longitudes within -180 to 180), or leaves under one pixel,
 *   and of kind `too-large` for an image over {@link MAX_IMAGE_SIDE_PX} on a
 *   side or {@link MAX_IMAGE_PIXELS} in all. It throws before any engine work.
 */
export function planRequestedImage(
  options: MapImageOptions,
  visible: VisibleMap,
): RequestedImage | undefined {
  const { size, pixelRatio, view } = options;
  if (size === undefined && pixelRatio === undefined && view === undefined) {
    return undefined;
  }
  const request = {
    size: size ?? visible.size,
    pixelRatio: pixelRatio ?? DEFAULT_IMAGE_PIXEL_RATIO,
    view: view ?? visibleView(visible.view),
  };
  checkValues(request);
  const cssSize = {
    width: Math.round(request.size.width),
    height: Math.round(request.size.height),
  };
  const pixelWidth = Math.round(cssSize.width * request.pixelRatio);
  const pixelHeight = Math.round(cssSize.height * request.pixelRatio);
  if (Math.min(cssSize.width, cssSize.height, pixelWidth, pixelHeight) < 1) {
    throw new MapImageExportError(
      "invalid",
      "The image would have less than one pixel on a side.",
    );
  }
  checkLimits(pixelWidth, pixelHeight);
  return { ...request, size: cssSize, pixelWidth, pixelHeight };
}

/**
 * Refuses a box view on a globe, which no adapter can frame reliably yet: the
 * camera that fits a box is a flat one, and once the projection is a sphere
 * the box can lie beyond what the sphere shows. A centre and zoom is drawn on
 * either. A later step may frame a box on a globe.
 * @throws MapImageExportError of kind `invalid`.
 */
export function refuseBoxOnGlobe(
  view: MapImageView,
  projection: MapProjection,
): void {
  if ("bounds" in view && projection === "globe") {
    throw new MapImageExportError(
      "invalid",
      "A box view is not drawn on a globe yet. Give a centre and a zoom.",
    );
  }
}

/**
 * Where the map on screen looks, north-up, with its place brought into the
 * range a request accepts. A globe can look beyond the Web Mercator latitudes,
 * and the engine's own limit is a hair above ours, so the latitude is clamped
 * and the longitude wrapped; the person named no view, so this is not theirs
 * to get wrong.
 */
function visibleView({ center, zoom }: ViewState): MapImageView {
  return {
    center: {
      lat: Math.min(
        MAX_MERCATOR_LATITUDE,
        Math.max(-MAX_MERCATOR_LATITUDE, center.lat),
      ),
      lng: wrapLongitude(center.lng),
    },
    zoom,
  };
}

/** Whether a value is a finite number above zero. */
function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Whether a position is a finite place the flat map can draw: within the Web Mercator latitudes and -180 to 180 degrees of longitude. */
function isPlace({ lat, lng }: LatLng): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= MAX_LONGITUDE_DEGREES &&
    Math.abs(lat) <= MAX_MERCATOR_LATITUDE
  );
}

/** Whether a box has sides the map can draw, its south below its north and its west below its east. */
function isBox({ south, west, north, east }: Bounds): boolean {
  return (
    isPlace({ lat: south, lng: west }) &&
    isPlace({ lat: north, lng: east }) &&
    south < north &&
    west < east
  );
}

/** Whether a view names a place and a zoom, or a box, that can be drawn. */
function isDrawable(view: MapImageView): boolean {
  return "bounds" in view
    ? isBox(view.bounds)
    : isPlace(view.center) && Number.isFinite(view.zoom);
}

/** Throws `invalid` for a size, ratio or view that cannot be drawn. */
function checkValues(request: {
  readonly size: MapImageSize;
  readonly pixelRatio: number;
  readonly view: MapImageView;
}): void {
  if (!isPositive(request.size.width) || !isPositive(request.size.height)) {
    throw new MapImageExportError(
      "invalid",
      "The image size must be a positive width and height.",
    );
  }
  if (!isPositive(request.pixelRatio)) {
    throw new MapImageExportError(
      "invalid",
      "The pixel ratio must be a number above zero.",
    );
  }
  if (!isDrawable(request.view)) {
    throw new MapImageExportError(
      "invalid",
      "The view must be a box with its south below its north and its west below its east, or a centre and a zoom, within the Web Mercator latitudes and -180 to 180 degrees of longitude.",
    );
  }
}

/** Throws `too-large` for an image over either limit. */
function checkLimits(pixelWidth: number, pixelHeight: number): void {
  const overSide = Math.max(pixelWidth, pixelHeight) > MAX_IMAGE_SIDE_PX;
  if (overSide || pixelWidth * pixelHeight > MAX_IMAGE_PIXELS) {
    throw new MapImageExportError(
      "too-large",
      `The image would be ${pixelWidth} by ${pixelHeight} pixels. At most ${MAX_IMAGE_SIDE_PX} on a side and ${MAX_IMAGE_PIXELS} in all are allowed.`,
    );
  }
}
