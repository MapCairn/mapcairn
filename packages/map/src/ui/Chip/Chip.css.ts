import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

/**
 * A small pill for filters and tags. Selection changes the fill, the border
 * and the leading icon (a check), so it never relies on colour. An actionable
 * chip is 44 px tall so it is a proper target.
 */
export const chip = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.space.xs,
    boxSizing: "border-box",
    margin: 0,
    paddingBlock: tokens.space.xxs,
    paddingInline: tokens.space.sm,
    border: `1px solid ${tokens.color.controlBoundary}`,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surfaceRaised,
    color: tokens.color.text,
    fontFamily: tokens.type.family,
    fontWeight: tokens.type.weight.regular,
    fontSize: tokens.type.small.size,
    lineHeight: tokens.type.small.lineHeight,
    letterSpacing: tokens.type.small.tracking,
    whiteSpace: "nowrap",
  },
  variants: {
    actionable: {
      true: {
        minHeight: tokens.size.minTarget,
        cursor: "pointer",
        transition: `transform ${tokens.motion.duration.fast} ${tokens.motion.easing}`,
        selectors: {
          "&:focus-visible": focusRing,
          "&:active": { transform: "scale(0.97)" },
        },
      },
      false: {},
    },
    selected: {
      true: {
        backgroundColor: tokens.color.accentTint,
        borderColor: tokens.color.accent,
        fontWeight: tokens.type.weight.semibold,
      },
      false: {},
    },
  },
  compoundVariants: [
    {
      variants: { actionable: true, selected: false },
      style: {
        "@media": {
          "(hover: hover)": {
            selectors: {
              "&:hover": { backgroundColor: tokens.color.hairline },
            },
          },
        },
      },
    },
  ],
  defaultVariants: { actionable: false, selected: false },
});

/** The check shown in place of the leading icon when selected. */
export const selectedMark = style({ color: tokens.color.accent });
