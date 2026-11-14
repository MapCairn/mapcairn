// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, mapOverlayTokens, tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

const small = {
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
} as const;

/** The halo under the open card's ring, so it reads on any basemap. */
export const selectionHalo = style({
  fill: "none",
  stroke: mapOverlayTokens.halo,
  strokeWidth: `calc(${tokens.space.xxs} + 2 * ${tokens.focus.innerWidth})`,
});

/** The ring around the point whose card is open. */
export const selectionRing = style({
  fill: "none",
  stroke: mapOverlayTokens.pin,
  strokeWidth: tokens.space.xxs,
});

/** A marker glyph. Its edge and halo are drawn in the SVG, the same as on the map. */
export const glyph = style({
  flexShrink: 0,
});

/** Groups of layers, stacked. */
export const groups = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
});

/** One group: its heading, then its layers. */
export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** A group's heading, with its Turn off action at the end. It wraps on a narrow sheet. */
export const groupHeader = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.xs,
});

/** The Turn off all button with its status and Undo below it. */
export const turnOffRow = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: tokens.space.xs,
});

/**
 * A group's Turn off button and its status. The wrapper draws no box, so both
 * join the heading's row: the button at its end, and the status, as wide as
 * the row, on a line of its own.
 */
export const groupActions = style({ display: "contents" });

/**
 * A group's Turn off button. It takes back the horizontal padding that
 * `Button` gives every variant (`paddingInline: tokens.space.md`), so its
 * words line up with the group heading when they wrap under it and with the
 * sheet's edge when they sit at the end of its row. It follows that padding:
 * change the two together.
 */
export const groupTurnOff = style({
  marginInline: `calc(-1 * ${tokens.space.md})`,
});

/** The count inside the Turn off all button, such as "3 on". */
export const turnOffCount = style({
  fontWeight: tokens.type.weight.regular,
  fontVariantNumeric: "tabular-nums",
});

/** What a Turn off action says once it has run, with Undo after it. */
export const undoStatus = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xs,
  boxSizing: "border-box",
  width: "100%",
  color: tokens.color.text,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  fontVariantNumeric: "tabular-nums",
});

/** The plain list of layers in a group. */
export const layerList = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One layer, separated from the next by a hairline. */
export const layerItem = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  paddingBlock: tokens.space.sm,
  selectors: {
    "& + &": { borderBlockStart: `1px solid ${tokens.color.hairline}` },
  },
});

/** Muted supporting text: data cost, status, notes. */
export const muted = style({
  margin: 0,
  color: tokens.color.textMuted,
  ...small,
  fontVariantNumeric: "tabular-nums",
});

/** The text above the layers, saying nothing loads until a layer is on. */
export const intro = style({
  margin: 0,
  color: tokens.color.textMuted,
  ...small,
});

/** The status line with an optional Retry button. */
export const status = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: tokens.space.xs,
  margin: 0,
  color: tokens.color.textMuted,
  ...small,
  fontVariantNumeric: "tabular-nums",
});

/** The error part of a status line, in the danger colour beside its icon. */
export const statusError = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xxs,
  color: tokens.color.danger,
});

/** The waiting part of a status line, beside its icon, in the line's own muted colour. */
export const statusWaiting = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xxs,
});

/** A layer's controls and everything shown while it is on. */
export const details = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
});

/** A labelled control: the visible label, then the control. */
export const field = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.semibold,
  ...small,
});

/** The native date input, as tall as every other control. */
export const dateInput = style({
  boxSizing: "border-box",
  minHeight: tokens.size.minTarget,
  paddingInline: tokens.space.sm,
  border: `1px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.inner,
  backgroundColor: tokens.color.surfaceRaised,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  fontVariantNumeric: "tabular-nums",
  selectors: {
    "&:focus-visible": focusRing,
    "&:disabled": { opacity: 0.5 },
  },
});

/** A date and time control: a fieldset with no frame of its own. */
export const timeField = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
});

/** The date and time control's visible name, styled as every control label. */
export const timeLegend = style({
  padding: 0,
  marginBlockEnd: tokens.space.xs,
  color: tokens.color.textMuted,
  fontWeight: tokens.type.weight.semibold,
  ...small,
});

/** The date and the time side by side, wrapping on a narrow sheet. */
export const timeInputs = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.sm,
});

/** The legend: one entry per colour, each with its words. */
export const legend = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
  margin: 0,
  padding: 0,
  listStyle: "none",
  color: tokens.color.text,
  ...small,
});

/** The legend with one entry on each row, for a panel too narrow to wrap them side by side. */
export const legendStacked = style([
  legend,
  { flexDirection: "column", flexWrap: "nowrap", gap: tokens.space.xxs },
]);

/** One legend entry: the glyph and its label. */
export const legendEntry = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xxs,
  marginInlineEnd: tokens.space.sm,
});

/**
 * One entry of a stacked legend. Every glyph is centred in a column of one
 * fixed width, so the words line up whatever the markers' sizes.
 */
export const legendEntryStacked = style({
  display: "grid",
  gridTemplateColumns: `calc(${tokens.space.xl} * 1.25) 1fr`,
  alignItems: "center",
  columnGap: tokens.space.xs,
});

globalStyle(`${legendEntryStacked} > svg`, { justifySelf: "center" });

/** The hazard note, with its icon. */
export const disclaimer = style({
  display: "flex",
  alignItems: "flex-start",
  gap: tokens.space.xs,
  margin: 0,
  color: tokens.color.text,
  ...small,
});

/** The collapsible list of loaded features. */
export const featureList = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** The summary that opens the list: a full target with a focus ring. */
export const listSummary = style({
  display: "flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
  cursor: "pointer",
  color: tokens.color.accent,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  selectors: { "&:focus-visible": focusRing },
});

/** The rows of the list. */
export const rows = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One row's list item, with a hairline between rows. */
export const rowItem = style({
  margin: 0,
  padding: 0,
  selectors: {
    "& + &": { borderBlockStart: `1px solid ${tokens.color.hairline}` },
  },
});

/** A row: a full-width button that shows the feature on the map. */
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.sm,
  boxSizing: "border-box",
  width: "100%",
  minHeight: tokens.size.control,
  margin: 0,
  paddingBlock: tokens.space.xs,
  paddingInline: tokens.space.xs,
  border: "none",
  backgroundColor: "transparent",
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  textAlign: "start",
  cursor: "pointer",
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": { backgroundColor: tokens.color.hairline },
  },
  "@media": {
    "(hover: hover)": {
      selectors: { "&:hover": { backgroundColor: tokens.color.hairline } },
    },
  },
});

/** The row's two lines of text. */
export const rowText = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

/** The row's first line. */
export const rowTitle = style({
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
  overflowWrap: "anywhere",
});

/** The row's second line. */
export const rowSecondary = style({
  color: tokens.color.textMuted,
  ...small,
  fontVariantNumeric: "tabular-nums",
});

/** The feature card. The sheet or panel provides the surface. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  paddingBlockEnd: tokens.space.sm,
  borderBlockEnd: `1px solid ${tokens.color.hairline}`,
  color: tokens.color.text,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  letterSpacing: tokens.type.body.tracking,
});

/** The card heading and its close button. */
export const cardHeader = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: tokens.space.sm,
});

/** The card heading. It takes focus by script when a tap opens the card. */
export const cardHeading = style({
  margin: 0,
  fontSize: tokens.type.large.size,
  fontWeight: tokens.type.weight.semibold,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  overflowWrap: "anywhere",
  selectors: {
    "&:focus-visible": focusRing,
    "&:focus:not(:focus-visible)": { outline: "none" },
  },
});

/** A line of the card. */
export const cardLine = style({
  margin: 0,
  overflowWrap: "anywhere",
  fontVariantNumeric: "tabular-nums",
});

/** The category or step of the feature: its glyph and words. */
export const cardLevel = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.xs,
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
});

/** The link to the provider's page. */
export const cardLink = style({
  alignSelf: "flex-start",
  color: tokens.color.accent,
  selectors: { "&:focus-visible": focusRing },
});

/** The card's buttons. They wrap on a narrow sheet. */
export const cardActions = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
  marginBlockStart: tokens.space.xs,
});
