import { tokens, zLayer } from "@karta/theme";
import { style } from "@vanilla-extract/css";
import { chromeVar, chromeVars } from "./chromeVars";

/** Width of the side panel column: 360 px on the spacing scale (32 × 11.25). */
const panelWidth = `calc(${tokens.space.xl} * 11.25)`;

/** The screen inset plus the safe area on one side. */
const edge = (side: "top" | "right" | "bottom" | "left") =>
  `calc(${tokens.space.inset} + env(safe-area-inset-${side}, 0px))`;

const slideTransition = [
  `transform ${tokens.motion.duration.fast} ${tokens.motion.easing}`,
  `opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
  `visibility 0s linear 0s`,
].join(", ");

/**
 * The chrome container. It fills its parent, is its own stacking context, and
 * lays the slots out on a grid with token gaps, so neighbours push apart
 * rather than overlap. Padding is the 12 px inset plus the safe area on every
 * side, which also covers the left and right notch in landscape.
 *
 * The container ignores the pointer, so the map below stays draggable in
 * every gap; each slot takes the pointer back.
 *
 * Sheet layout (narrow): search across the top, the end stack under it on
 * the right, the bottom row at the bottom. Panel layout: search in a first
 * column as wide as the side panel, the end stack top right.
 */
export const root = style({
  position: "relative",
  isolation: "isolate",
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  // `clip`, not `hidden`: a hidden box can still be scrolled by script, and
  // `scrollIntoView` on a heading in the translated sheet scrolled the whole
  // chrome off screen. `hidden` is the fallback where `clip` is unsupported.
  overflow: ["hidden", "clip"],
  pointerEvents: "none",
  display: "grid",
  gap: tokens.space.sm,
  paddingBlockStart: edge("top"),
  paddingInlineEnd: edge("right"),
  paddingBlockEnd: edge("bottom"),
  paddingInlineStart: edge("left"),
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  gridTemplateAreas: '"top top" ". end" "start end-bottom"',
  selectors: {
    '&[data-layout="panel"]': {
      gridTemplateColumns: `minmax(0, ${panelWidth}) minmax(0, 1fr) auto`,
      gridTemplateAreas: '"top . end" ". . end" "start . end-bottom"',
    },
  },
});

/**
 * The map, full-bleed behind every slot. It is the page's `main` landmark and
 * the only part of the container that takes the pointer everywhere.
 */
export const background = style({
  position: "absolute",
  inset: 0,
  zIndex: zLayer("map"),
  pointerEvents: "auto",
});

const slotBase = {
  position: "relative",
  zIndex: zLayer("chrome"),
  pointerEvents: "auto",
  minWidth: 0,
  minHeight: 0,
} as const;

/** The search pill: full width on narrow screens, the panel's width otherwise. */
export const topStart = style({
  ...slotBase,
  gridArea: "top",
  alignSelf: "start",
});

/** The right-hand control column. Its own stylesheet caps and scrolls it. */
export const endStack = style({
  ...slotBase,
  gridArea: "end",
  alignSelf: "start",
  justifySelf: "end",
});

/** Shared by the bottom slots: they fade out while the sheet is at full. */
const bottomBase = {
  ...slotBase,
  alignSelf: "end",
  opacity: 1,
  transition: slideTransition,
} as const;

const hidden = {
  opacity: 0,
  visibility: "hidden",
  transition: [
    `transform ${tokens.motion.duration.fast} ${tokens.motion.easing}`,
    `opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    `visibility 0s linear ${tokens.motion.duration.base}`,
  ].join(", "),
} as const;

const whenHidden = `${root}[data-hide-bottom="true"] &`;

/** Scale and coordinates. Rides above the sheet and moves right of the panel. */
export const bottomStart = style({
  ...bottomBase,
  gridArea: "start",
  justifySelf: "start",
  transform: `translate(${chromeVar(chromeVars.bottomStartX, "0px")}, ${chromeVar(chromeVars.bottomLift, "0px")})`,
  selectors: { [whenHidden]: hidden },
});

/**
 * Measure toolbar, toasts and the tile-error banner, centred across the
 * bottom row. It rides above the sheet only; the start and end slots ride
 * above it in turn. In the panel layout it is centred in the space beside
 * the panel.
 */
export const bottomCentre = style({
  ...bottomBase,
  gridRow: 3,
  gridColumn: "1 / -1",
  justifySelf: "center",
  maxWidth: `calc(100% - ${chromeVar(chromeVars.bottomStartX, "0px")})`,
  transform: `translate(calc(${chromeVar(chromeVars.bottomStartX, "0px")} / 2), ${chromeVar(chromeVars.bottomCentreLift, "0px")})`,
  selectors: { [whenHidden]: hidden },
});

/** Attribution. Rides above the sheet with bottom-start. */
export const bottomEnd = style({
  ...bottomBase,
  gridArea: "end-bottom",
  justifySelf: "end",
  transform: `translateY(${chromeVar(chromeVars.bottomLift, "0px")})`,
  selectors: { [whenHidden]: hidden },
});
