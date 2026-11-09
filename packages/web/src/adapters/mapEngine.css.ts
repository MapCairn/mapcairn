/**
 * The one engine style file: the only place `.leaflet-*` and `.maplibregl-*`
 * selectors may appear, and one of the two places raw z-index values may
 * (the other is the tokens file). It exports nothing. The composition root
 * imports it for its side effects, once, so the rules are in the page before
 * any engine mounts.
 *
 * Every rule is prefixed with `[data-engine]`, the attribute `MapView` puts on
 * the map region. Each adapter loads its engine stylesheet later and
 * dynamically, and a later rule wins a specificity tie, so each rule here is
 * kept at least one attribute selector more specific than the engine rule it
 * overrides. No `!important` is needed. Selectors checked against
 * `leaflet@1.9.4/dist/leaflet.css` and `maplibre-gl@6.17.0/dist/maplibre-gl.css`.
 *
 * Stacking: the map region is `isolation: isolate` on the `map` layer, which
 * keeps everything inside it below the chrome. That alone does not stop
 * Leaflet's panes (200 to 700) and control corners (800 and 1000) from
 * covering our overlay layer, which lives in the same region at the
 * `mapOverlay` layer. So each engine container is made its own stacking
 * context at z-index 0, and every engine z-index is resolved inside it.
 *
 * Touch: `touch-action` is left to the engines (`.leaflet-touch-*`,
 * `.maplibregl-touch-drag-pan`, `.maplibregl-touch-zoom-rotate`); the region
 * itself is `touch-action: none`.
 *
 * Cursor: `MapView` owns the cursor (grab, grabbing while pressed, crosshair
 * while measuring), so engine elements inherit it instead of setting their own.
 */
import { mapOverlayTokens, tokens } from "@karta/theme";
import { globalStyle } from "@vanilla-extract/css";

/** The map region attribute every selector starts from. */
const HOST = "[data-engine]";

/** Prefixes each selector with {@link HOST}. */
function scoped(...selectors: string[]): string {
  return selectors.map((selector) => `${HOST} ${selector}`).join(", ");
}

// Engine controls and attribution. The app draws its own zoom buttons,
// compass and "Map credits" control, so nothing of the engines' shows.
globalStyle(
  scoped(
    ".leaflet-control-container",
    ".maplibregl-control-container",
    ".maplibregl-ctrl",
    ".maplibregl-ctrl-attrib",
    ".maplibregl-ctrl-logo",
  ),
  { display: "none" },
);

// Containers: our type, our map background, a stacking context of their own,
// no blue tap flash.
globalStyle(scoped(".leaflet-container", ".maplibregl-map"), {
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  backgroundColor: mapOverlayTokens.background,
  isolation: "isolate",
  zIndex: 0,
  WebkitTapHighlightColor: "transparent",
});

globalStyle(scoped(".leaflet-container a"), {
  WebkitTapHighlightColor: "transparent",
});

// Popups and tooltips, should an engine ever draw one, use our type too.
globalStyle(
  scoped(
    ".leaflet-popup-content",
    ".leaflet-popup-content-wrapper",
    ".leaflet-tooltip",
    ".maplibregl-popup-content",
  ),
  {
    fontFamily: tokens.type.family,
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.lineHeight,
  },
);

// The map region carries the focus ring. Engine elements never draw one.
globalStyle(
  scoped(
    ".leaflet-container:focus",
    ".leaflet-container:focus-visible",
    ".maplibregl-map:focus",
    ".maplibregl-canvas-container:focus",
    ".maplibregl-canvas:focus",
  ),
  { outline: "none", boxShadow: "none" },
);

// Cursors inherit from the region. Leaflet puts `.leaflet-dragging` on the
// body while dragging, so that rule starts outside the region.
globalStyle(
  [
    scoped(
      ".leaflet-grab",
      ".leaflet-crosshair",
      ".leaflet-crosshair .leaflet-interactive",
      ".maplibregl-canvas-container.maplibregl-interactive",
      ".maplibregl-canvas-container.maplibregl-interactive:active",
      ".maplibregl-canvas-container.maplibregl-interactive.maplibregl-track-pointer",
    ),
    `.leaflet-dragging ${HOST} .leaflet-grab`,
    `.leaflet-dragging ${HOST} .leaflet-grab .leaflet-interactive`,
  ].join(", "),
  { cursor: "inherit" },
);
