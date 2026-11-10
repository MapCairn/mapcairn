import { focusRing, tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/** The group: a raised track holding the items side by side. */
export const group = style({
  display: "flex",
  gap: tokens.space.xxs,
  padding: tokens.space.xxs,
  border: `1px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  forcedColorAdjust: "none",
});

/**
 * One option. Unselected items are plain text on the track; the selected item
 * is filled and also shows a check mark, so selection never relies on colour
 * alone. Items are at least 44px tall.
 */
export const item = style({
  appearance: "none",
  boxSizing: "border-box",
  display: "flex",
  flex: "1 1 auto",
  alignItems: "center",
  justifyContent: "center",
  gap: tokens.space.xs,
  minWidth: 0,
  minHeight: tokens.size.minTarget,
  margin: 0,
  padding: `0 ${tokens.space.md}`,
  border: "1px solid transparent",
  borderRadius: tokens.radius.inner,
  backgroundColor: "transparent",
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  cursor: "pointer",
  forcedColorAdjust: "none",
  selectors: {
    '&[data-state="on"]': {
      backgroundColor: tokens.color.accent,
      color: tokens.color.accentContrast,
      fontWeight: tokens.type.weight.semibold,
    },
    "&:focus-visible": focusRing,
    "&:disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  "@media": {
    "(hover: hover)": {
      selectors: {
        '&:hover:not(:disabled)[data-state="off"]': {
          backgroundColor: tokens.color.accentTint,
        },
      },
    },
  },
});

/** Wrapper that sizes an optional item icon to the icon token. */
export const icon = style({
  display: "inline-flex",
  flexShrink: 0,
  width: tokens.size.icon,
  height: tokens.size.icon,
});

globalStyle(`${icon} > svg`, {
  width: "100%",
  height: "100%",
  strokeWidth: tokens.size.iconStroke,
});

/** The check mark on the selected item. */
export const check = style({
  flexShrink: 0,
  width: tokens.size.icon,
  height: tokens.size.icon,
  strokeWidth: tokens.size.iconStroke,
});
