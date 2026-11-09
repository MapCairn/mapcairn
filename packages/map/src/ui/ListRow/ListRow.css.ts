import { focusRing, tokens } from "@karta/theme";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

/** The list item. Rows are separated by a hairline, never a border box. */
export const listRow = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
  selectors: {
    "& + &": { borderBlockStart: `1px solid ${tokens.color.hairline}` },
  },
});

/**
 * The row body: a div, or a full-width button when the row is actionable.
 * Selection adds a tint here, and a check icon in the markup, so it never
 * relies on colour.
 */
export const row = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: tokens.space.sm,
    boxSizing: "border-box",
    width: "100%",
    minHeight: tokens.size.control,
    margin: 0,
    paddingBlock: tokens.space.xs,
    paddingInline: tokens.space.md,
    border: "none",
    backgroundColor: "transparent",
    color: tokens.color.text,
    fontFamily: tokens.type.family,
    fontWeight: tokens.type.weight.regular,
    fontSize: tokens.type.body.size,
    lineHeight: tokens.type.body.lineHeight,
    letterSpacing: tokens.type.body.tracking,
    textAlign: "start",
  },
  variants: {
    actionable: {
      true: {
        cursor: "pointer",
        selectors: {
          "&:focus-visible": focusRing,
          "&:active": { backgroundColor: tokens.color.hairline },
        },
        "@media": {
          "(hover: hover)": {
            selectors: {
              "&:hover": { backgroundColor: tokens.color.hairline },
            },
          },
        },
      },
      false: {},
    },
    selected: {
      true: {
        backgroundColor: tokens.color.accentTint,
        selectors: {
          "&:active": { backgroundColor: tokens.color.accentTint },
        },
        "@media": {
          "(hover: hover)": {
            selectors: {
              "&:hover": { backgroundColor: tokens.color.accentTint },
            },
          },
        },
      },
      false: {},
    },
  },
  defaultVariants: { actionable: false, selected: false },
});

/** Wraps the label and secondary text so they stack and take the free width. */
export const text = style({
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minWidth: 0,
});

/** The secondary line under the label. */
export const secondary = style({
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The trailing slot, such as a value or a badge. */
export const trailing = style({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  color: tokens.color.textMuted,
});

/** The selected check. */
export const check = style({ color: tokens.color.accent });
