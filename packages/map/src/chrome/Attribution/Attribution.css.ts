import { focusRing, surfaceBlurStyle, tokens, zLayer } from "@karta/theme";
import { style } from "@vanilla-extract/css";
import { chromeVar, chromeVars } from "../MapChrome/chromeVars";

/**
 * The anchor for the popover. The button sits at the end edge of the
 * bottom-end slot; the popover is positioned against this box.
 */
export const root = style({
  position: "relative",
  display: "flex",
  justifyContent: "flex-end",
});

/**
 * The credits popover. It grows upwards and inwards from the button, on the
 * `chromeRaised` layer. Its width is capped at the chrome width minus both
 * insets, and its height at the room `MapChrome` measures between the end
 * stack and this slot, so it never covers the end stack above it or the
 * scale bar beside the button (which it clears by sitting above the bottom
 * row). Anything longer scrolls inside it.
 */
export const popover = style({
  ...surfaceBlurStyle,
  position: "absolute",
  insetBlockEnd: `calc(100% + ${tokens.space.xs})`,
  insetInlineEnd: 0,
  zIndex: zLayer("chromeRaised"),
  boxSizing: "border-box",
  width: "max-content",
  maxWidth: `calc(${chromeVar(chromeVars.width, "100vw")} - 2 * ${tokens.space.inset})`,
  maxHeight: chromeVar(chromeVars.bottomEndRoom, "none"),
  overflowY: "auto",
  overscrollBehavior: "contain",
  margin: 0,
  padding: `${tokens.space.sm} ${tokens.space.md}`,
  border: `1px solid ${tokens.color.chromeBorder}`,
  borderRadius: tokens.radius.control,
  boxShadow: tokens.shadow.floating,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontWeight: tokens.type.weight.regular,
  selectors: {
    "&[hidden]": { display: "none" },
    "&:focus-visible": focusRing,
  },
});

/** The credit lines, one per row. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/**
 * A credit link: underlined so it is not identified by colour alone, with a
 * tall enough line box to stay easy to hit inside the popover.
 */
export const link = style({
  display: "inline-block",
  paddingBlock: tokens.space.xxs,
  color: tokens.color.accent,
  textDecorationLine: "underline",
  borderRadius: tokens.radius.inner,
  selectors: {
    "&:focus-visible": focusRing,
  },
});
