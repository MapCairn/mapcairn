import { focusRing, tokens, zLayer } from "@karta/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/**
 * The wrapper: the pill and, below it, the results panel in normal flow. The
 * slot that holds it owns its position, so nothing here is absolute.
 */
export const root = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  width: "100%",
  minWidth: 0,
});

/** The 48px pill row: input, clear button, Search button. */
export const pill = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.xs,
  boxSizing: "border-box",
  height: tokens.size.control,
  paddingInlineStart: tokens.space.md,
  paddingInlineEnd: tokens.space.xxs,
  selectors: {
    "&:has(> input:focus-visible)": focusRing,
  },
});

/**
 * The input, 17px (the `large` step) so iOS does not zoom on focus. The
 * focus ring is drawn on the pill with `:has(input:focus-visible)`, so the input itself
 * has no outline of its own.
 */
export const input = style({
  flex: "1 1 auto",
  minWidth: 0,
  height: "100%",
  margin: 0,
  padding: 0,
  border: "none",
  borderRadius: tokens.radius.inner,
  backgroundColor: "transparent",
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  textOverflow: "ellipsis",
  selectors: {
    // The pill draws the focus ring (:has(> input:focus-visible)); a transparent
    // outline hides the browser default but stays visible in forced-colours mode.
    "&:focus": { outline: "2px solid transparent" },
    "&::placeholder": { color: tokens.color.textMuted, opacity: 1 },
  },
});

/** The results panel, on the raised chrome layer so it sits over the other chrome. */
export const panel = style({
  position: "relative",
  zIndex: zLayer("chromeRaised"),
  display: "flex",
  flexDirection: "column",
  maxHeight: "50dvh",
  overflowY: "auto",
  overscrollBehavior: "contain",
  selectors: {
    "&[hidden]": { display: "none" },
  },
});

/** The listbox. It is hidden while it has no options. */
export const listbox = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
  selectors: {
    "&:empty": { display: "none" },
  },
});

/**
 * One option. The active option has a tint, a start bar (a border, so forced
 * colours still draws it) and a chevron, so it never relies on colour alone.
 */
export const option = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  minHeight: tokens.size.control,
  paddingBlock: tokens.space.xs,
  paddingInline: tokens.space.md,
  borderInlineStart: `${tokens.space.xxs} solid transparent`,
  color: tokens.color.text,
  cursor: "pointer",
  selectors: {
    "& + &": { borderBlockStart: `1px solid ${tokens.color.hairline}` },
    '&[aria-selected="true"]': {
      backgroundColor: tokens.color.accentTint,
      borderInlineStartColor: tokens.color.accent,
    },
  },
  "@media": {
    "(hover: hover)": {
      selectors: {
        '&:hover:not([aria-selected="true"])': {
          backgroundColor: tokens.color.hairline,
        },
      },
    },
  },
});

/** Label and secondary label, stacked. */
export const optionText = style({
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minWidth: 0,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** The place name. */
export const optionLabel = style({ fontWeight: tokens.type.weight.semibold });

/** The quieter second line. */
export const optionSecondary = style({
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The chevron that marks the active option. It takes no space when absent. */
export const chevron = style({
  flexShrink: 0,
  color: tokens.color.accent,
});

/** A line of text in the panel (searching, nothing found, unavailable). */
export const message = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  minHeight: tokens.size.control,
  paddingBlock: tokens.space.xs,
  paddingInline: tokens.space.md,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  color: tokens.color.text,
});

globalStyle(`${listbox} + ${message}`, {
  borderBlockStart: `1px solid ${tokens.color.hairline}`,
});
