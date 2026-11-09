import { mapOverlayTokens, tokens, zLayer } from "@karta/theme";
import { keyframes, style, styleVariants } from "@vanilla-extract/css";

/**
 * The map region. It is its own stacking context (`isolation`) on the `map`
 * layer, so nothing inside it, engine panes included, can rise above the
 * chrome. Children share one grid cell, so the engine slot and the loading
 * indicator stack without absolute positioning.
 */
const hostBase = style({
  position: "relative",
  isolation: "isolate",
  zIndex: zLayer("map"),
  display: "grid",
  gridTemplate: "minmax(0, 1fr) / minmax(0, 1fr)",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  backgroundColor: mapOverlayTokens.background,
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  outline: "none",
  selectors: {
    // The focus ring is drawn inside the edge, on a layer above the engine
    // and the overlays: the map usually fills the viewport, so a ring outside
    // it would be off screen, and one on the host itself would sit under the
    // engine canvas.
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      zIndex: zLayer("mapOverlay"),
      pointerEvents: "none",
    },
    "&:focus-visible::after": {
      outline: `${tokens.focus.outerWidth} solid ${tokens.color.focusRing}`,
      outlineOffset: `calc(-1 * ${tokens.focus.outerWidth})`,
      boxShadow: `inset 0 0 0 calc(${tokens.focus.outerWidth} + ${tokens.focus.innerWidth}) ${tokens.color.focusRingInner}`,
    },
  },
});

/**
 * The region's class for each cursor. The host owns the cursor; the engine
 * style file makes engine elements inherit it, so measure mode shows a
 * crosshair over the engine canvas too.
 */
export const host = styleVariants({
  grab: [
    hostBase,
    { cursor: "grab", selectors: { "&:active": { cursor: "grabbing" } } },
  ],
  crosshair: [hostBase, { cursor: "crosshair" }],
});

/** The cell that holds the current engine element. */
export const engineSlot = style({
  gridArea: "1 / 1",
  zIndex: zLayer("map"),
  isolation: "isolate",
  minWidth: 0,
  minHeight: 0,
});

/**
 * The element the engine mounts into. Its own stacking context, so engine
 * z-indexes stay below the overlay layer.
 */
export const engineElement = style({
  width: "100%",
  height: "100%",
  isolation: "isolate",
});

const slide = keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(250%)" },
});

const trackBase = style({
  gridArea: "1 / 1",
  alignSelf: "start",
  zIndex: zLayer("mapOverlay"),
  height: `calc(${tokens.space.xxs} * 0.75)`,
  overflow: "hidden",
  backgroundColor: mapOverlayTokens.loadingTrack,
  pointerEvents: "none",
});

/** The thin loading track at the top of the map, animated or static. */
export const loadingTrack = styleVariants({
  animated: [trackBase],
  static: [trackBase],
});

/** The moving (or, with reduced motion, full-width) bar inside the track. */
export const loadingBar = style({
  height: "100%",
  width: "100%",
  backgroundColor: mapOverlayTokens.loadingIndicator,
  selectors: {
    [`${loadingTrack.animated} &`]: {
      width: "40%",
      animation: `${slide} calc(${tokens.motion.duration.slow} * 4) ${tokens.motion.easing} infinite`,
    },
  },
  "@media": {
    // The motion tokens shrink to almost zero here, which would make the loop
    // flicker, so the animation stops even before the preference reaches React.
    "(prefers-reduced-motion: reduce)": {
      selectors: {
        [`${loadingTrack.animated} &`]: { width: "100%", animation: "none" },
      },
    },
  },
});
