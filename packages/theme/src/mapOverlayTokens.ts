import { tokens } from "./tokens.css";

/**
 * The CSS variable references for everything drawn over the map: pin,
 * measure line and fill, accuracy circle, scale bar, halo, loading indicator
 * and tile-error banner. Overlay components style from these alone, so they
 * look the same on every map engine and never import an engine's styles.
 *
 * Each colour clears 3:1 against light and dark basemaps; `contrast.test.ts`
 * enforces it. The fills are translucent by design, so the outline beside
 * them carries the contrast.
 */
export const mapOverlayTokens = {
  /** The map element's colour before tiles load. */
  background: tokens.color.mapBackground,
  /** Dropped pin. */
  pin: tokens.color.mapPin,
  /** Outline that separates a pin or line from the map beneath. */
  halo: tokens.color.mapHalo,
  /** Measurement line. */
  measureLine: tokens.color.mapMeasureLine,
  /** Measured area fill. */
  measureFill: tokens.color.mapMeasureFill,
  /** Location accuracy circle outline. */
  accuracyStroke: tokens.color.mapAccuracy,
  /** Location accuracy circle fill. */
  accuracyFill: tokens.color.mapAccuracyFill,
  /** Scale bar line. */
  scaleLine: tokens.color.mapScaleLine,
  /** The moving arc of the tile-loading indicator. */
  loadingIndicator: tokens.color.mapPin,
  /** The track behind the loading indicator. */
  loadingTrack: tokens.color.mapHalo,
  /** Tile-error banner background. */
  tileErrorBackground: tokens.color.dangerTint,
  /** Tile-error banner text and icon. */
  tileErrorText: tokens.color.danger,
} as const;
