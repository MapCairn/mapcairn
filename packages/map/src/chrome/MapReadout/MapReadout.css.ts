import { mapOverlayTokens, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * A halo behind text drawn straight on the map, so it reads on light and dark
 * basemaps in both themes. Text shadows rather than a text stroke, because a
 * stroke without `paint-order` support eats into the glyphs.
 */
const textHalo = {
  color: tokens.color.text,
  textShadow: [
    `0 0 ${tokens.space.xxs} ${mapOverlayTokens.halo}`,
    `0 0 ${tokens.space.xxs} ${mapOverlayTokens.halo}`,
    `0 0 ${tokens.space.xs} ${mapOverlayTokens.halo}`,
  ].join(", "),
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
 * The scale bar: a label over a thin line, with no box behind it. It fades
 * out when idle (see `data-idle`); the duration tokens drop to near zero under
 * reduced motion, and the component never sets it idle then anyway.
 */
export const scaleBar = style({
  ...textHalo,
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
  backgroundColor: mapOverlayTokens.scaleLine,
  boxShadow: `0 0 0 1px ${mapOverlayTokens.halo}`,
} as const;

/** The line. Scaled from its start edge. */
export const line = style({
  gridArea: "1 / 1",
  alignSelf: "end",
  width: "100%",
  height: lineWeight,
  backgroundColor: mapOverlayTokens.scaleLine,
  boxShadow: `0 0 0 1px ${mapOverlayTokens.halo}`,
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
 * Cursor coordinates: plain text in the muted colour. The halo keeps it at
 * AA contrast over any basemap.
 */
export const coordinates = style({
  ...textHalo,
  color: tokens.color.textMuted,
  margin: 0,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontWeight: tokens.type.weight.regular,
  fontVariantNumeric: "tabular-nums",
});
