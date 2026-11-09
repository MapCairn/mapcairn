/** A geographic position in decimal degrees (WGS 84). */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** A pixel position relative to the top-left corner of the map host element. */
export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/** A geographic bounding box in decimal degrees. */
export interface Bounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/**
 * The visible part of the map.
 * @remarks `zoom` is always the normalised zoom: the 256 px tile convention
 *   used by Leaflet and OpenStreetMap. A MapLibre engine, which counts 512 px
 *   tiles, adds one before talking to the engine and subtracts one on the way
 *   out, so one number means the same visual scale on every engine.
 *   `bearing` is degrees clockwise from north, in the range [0, 360).
 */
export interface ViewState {
  readonly center: LatLng;
  readonly zoom: number;
  readonly bearing: number;
}
