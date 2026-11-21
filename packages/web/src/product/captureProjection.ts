// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/*
 * Where a place falls in a capture of the playground, worked out from the view
 * the capture shows, so the capture script can tap a measured line's two ends
 * and a test can check they lie inside the picture. The projection is the one
 * the map uses: Web Mercator with a 256 px tile, at the zoom the playground
 * writes in its address.
 */

/** The view a capture shows, and the size it was captured at in CSS pixels. */
export interface CaptureView {
  readonly latitude: number;
  readonly longitude: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** The pixels in one tile, which sets the size of the world at a zoom. */
const TILE_SIZE = 256;

/** The size of the world in pixels at a zoom. */
function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

/** The Web Mercator pixel of a place, from the world's top left at a zoom. */
function worldPixel(
  zoom: number,
  latitude: number,
  longitude: number,
): { readonly x: number; readonly y: number } {
  const size = worldSize(zoom);
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  };
}

/**
 * Where a place falls in a capture of a view, in CSS pixels from the capture's
 * top left. The view's centre is the capture's middle.
 */
export function projectToPixel(
  view: CaptureView,
  latitude: number,
  longitude: number,
): { readonly x: number; readonly y: number } {
  const centre = worldPixel(view.zoom, view.latitude, view.longitude);
  const place = worldPixel(view.zoom, latitude, longitude);
  return {
    x: view.width / 2 + (place.x - centre.x),
    y: view.height / 2 + (place.y - centre.y),
  };
}
