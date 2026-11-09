import { tokens } from "@karta/theme";
import { globalStyle, style } from "@vanilla-extract/css";
import { chromeVar, chromeVars } from "../MapChrome/chromeVars";

/**
 * The end stack: compass, main group and zoom group in a column with the
 * 12 px gap. It is capped at the height `MapChrome` measures and scrolls
 * beyond it. The padding (cancelled by a negative margin) gives focus rings
 * and shadows room inside the scroll container, which would otherwise clip
 * them. The scrollbar is hidden so it never narrows the 48 px targets or
 * sits over the map; wheel, touch and focus (which scrolls the focused
 * control into view) all still scroll it.
 */
export const stack = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  maxHeight: chromeVar(chromeVars.endStackMaxHeight, "none"),
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollbarWidth: "none",
  padding: tokens.space.xs,
  margin: `calc(-1 * ${tokens.space.xs})`,
  selectors: {
    "&::-webkit-scrollbar": { display: "none" },
  },
});

/**
 * The skeleton's stack: the live stack's box with nothing to scroll, so it
 * does not clip the groups' shadows (a hard edge shows on a flat background).
 */
export const skeletonStack = style([stack, { overflowY: "visible" }]);

/** The compass surface, the same shape as a one-button control group. */
export const compassSurface = style({
  display: "flex",
  flexShrink: 0,
});

/**
 * The compass button. Its arrow points to north: the map's bearing comes in
 * as `--chrome-bearing` (set with CSSOM) and the icon turns the other way.
 */
export const compass = style({ borderRadius: tokens.radius.control });

globalStyle(`${compass} svg`, {
  transform: "rotate(calc(-1 * var(--chrome-bearing, 0deg)))",
  transition: `transform ${tokens.motion.duration.base} ${tokens.motion.easing}`,
});

/** Keeps a group at its natural height inside the scrolling column. */
export const group = style({ flexShrink: 0 });

/**
 * Wraps the skeleton's zoom group. It takes no box of its own and shows only
 * where the live stack shows zoom buttons by default, a fine pointer that can
 * hover (the query `BrowserDevicePreferences` uses). A stored "always" or
 * "never" cannot be known on the server, so the skeleton follows the default.
 */
export const skeletonZoom = style({
  display: "none",
  "@media": {
    "(hover: hover) and (pointer: fine)": { display: "contents" },
  },
});
