// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { type LatLng, wrapLongitude } from "@mapcairn/core";

/**
 * A position MapLibre reports, with its longitude brought into [-180, 180).
 * MapLibre does not wrap `unproject` or event positions, so on a flat map a
 * press on the copy of the world east of the antimeridian reports 190, which
 * would reach a drawn shape, an export or a link as it is.
 */
export function positionOf(lngLat: {
  readonly lat: number;
  readonly lng: number;
}): LatLng {
  return { lat: lngLat.lat, lng: wrapLongitude(lngLat.lng) };
}
