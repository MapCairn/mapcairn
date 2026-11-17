// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/*
 * The product page: calm and in one reading column. The hero carries the
 * pitch, the two actions and the survey sheet beside them; every section
 * below is a heading and a few short blocks, with the detail one tap away in
 * native disclosures. Mobile first: one column at 320 px; from the `wide`
 * width the hero puts the art beside its words. Tokens only.
 */

/** From here the hero puts its art beside its words. */
const WIDE = "screen and (min-width: 56rem)";

/** From here the two actions sit side by side. */
const ROOMY = "screen and (min-width: 30rem)";

/** The reading width of the sections, about 65 characters of the large type. */
const MEASURE = "40rem";

/** The tallest the code example gets before it scrolls inside its own box. */
const CODE_HEIGHT = "26rem";

/** The widest the art gets, so it stays beside the words rather than taking over. */
const ART_WIDTH = "30rem";

/** The widest the page gets. */
const PAGE_WIDTH = "72rem";

/** The space between sections: two of the largest steps. */
const SECTION_SPACE = `calc(${tokens.space.xl} * 2)`;

/** The scrolling page: the document is fixed for the map, so this scrolls itself. */
export const scroller = style({
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  backgroundColor: tokens.color.pageBackground,
  color: tokens.color.text,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontVariantNumeric: "tabular-nums",
  // A long word breaks rather than widen the page, at 320 px and 200 percent text.
  overflowWrap: "break-word",
});

/** The page's outer column. */
const pageColumn = {
  width: "100%",
  maxWidth: PAGE_WIDTH,
  marginInline: "auto",
  paddingInline: tokens.space.md,
} as const;

/** The header: the brand, then the playground and the source. */
export const header = style({
  ...pageColumn,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  columnGap: tokens.space.md,
  paddingBlock: tokens.space.xs,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  "@media": {
    [WIDE]: { paddingInline: tokens.space.xl },
  },
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

/** The hero: words first, then the art below them, or beside them on a wide screen. */
export const hero = style({
  ...pageColumn,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  alignItems: "center",
  gap: tokens.space.xl,
  paddingBlock: tokens.space.xl,
  "@media": {
    [WIDE]: {
      gridTemplateColumns: "minmax(0, 6fr) minmax(0, 5fr)",
      paddingInline: tokens.space.xl,
      paddingBlock: SECTION_SPACE,
      columnGap: SECTION_SPACE,
    },
  },
});

/** The hero's words. */
export const heroText = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.lg,
  minWidth: 0,
});

/** The hero's art: quiet, and only as wide as it needs to be. */
export const heroArt = style({
  minWidth: 0,
  maxWidth: ART_WIDTH,
});

/** The page's one h1, at the display size on a wide screen and smaller on a phone. */
export const headline = style({
  margin: 0,
  fontSize: `clamp(${tokens.type.title.size}, 8vw, ${tokens.type.display.size})`,
  lineHeight: tokens.type.display.lineHeight,
  letterSpacing: tokens.type.display.tracking,
  fontWeight: tokens.type.weight.semibold,
  textWrap: "balance",
});

/** The paragraph under the h1. */
export const lede = style({
  margin: 0,
  maxWidth: MEASURE,
  color: tokens.color.textMuted,
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

/** The quiet line under the actions. */
export const note = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  color: tokens.color.textMuted,
});

/** One section: a heading and a few blocks, in the reading column, with room around it. */
export const section = style({
  ...pageColumn,
  paddingBlock: tokens.space.xl,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: tokens.space.md,
  scrollMarginBlockStart: tokens.space.md,
  "@media": {
    [WIDE]: {
      paddingInline: tokens.space.xl,
      paddingBlock: SECTION_SPACE,
    },
  },
});

// Every block of a section keeps to the reading width, aligned with the hero's words.
globalStyle(`${section} > *`, {
  maxWidth: MEASURE,
});

/** A section's heading. */
export const sectionHeading = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
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
  fontWeight: tokens.type.weight.semibold,
});

/** A list, with the markers inside the column so nothing hangs past its edge. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  margin: 0,
  paddingInlineStart: tokens.space.lg,
});

/** A link in running text or a list. */
export const link = style({
  color: tokens.color.accent,
  // Padding on an inline link grows the box it is hit in, not the line, so
  // even a link in a list is a 24 px target (WCAG 2.5.8).
  paddingBlock: tokens.space.xxs,
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
  overflow: "auto",
  maxWidth: MEASURE,
  // A tall example scrolls inside its own box, so it does not take over the page.
  maxHeight: CODE_HEIGHT,
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

/** A list of disclosures, ruled apart. */
export const disclosures = style({
  display: "flex",
  flexDirection: "column",
  borderBlockStart: `1px solid ${tokens.color.hairline}`,
});

/** One disclosure. */
export const disclosure = style({
  borderBlockEnd: `1px solid ${tokens.color.hairline}`,
});

/** A disclosure's one-line summary: a 44 px target with a chevron at its end. */
export const summary = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  minHeight: tokens.size.control,
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

/** The chevron that says whether a disclosure is open: down when closed, up when open. */
export const marker = style({
  flexShrink: 0,
  color: tokens.color.textMuted,
  selectors: {
    "details[open] > summary > &": { transform: "rotate(180deg)" },
  },
});

/** A disclosure's detail. */
export const detail = style({
  margin: 0,
  paddingBlockEnd: tokens.space.md,
  maxWidth: MEASURE,
  color: tokens.color.text,
});

/** The links that go further, at the foot of a section. */
export const further = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A link on its own line: a full-size target. */
export const blockLink = style([
  link,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.space.xs,
    minHeight: tokens.size.minTarget,
  },
]);

/** The deep links into the playground. */
export const deepLinks = style([further]);

/** The compass before each deep link. */
export const linkIcon = style({
  flexShrink: 0,
});

/** The footer: where the project is made, the licence and the links. */
export const footer = style({
  ...pageColumn,
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  paddingBlock: tokens.space.xl,
  marginBlockStart: tokens.space.xl,
  borderBlockStart: `1px solid ${tokens.color.hairline}`,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  color: tokens.color.textMuted,
  "@media": {
    [WIDE]: { paddingInline: tokens.space.xl },
  },
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

/** The line that says where the project is made, with the heart beside it. */
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
