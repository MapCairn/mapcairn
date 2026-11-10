/**
 * The one engine style file: the only place `.maplibregl-*` selectors may
 * appear, and one of the two places raw z-index values may (the other is the
 * tokens file). It exports nothing. The composition root imports it for its
 * side effects, once, so the rules are in the page before the engine mounts.
 *
 * Every rule is prefixed with `[data-map-host]`, the attribute `MapView` puts
 * on the map region. The MapLibre adapter loads the engine stylesheet later
 * and dynamically, and a later rule wins a specificity tie, so each rule here
 * is kept at least one attribute selector more specific than the engine rule
 * it overrides. No `!important` is needed. Selectors checked against
 * `maplibre-gl@6.17.0/dist/maplibre-gl.css`.
 *
 * Stacking: the map region is `isolation: isolate` on the `map` layer, which
 * keeps everything inside it below the chrome. The engine container is also
 * made its own stacking context at z-index 0, so any engine z-index is
 * resolved inside it and never covers the overlay layer, which lives in the
 * same region at the `mapOverlay` layer.
 *
 * Touch: `touch-action` is left to MapLibre (`.maplibregl-touch-drag-pan`,
 * `.maplibregl-touch-zoom-rotate`); the region itself is `touch-action: none`.
 *
 * Cursor: `MapView` owns the cursor (grab, grabbing while pressed, crosshair
 * while measuring), so engine elements inherit it instead of setting their own.
 */
import { mapOverlayTokens, tokens } from "@mapcairn/theme";
import { globalStyle } from "@vanilla-extract/css";

/** The map region attribute every selector starts from. */
const HOST = "[data-map-host]";

/** Prefixes each selector with {@link HOST}. */
function scoped(...selectors: string[]): string {
  return selectors.map((selector) => `${HOST} ${selector}`).join(", ");
}

// Engine controls and attribution. The app draws its own zoom buttons,
// compass and "Map credits" control, so none of MapLibre's shows.
globalStyle(
  scoped(
    ".maplibregl-control-container",
    ".maplibregl-ctrl",
    ".maplibregl-ctrl-attrib",
    ".maplibregl-ctrl-logo",
  ),
  { display: "none" },
);

// The container: our type, our map background, a stacking context of its
// own, no blue tap flash.
globalStyle(scoped(".maplibregl-map"), {
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  backgroundColor: mapOverlayTokens.background,
  isolation: "isolate",
  zIndex: 0,
  WebkitTapHighlightColor: "transparent",
});

// Popups, should the engine ever draw one, use our type too.
globalStyle(scoped(".maplibregl-popup-content"), {
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
});

// The map region carries the focus ring. Engine elements never draw one.
globalStyle(
  scoped(
    ".maplibregl-map:focus",
    ".maplibregl-canvas-container:focus",
    ".maplibregl-canvas:focus",
  ),
  { outline: "none", boxShadow: "none" },
);

// Cursors inherit from the region.
globalStyle(
  scoped(
    ".maplibregl-canvas-container.maplibregl-interactive",
    ".maplibregl-canvas-container.maplibregl-interactive:active",
    ".maplibregl-canvas-container.maplibregl-interactive.maplibregl-track-pointer",
  ),
  { cursor: "inherit" },
);
