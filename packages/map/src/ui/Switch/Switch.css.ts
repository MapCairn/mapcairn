import { focusRing, tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";

/** Space reserved between the track edge and the thumb. */
const trackInset = `calc(${tokens.space.xxs} / 2)`;
/** Track width: room for two thumbs side by side plus the gap between them. */
const trackWidth = `calc(${tokens.size.icon} * 2 + ${tokens.space.xs})`;
/** Track height: one thumb plus the inset and border on both sides. */
const trackHeight = `calc(${tokens.size.icon} + ${tokens.space.xs})`;

/** The whole row: text on the start side, the control on the end side. */
export const row = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.md,
  minHeight: tokens.size.control,
});

/** Label and description column. The label fills it so the whole text toggles. */
export const text = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

/** The visible label, a real `label` element. */
export const label = style({
  display: "flex",
  alignItems: "center",
  minHeight: tokens.size.control,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  cursor: "pointer",
  selectors: {
    '[data-disabled="true"] > &': { cursor: "not-allowed" },
  },
});

/** Optional supporting text below the label. */
export const description = style({
  marginBlockStart: `calc(${tokens.space.xxs} * -1)`,
  paddingBlockEnd: tokens.space.xs,
  color: tokens.color.textMuted,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/**
 * The track. Its edge is `controlBoundary` so the control is identifiable at
 * 3:1 against the surface in both states; on shows an accent fill as well.
 * `forced-color-adjust: none` keeps the mapped system colours, otherwise the
 * thumb would vanish into the track.
 */
export const track = style({
  appearance: "none",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  width: trackWidth,
  height: trackHeight,
  padding: trackInset,
  border: `2px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.pill,
  backgroundColor: tokens.color.surfaceRaised,
  cursor: "pointer",
  forcedColorAdjust: "none",
  selectors: {
    '&[data-state="checked"]': {
      backgroundColor: tokens.color.accent,
      borderColor: tokens.color.accent,
    },
    "&:focus-visible": focusRing,
    "&:disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  "@media": {
    "(hover: hover)": {
      selectors: {
        '&:hover:not(:disabled)[data-state="unchecked"]': {
          backgroundColor: tokens.color.accentTint,
        },
      },
    },
  },
});

/** The sliding thumb, which carries the tick when on. */
export const thumb = style({
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: tokens.size.icon,
  height: tokens.size.icon,
  padding: tokens.space.xxs,
  borderRadius: tokens.radius.round,
  backgroundColor: tokens.color.controlBoundary,
  color: tokens.color.accent,
  forcedColorAdjust: "none",
  transitionProperty: "transform",
  transitionDuration: tokens.motion.duration.base,
  transitionTimingFunction: tokens.motion.easing,
  selectors: {
    '&[data-state="checked"]': {
      backgroundColor: tokens.color.accentContrast,
      transform: `translateX(${tokens.size.icon})`,
    },
  },
});

/** The tick inside the thumb: a non-colour, non-position cue for the on state. */
export const tick = style({
  width: "100%",
  height: "100%",
  strokeWidth: tokens.size.iconStroke,
});
