import { focusRing, surfaceBlurStyle, tokens, zLayer } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/**
 * The look of the skip link while it is focused. It is composed with the
 * `visuallyHidden` class, which hides it with the sanctioned clip pattern and
 * owns its positioning. Focus undoes the clip and shows the link in the
 * top-start corner above every other layer. Nothing here positions or hides.
 */
export const skipLink = style({
  selectors: {
    "&:focus": {
      ...surfaceBlurStyle,
      zIndex: zLayer("toast"),
      insetBlockStart: tokens.space.inset,
      insetInlineStart: tokens.space.inset,
      display: "inline-flex",
      alignItems: "center",
      boxSizing: "border-box",
      width: "auto",
      height: "auto",
      minHeight: tokens.size.control,
      margin: 0,
      paddingInline: tokens.space.md,
      overflow: "visible",
      clip: "auto",
      clipPath: "none",
      whiteSpace: "normal",
      border: `1px solid ${tokens.color.chromeBorder}`,
      borderRadius: tokens.radius.pill,
      boxShadow: tokens.shadow.floating,
      color: tokens.color.text,
      fontFamily: tokens.type.family,
      fontWeight: tokens.type.weight.semibold,
      fontSize: tokens.type.body.size,
      lineHeight: tokens.type.body.lineHeight,
      letterSpacing: tokens.type.body.tracking,
      textDecoration: "none",
    },
    "&:focus-visible": focusRing,
  },
});
