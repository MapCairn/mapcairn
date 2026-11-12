// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MapProjection } from "../ports/map";
import { metresPerPixel } from "../zoom/zoom";

/**
 * Ground resolution, in metres per pixel, at `latitude` on a map of the given
 * shape whose view is centred at `centreLatitude` and normalised `zoom`.
 *
 * @remarks On a flat map this is the Web Mercator resolution at `latitude`,
 *   which shrinks with its cosine. On a globe there is one scale for the
 *   whole sphere: MapLibre GL JS 6.17 (`getGlobeRadiusPixels` in
 *   `src/geo/projection/globe_utils.ts`) makes the globe's radius
 *   `worldSize / (2π) / cos(centre latitude)`, so a feature at the view
 *   centre is the same size on the globe as on the flat map, and a feature
 *   anywhere else facing the camera is that size too (less where the sphere
 *   turns away towards the horizon). So the globe's resolution is the flat
 *   resolution at the centre latitude, whatever `latitude` is asked about. At
 *   the view centre both shapes agree, which is what the scale bar shows.
 *   From normalised zoom 12 to 13 the engine blends the globe into the flat
 *   map; the view there spans a fraction of a degree, so the two answers
 *   differ by under one percent.
 */
export function mapMetresPerPixel(
  projection: MapProjection,
  latitude: number,
  centreLatitude: number,
  zoom: number,
): number {
  return metresPerPixel(
    projection === "globe" ? centreLatitude : latitude,
    zoom,
  );
}
