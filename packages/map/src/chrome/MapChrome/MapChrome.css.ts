// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { PANEL_MAX_HEIGHT_EXCLUSIVE, PANEL_MIN_WIDTH } from "@mapcairn/core";
import { tokens, zLayer } from "@mapcairn/theme";
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

/** The grid of the panel layout: search in a first column as wide as the side panel. */
const panelGrid = {
  gridTemplateColumns: `minmax(0, ${panelWidth}) minmax(0, 1fr) auto`,
  gridTemplateAreas: '"top . end" ". . end" "start . end-bottom"',
} as const;

/**
 * The media query that matches the panel layout `chooseLayout` picks, built
 * from the same constants. The server-rendered skeleton uses it because the
 * server cannot measure the container; the live chrome chooses in script.
 */
export const panelLayoutQuery = `(min-width: ${PANEL_MIN_WIDTH}px), (height < ${PANEL_MAX_HEIGHT_EXCLUSIVE}px)`;

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
    '&[data-layout="panel"]': panelGrid,
  },
});

/**
 * The container of the server-rendered skeleton: {@link root} with the same
 * grid, padding and slot classes, but the layout chosen by a media query
 * instead of by measurement.
 */
export const skeletonRoot = style([
  root,
  { "@media": { [panelLayoutQuery]: panelGrid } },
]);

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

/**
 * The first-visit tour card, in a grid cell that is otherwise empty, so it
 * never meets another slot. Sheet layout: under the search pill, beside the
 * end stack, clear of the sheet at peek and half. Panel layout: the column
 * between search (as wide as the panel) and the end stack, against either
 * side as `data-side` says. It hides with the bottom slots at full, and
 * whenever the bottom row, lifted above the sheet or a toolbar, would reach
 * it (`data-crowded`, set by `MapChrome` from its measurements).
 */
export const tour = style({
  ...slotBase,
  gridRow: 2,
  gridColumn: 1,
  alignSelf: "start",
  justifySelf: "start",
  width: "100%",
  maxWidth: `calc(${tokens.space.xl} * 10)`,
  opacity: 1,
  transition: slideTransition,
  selectors: {
    [whenHidden]: hidden,
    '&[data-crowded="true"]': hidden,
    [`${root}[data-layout="panel"] &`]: {
      gridColumn: 2,
      gridRow: "1 / 3",
    },
    [`${root}[data-layout="panel"] &[data-side="end"]`]: {
      justifySelf: "end",
    },
  },
});

/**
 * The map key, in the grid cell above the scale bar (the one the tour card
 * also uses, from the top), aligned to its bottom edge. `MapChrome` moves it
 * up to a gap above the lifted bottom row and caps its height, and moves it
 * clear of the side panel the way it moves bottom-start. It gives way when
 * there is no room (`data-crowded`), at the full detent and while the
 * credits popover, which grows over this corner, is open.
 */
export const mapKey = style({
  ...bottomBase,
  gridRow: 2,
  gridColumn: 1,
  justifySelf: "start",
  maxWidth: "100%",
  transform: `translate(${chromeVar(chromeVars.bottomStartX, "0px")}, ${chromeVar(chromeVars.mapKeyLift, "0px")})`,
  selectors: {
    [whenHidden]: hidden,
    '&[data-crowded="true"]': hidden,
    [`${root}:has([data-chrome="attribution-popover"]:not([hidden])) &`]:
      hidden,
  },
});

/** Attribution. Rides above the sheet with bottom-start. */
export const bottomEnd = style({
  ...bottomBase,
  gridArea: "end-bottom",
  justifySelf: "end",
  transform: `translateY(${chromeVar(chromeVars.bottomLift, "0px")})`,
  selectors: { [whenHidden]: hidden },
});
