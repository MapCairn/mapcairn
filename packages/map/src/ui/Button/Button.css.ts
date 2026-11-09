import { focusRing, tokens } from "@karta/theme";
import { recipe } from "@vanilla-extract/recipes";

const notDisabled = ':not([aria-disabled="true"])';

/**
 * A text button with a leading icon slot. Every variant keeps a 1px border
 * (transparent unless the variant draws one) so forced colours paints the
 * shape and the variants share one box size.
 */
export const button = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
    boxSizing: "border-box",
    minHeight: tokens.size.control,
    margin: 0,
    paddingBlock: tokens.space.xs,
    paddingInline: tokens.space.md,
    border: "1px solid transparent",
    borderRadius: tokens.radius.control,
    fontFamily: tokens.type.family,
    fontWeight: tokens.type.weight.semibold,
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.lineHeight,
    letterSpacing: tokens.type.body.tracking,
    cursor: "pointer",
    transition: `transform ${tokens.motion.duration.fast} ${tokens.motion.easing}, opacity ${tokens.motion.duration.fast} ${tokens.motion.easing}`,
    selectors: {
      "&:focus-visible": focusRing,
      [`&:active${notDisabled}`]: { transform: "scale(0.98)" },
      '&[aria-disabled="true"]': { opacity: 0.5, cursor: "not-allowed" },
      '&[aria-busy="true"]': { cursor: "progress" },
    },
  },
  variants: {
    variant: {
      primary: {
        backgroundColor: tokens.color.accent,
        color: tokens.color.accentContrast,
        "@media": {
          "(hover: hover)": {
            selectors: { [`&:hover${notDisabled}`]: { opacity: 0.9 } },
          },
        },
      },
      secondary: {
        backgroundColor: tokens.color.surfaceRaised,
        borderColor: tokens.color.controlBoundary,
        color: tokens.color.text,
        "@media": {
          "(hover: hover)": {
            selectors: {
              [`&:hover${notDisabled}`]: {
                backgroundColor: tokens.color.accentTint,
              },
            },
          },
        },
      },
      quiet: {
        backgroundColor: "transparent",
        color: tokens.color.accent,
        "@media": {
          "(hover: hover)": {
            selectors: {
              [`&:hover${notDisabled}`]: {
                backgroundColor: tokens.color.accentTint,
              },
            },
          },
        },
      },
    },
  },
  defaultVariants: { variant: "primary" },
});
