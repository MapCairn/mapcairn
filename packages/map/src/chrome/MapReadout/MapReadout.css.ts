// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { surfaceBlurStyle, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * The scale and the coordinates sit on the same translucent chrome surface as
 * the other controls (opaque under reduced transparency and more contrast), so
 * their text and line read over any basemap in either theme instead of
 * depending on the map behind them.
 */
const onSurface = {
  ...surfaceBlurStyle,
  boxSizing: "border-box",
  padding: `${tokens.space.xxs} ${tokens.space.xs}`,
  borderRadius: tokens.radius.inner,
  color: tokens.color.text,
  boxShadow: tokens.shadow.floating,
} as const;

/** Thickness of the scale line and its end ticks. */
const lineWeight = `calc(${tokens.space.xxs} / 2)`;

/** The scale bar and coordinates, stacked at the start edge. */
export const readout = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: tokens.space.xxs,
});

/**
 * The scale bar: a label over a thin line. It fades
 * out when idle (see `data-idle`); the duration tokens drop to near zero under
 * reduced motion, and the component never sets it idle then anyway.
 */
export const scaleBar = style({
  ...onSurface,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: tokens.space.xxs,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontWeight: tokens.type.weight.semibold,
  fontVariantNumeric: "tabular-nums",
  opacity: 1,
  transition: `opacity ${tokens.motion.duration.slow} ${tokens.motion.easing}`,
  selectors: {
    '&[data-idle="true"]': { opacity: 0 },
  },
});

/**
 * The line and its two ticks share one grid cell. The track is as wide as the
 * widest bar allowed (`--scale-max`); the line scales to `--scale-ratio` of it
 * and the end tick moves with it, so a change of scale animates transform only.
 */
export const track = style({
  display: "grid",
  width: "var(--scale-max, 0px)",
  height: tokens.space.xs,
});

const tickBase = {
  gridArea: "1 / 1",
  width: lineWeight,
  height: "100%",
  backgroundColor: tokens.color.text,
} as const;

/** The line. Scaled from its start edge. */
export const line = style({
  gridArea: "1 / 1",
  alignSelf: "end",
  width: "100%",
  height: lineWeight,
  backgroundColor: tokens.color.text,
  transformOrigin: "left center",
  transform: "scaleX(var(--scale-ratio, 0))",
  transition: `transform ${tokens.motion.duration.base} ${tokens.motion.easing}`,
});

/** The tick at the start of the line. */
export const tickStart = style({ ...tickBase, justifySelf: "start" });

/** The tick at the end of the line, moved to wherever the line ends. */
export const tickEnd = style({
  ...tickBase,
  justifySelf: "start",
  transform: `translateX(calc(var(--scale-ratio, 0) * var(--scale-max, 0px) - ${lineWeight}))`,
  transition: `transform ${tokens.motion.duration.base} ${tokens.motion.easing}`,
});

/**
 * Cursor coordinates and zoom level: muted text on the same surface as the
 * scale, in one line of inline text so that a copy of it stays one line.
 */
export const coordinates = style({
  ...onSurface,
  color: tokens.color.textMuted,
  margin: 0,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontWeight: tokens.type.weight.regular,
  fontVariantNumeric: "tabular-nums",
});

/** The zoom, one small spacing step after the coordinates when they come first. */
export const zoomLevel = style({
  selectors: { "* + &": { marginInlineStart: tokens.space.xs } },
});

/** The drawn "z 12.4", kept out of a copy of the text, which carries the hidden "Zoom 12.4" instead. */
export const unselectable = style({ userSelect: "none" });
