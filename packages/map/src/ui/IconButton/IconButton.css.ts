import { focusRing, tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

const notDisabled = ':not([aria-disabled="true"])';

/**
 * A square icon button. The pressed state changes shape as well as colour:
 * an accent tint fills the button and a short bar sits under the icon (see
 * {@link pressedBar}), so it reads without colour.
 */
export const iconButton = recipe({
  base: {
    display: "inline-grid",
    placeItems: "center",
    boxSizing: "border-box",
    margin: 0,
    padding: 0,
    border: "none",
    borderRadius: tokens.radius.inner,
    backgroundColor: "transparent",
    color: tokens.color.text,
    cursor: "pointer",
    transition: `transform ${tokens.motion.duration.fast} ${tokens.motion.easing}, opacity ${tokens.motion.duration.fast} ${tokens.motion.easing}`,
    selectors: {
      "&:focus-visible": focusRing,
      [`&:active${notDisabled}`]: { transform: "scale(0.96)" },
      '&[aria-disabled="true"]': { opacity: 0.5, cursor: "not-allowed" },
      '&[aria-busy="true"]': { cursor: "progress" },
    },
    "@media": {
      "(hover: hover)": {
        selectors: {
          [`&:hover${notDisabled}`]: { backgroundColor: tokens.color.hairline },
        },
      },
    },
  },
  variants: {
    size: {
      control: {
        width: tokens.size.control,
        height: tokens.size.control,
      },
      compact: {
        width: tokens.size.minTarget,
        height: tokens.size.minTarget,
      },
    },
    pressed: {
      true: {
        backgroundColor: tokens.color.accentTint,
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
      false: {},
    },
  },
  defaultVariants: { size: "control", pressed: false },
});

/** Puts the icon and the pressed bar in the same grid cell. */
export const iconSlot = style({ gridArea: "1 / 1" });

/**
 * The pressed bar under the icon. It keeps its own colour under forced
 * colours (where the `accent` token maps to `Highlight`), because a forced
 * background would erase the only non-colour cue.
 */
export const pressedBar = style({
  gridArea: "1 / 1",
  alignSelf: "end",
  width: tokens.space.md,
  height: tokens.space.xxs,
  marginBlockEnd: tokens.space.xxs,
  borderRadius: tokens.radius.inner,
  backgroundColor: tokens.color.accent,
  forcedColorAdjust: "none",
});
