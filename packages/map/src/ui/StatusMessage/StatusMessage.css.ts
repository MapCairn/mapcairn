import { tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

/**
 * A toast or banner. The doubled `&&` selector lifts the error colours above
 * the surface's own background without relying on stylesheet order.
 */
export const statusMessage = recipe({
  base: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: tokens.space.sm,
    paddingBlock: tokens.space.xs,
    paddingInlineStart: tokens.space.md,
    paddingInlineEnd: tokens.space.xs,
    fontFamily: tokens.type.family,
    fontWeight: tokens.type.weight.regular,
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.lineHeight,
    letterSpacing: tokens.type.body.tracking,
  },
  variants: {
    variant: {
      info: {},
      success: {},
      error: {
        selectors: {
          "&&": {
            backgroundColor: tokens.color.dangerTint,
            borderColor: tokens.color.danger,
          },
        },
      },
    },
  },
  defaultVariants: { variant: "info" },
});

/**
 * The message text. It takes the remaining width and wraps. On a narrow
 * screen the action and dismiss controls drop to their own row instead of
 * squeezing the words into a few letters a line.
 */
export const messageText = style({
  flex: "1 1 40%",
  minWidth: 0,
  overflowWrap: "anywhere",
});

/** The status icon, tinted by variant. The icon is never the only cue. */
export const statusIcon = recipe({
  base: {},
  variants: {
    variant: {
      info: { color: tokens.color.accent },
      success: { color: tokens.color.accent },
      error: { color: tokens.color.danger },
    },
  },
});

/** The trailing action and dismiss controls. */
export const controls = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.xxs,
  flexShrink: 0,
  marginInlineStart: "auto",
});
