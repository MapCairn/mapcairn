// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Bounds } from "@mapcairn/core";
import type {
  Map as MapLibreMap,
  StyleImage,
  StyleImageSource,
} from "maplibre-gl";
import { MARKER_IMAGE_PREFIX } from "./markerImages";
import { PATTERN_IMAGE_PREFIX } from "./patternImages";

/**
 * How far, in degrees, a fitted map's bounds may fall short of the box it was
 * fitted to. MapLibre fits the box exactly along one axis, so what is left is
 * floating-point error, about 11 metres here.
 */
export const FIT_TOLERANCE_DEGREES = 0.0001;

/** The bounds of a map, as MapLibre's `getBounds()` gives them. */
interface ShownBounds {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

/**
 * Whether what a map shows holds the whole of a box, within
 * {@link FIT_TOLERANCE_DEGREES}. MapLibre's fit keeps the camera inside what
 * the projection allows, so a box too wide for a tall, narrow map, or past the
 * lowest zoom, is framed with its sides or ends cropped rather than refused.
 */
export function coversBounds(
  shown: ShownBounds,
  { west, south, east, north }: Bounds,
): boolean {
  return (
    shown.getWest() <= west + FIT_TOLERANCE_DEGREES &&
    shown.getSouth() <= south + FIT_TOLERANCE_DEGREES &&
    shown.getEast() >= east - FIT_TOLERANCE_DEGREES &&
    shown.getNorth() >= north - FIT_TOLERANCE_DEGREES
  );
}

/**
 * An image the adapter drew for its data layers (a marker symbol or a fill
 * pattern), kept so a render map can be given the same ones.
 */
export interface DataLayerImage {
  readonly name: string;
  readonly image: StyleImage;
}

/** Whether an engine image name is one the adapter added, not one of the basemap's own sprites. */
function isDataLayerImage(name: string): boolean {
  return (
    name.startsWith(MARKER_IMAGE_PREFIX) ||
    name.startsWith(PATTERN_IMAGE_PREFIX)
  );
}

/**
 * Reads the images the adapter added to `map`. A style's `getStyle()` leaves
 * them out, so a map built from that style needs them added again, and the
 * basemap's own sprite images are left to its style, which loads them.
 */
export function dataLayerImages(map: MapLibreMap): DataLayerImage[] {
  return map
    .listImages()
    .filter(isDataLayerImage)
    .map((name) => ({ name, image: map.getImage(name) }));
}

/** Adds images read with {@link dataLayerImages} to a map that does not have them yet. */
export function addDataLayerImages(
  map: MapLibreMap,
  images: readonly DataLayerImage[],
): void {
  for (const { name, image } of images) {
    if (!map.hasImage(name)) {
      // The adapter only adds pixel arrays, never an image that draws itself.
      map.addImage(name, image.data as StyleImageSource, {
        pixelRatio: image.pixelRatio,
        sdf: image.sdf,
      });
    }
  }
}
