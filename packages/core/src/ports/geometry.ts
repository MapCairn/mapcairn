// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/** A geographic position in decimal degrees (WGS 84). */
export interface LatLng {
  /** Degrees of latitude, positive north of the equator. */
  readonly lat: number;
  /** Degrees of longitude, positive east of the prime meridian. */
  readonly lng: number;
}

/** A pixel position relative to the top-left corner of the map host element. */
export interface PixelPoint {
  /** Pixels from the left edge of the map. */
  readonly x: number;
  /** Pixels from the top edge of the map. */
  readonly y: number;
}

/** A geographic bounding box in decimal degrees. */
export interface Bounds {
  /** The southern edge, in degrees of latitude. */
  readonly south: number;
  /** The western edge, in degrees of longitude. */
  readonly west: number;
  /** The northern edge, in degrees of latitude. */
  readonly north: number;
  /** The eastern edge, in degrees of longitude. */
  readonly east: number;
}

/**
 * The visible part of the map.
 * @remarks `zoom` is always the normalised zoom: the 256 px tile convention
 *   used by OpenStreetMap tile numbering. MapLibre counts 512 px tiles, so
 *   its adapter subtracts one on the way in and adds one on the way out.
 *   `bearing` is degrees clockwise from north, in the range [0, 360).
 */
export interface ViewState {
  /** The position at the middle of the map. */
  readonly center: LatLng;
  /** The normalised zoom: the 256 px tile convention, the same for every engine. */
  readonly zoom: number;
  /** Degrees clockwise from north that the top of the map points to, in the range [0, 360). */
  readonly bearing: number;
}
