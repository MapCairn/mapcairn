// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/*
 * The product page: a survey sheet. The hero is framed by a neatline, like a
 * printed map, with the legend of facts beside the headline; the sections
 * below read like the notes in a sheet's margin, a heading in a narrow column
 * and the text beside it. Mobile first: one column at 320 px, two from the
 * `wide` width. Tokens only.
 */

/** Two columns from here: the hero's text and art, and each section's heading and body. */
const WIDE = "screen and (min-width: 52rem)";

/** Where the header and the footer put their links in one row. */
const ROOMY = "screen and (min-width: 30rem)";

/** The reading width of body text, about 70 characters. */
const MEASURE = "38rem";

/** The widest the page's content gets. */
const PAGE_WIDTH = "72rem";

/** The width of the margin column that holds each section's heading on a wide screen. */
const MARGIN_COLUMN = "16rem";

/** The scrolling page: the document is fixed for the map, so this scrolls itself. */
export const scroller = style({
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  backgroundColor: tokens.color.pageBackground,
  color: tokens.color.text,
  fontVariantNumeric: "tabular-nums",
});

/** The column every block of the page sits in. */
const column = {
  width: "100%",
  maxWidth: PAGE_WIDTH,
  marginInline: "auto",
  paddingInline: tokens.space.md,
  "@media": {
    [WIDE]: { paddingInline: tokens.space.xl },
  },
} as const;

/** The page header: the brand, then the playground and the source. */
export const header = style({
  ...column,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  columnGap: tokens.space.md,
  paddingBlock: tokens.space.xs,
});

/** The brand link: the cairn and the name, a full-size target. */
export const brand = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xs,
  minHeight: tokens.size.minTarget,
  color: tokens.color.text,
  textDecoration: "none",
  borderRadius: tokens.radius.inner,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The header's links. */
export const nav = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One header link: a 44 px target with the text centred in it. */
export const navLink = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
  paddingInline: tokens.space.xs,
  borderRadius: tokens.radius.inner,
  color: tokens.color.accent,
  fontWeight: tokens.type.weight.semibold,
  textDecoration: "underline",
  textDecorationThickness: "1px",
  textUnderlineOffset: "0.25em",
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The main landmark, the skip link's target. */
export const main = style({
  outline: "none",
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The hero's frame: the neatline of the sheet. */
export const hero = style({
  ...column,
  paddingBlock: tokens.space.md,
});

/** The neatline: a ruled frame with the sheet inside. */
export const sheet = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: tokens.space.lg,
  padding: tokens.space.md,
  border: `1px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  "@media": {
    [WIDE]: {
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      alignItems: "center",
      gap: tokens.space.xl,
      padding: tokens.space.xl,
    },
  },
});

/** The hero's words: the headline, the lede, the actions and the legend. */
export const heroText = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  minWidth: 0,
});

/** The page's one h1, at the display size on a wide screen and the title size on a phone. */
export const headline = style({
  margin: 0,
  fontSize: `clamp(${tokens.type.title.size}, 8vw, ${tokens.type.display.size})`,
  lineHeight: tokens.type.display.lineHeight,
  letterSpacing: tokens.type.display.tracking,
  fontWeight: tokens.type.weight.semibold,
  textWrap: "balance",
  overflowWrap: "break-word",
});

/** The paragraph under the h1. */
export const lede = style({
  margin: 0,
  maxWidth: MEASURE,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  color: tokens.color.text,
});

/** The two actions, side by side and the same size, stacked on a narrow phone. */
export const actions = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: tokens.space.xs,
  "@media": {
    [ROOMY]: {
      gridTemplateColumns: "repeat(2, minmax(0, max-content))",
    },
  },
});

/** What both actions share: a 48 px target, the icon and the words centred. */
const action = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: tokens.space.xs,
  minHeight: tokens.size.control,
  paddingInline: tokens.space.lg,
  borderRadius: tokens.radius.pill,
  fontWeight: tokens.type.weight.semibold,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  textDecoration: "none",
  textAlign: "center",
} as const;

/** The primary action: View on GitHub. */
export const primaryAction = style({
  ...action,
  border: `1px solid ${tokens.color.accent}`,
  backgroundColor: tokens.color.accent,
  color: tokens.color.accentContrast,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The secondary action: Try the playground. */
export const secondaryAction = style({
  ...action,
  border: `1px solid ${tokens.color.controlBoundary}`,
  backgroundColor: tokens.color.surfaceRaised,
  color: tokens.color.text,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The legend of facts: term and value pairs, ruled like a map's legend box. */
export const facts = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, max-content) minmax(0, 1fr)",
  columnGap: tokens.space.md,
  margin: 0,
  paddingBlockStart: tokens.space.sm,
  borderBlockStart: `1px solid ${tokens.color.hairline}`,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** One row of the legend: its term and value sit in the legend's own grid. */
export const factRow = style({
  display: "contents",
});

/** A term in the legend. */
export const factTerm = style({
  color: tokens.color.textMuted,
  paddingBlock: tokens.space.xxs,
});

/** A value in the legend. */
export const factValue = style({
  margin: 0,
  paddingBlock: tokens.space.xxs,
});

/** One section of the page. */
export const section = style({
  ...column,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: tokens.space.sm,
  paddingBlock: tokens.space.xl,
  scrollMarginBlockStart: tokens.space.md,
  "@media": {
    [WIDE]: {
      paddingInline: tokens.space.xl,
      gridTemplateColumns: `minmax(0, ${MARGIN_COLUMN}) minmax(0, 1fr)`,
      columnGap: tokens.space.xl,
    },
  },
});

/** A section's heading, in the margin column on a wide screen, under a short rule with a tick. */
export const sectionHeading = style({
  margin: 0,
  paddingBlockStart: tokens.space.sm,
  borderBlockStart: `2px solid ${tokens.color.accent}`,
  maxWidth: MARGIN_COLUMN,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
  alignSelf: "start",
});

/** A section's body: its blocks, in reading order. */
export const sectionBody = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  minWidth: 0,
  maxWidth: MEASURE,
  "@media": {
    [WIDE]: {
      paddingBlockStart: tokens.space.sm,
      borderBlockStart: `1px solid ${tokens.color.hairline}`,
    },
  },
});

/** A paragraph. */
export const paragraph = style({
  margin: 0,
});

/** A subheading inside a section. */
export const subheading = style({
  margin: 0,
  paddingBlockStart: tokens.space.xs,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** A list, with the markers inside the column so nothing hangs past its edge. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  margin: 0,
  paddingInlineStart: tokens.space.md,
});

/** A list of terms: each term above its description. */
export const terms = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  margin: 0,
});

/** A term. */
export const term = style({
  fontWeight: tokens.type.weight.semibold,
});

/** A term's description. */
export const description = style({
  margin: 0,
  color: tokens.color.text,
});

/** A link in running text. */
export const link = style({
  color: tokens.color.accent,
  textDecorationThickness: "1px",
  textUnderlineOffset: "0.2em",
  borderRadius: tokens.radius.inner,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** A name from the code, inline. */
export const code = style({
  fontFamily: tokens.type.familyMono,
  overflowWrap: "anywhere",
});

/** The code example: its own scrolling, focusable region, so it never widens the page. */
export const codeBlock = style({
  margin: 0,
  padding: tokens.space.md,
  overflowX: "auto",
  maxWidth: "100%",
  border: `1px solid ${tokens.color.hairline}`,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.body.lineHeight,
  tabSize: 2,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The links that go deeper, at the foot of a section. */
export const further = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One of them: a full-size target. */
export const furtherLink = style([
  link,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.space.xs,
    minHeight: tokens.size.minTarget,
  },
]);

/** The deep links into the playground. */
export const deepLinks = style([
  further,
  {
    gap: tokens.space.xxs,
    paddingInlineStart: tokens.space.sm,
    borderInlineStart: `2px solid ${tokens.color.accent}`,
  },
]);

/** The questions: each a native disclosure, ruled apart. */
export const faq = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
});

/** One question and its answer. */
export const question = style({
  borderBlockEnd: `1px solid ${tokens.color.hairline}`,
});

/** The question, the disclosure's 44 px summary. */
export const questionSummary = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  minHeight: tokens.size.minTarget,
  paddingBlock: tokens.space.xs,
  cursor: "pointer",
  fontWeight: tokens.type.weight.semibold,
  borderRadius: tokens.radius.inner,
  listStyle: "none",
  selectors: {
    "&:focus-visible": focusRing,
    "&::-webkit-details-marker": { display: "none" },
  },
});

/** The chevron that says whether an answer is open: down when closed, up when open. */
export const questionMarker = style({
  flexShrink: 0,
  color: tokens.color.textMuted,
  selectors: {
    "details[open] > summary > &": { transform: "rotate(180deg)" },
  },
});

/** The answer. */
export const answer = style({
  margin: 0,
  paddingBlockEnd: tokens.space.md,
  color: tokens.color.text,
});

/** The footer: the licence, the links and where it was made. */
export const footer = style({
  ...column,
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  paddingBlock: tokens.space.xl,
  marginBlockStart: tokens.space.xl,
  borderBlockStart: `1px solid ${tokens.color.controlBoundary}`,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  color: tokens.color.textMuted,
});

/** The footer's links, wrapping onto as many rows as they need. */
export const footerLinks = style({
  display: "flex",
  flexWrap: "wrap",
  columnGap: tokens.space.md,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One footer link. */
export const footerLink = style([
  link,
  {
    display: "inline-flex",
    alignItems: "center",
    minHeight: tokens.size.minTarget,
  },
]);

/** A line of the footer. */
export const footerLine = style({
  margin: 0,
});

/** The closing line: where the project is made, with the heart beside it. */
export const made = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xs,
  margin: 0,
  color: tokens.color.text,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
});

/** The heart: drawn in the accent, filled, at the icon size. */
export const heart = style({
  color: tokens.color.accent,
  fill: "currentColor",
  flexShrink: 0,
});
