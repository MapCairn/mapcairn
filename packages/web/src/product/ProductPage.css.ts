// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens, zLayer } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";
import { captureSubject } from "./captureSubjects";

/*
 * The product page: calm, in one reading column, with generous space and no
 * rules between sections. The hero carries the pitch over a faint contour
 * motif, the one filled button (the playground) and the install command; the
 * picture of the playground follows as the largest thing on the page, edge to
 * edge on a phone; every section below is a heading and a few short blocks.
 * Mobile first: one column at 320 px. Type: the h1 at the display step, h2 at
 * the title step, h3 at the large step in the semibold weight, reading text
 * at the large step, captions and labels at the small step, never below
 * 13 px. Monospace only for code and the badges. Tokens only.
 */

/** From here the picture is the wide capture at the column's width, and the hero's actions share rows. */
const TABLET = "screen and (min-width: 48rem)";

/** From here the button, the install command and the links sit side by side where they fit. */
const ROOMY = "screen and (min-width: 30rem)";

/** From here the hero is two columns: the words at the start, the install command at the end. */
const WIDE = "screen and (min-width: 64rem)";

/** The reading width of the text, about 70 characters of the large type. */
const MEASURE = "38rem";

/** The tallest the code example gets before it scrolls inside its own box. */
const CODE_HEIGHT = "26rem";

/** The widest the closing relief strip gets: its sheet is 640 units wide, so it is drawn at one pixel to the unit. */
const ART_WIDTH = "40rem";

/** The widest the page gets: wide enough for two columns of short blocks, while reading text keeps its measure. */
const PAGE_WIDTH = "72rem";

/** The two sizes of the picture, as taken: its frame is never drawn wider than its capture. */
const NARROW_CAPTURE = `${captureSubject("hero").width}px`;
const WIDE_CAPTURE = `${captureSubject("heroWide").width}px`;

/** The narrowest a short block of a grid gets before the grid drops a column. */
const GROUP_MIN = "16rem";

/** The space between sections: two of the largest steps. */
const SECTION_SPACE = `calc(${tokens.space.xl} * 2)`;

/** The header's height: one 44 px target with a hairline of space above and below it. */
const HEADER_HEIGHT = `calc(${tokens.size.minTarget} + ${tokens.space.xxs} * 2)`;

/** The device's top inset, under a notch or the status bar, which the sticky header pads itself by. */
const SAFE_TOP = "env(safe-area-inset-top, 0px)";

/** How far an anchored heading lands below the top: under the header, with a step of air. */
const ANCHOR_OFFSET = `calc(${HEADER_HEIGHT} + ${SAFE_TOP} + ${tokens.space.md})`;

/** The width of the copy button in the corner of a command: a 44 px target. */
const CORNER_BUTTON = tokens.size.minTarget;

/*
 * Interaction states. Hover shows only where a pointer can hover, so a touch
 * screen never keeps a stuck hover after a tap; pressed shows everywhere. Each
 * state is built from colour pairs the theme tests hold to AA in both themes
 * (text or accent on the accent tint and the page, the accent contrast on the
 * accent), so no state lowers contrast. Only transform animates, at the fast
 * duration, which the theme sets to near zero under reduced motion. In forced
 * colours tints and shadows are dropped, so a hover there also thickens or
 * adds an underline.
 */

/** Where a pointer can hover. */
const HOVER = "(hover: hover)";

/** Where the system paints its own colours. */
const FORCED = "(forced-colors: active)";

/** Where a pointer can hover and the system paints its own colours. */
const HOVER_FORCED = "(hover: hover) and (forced-colors: active)";

/** How far a pressed button or link shrinks: just enough to feel. */
const PRESSED = "scale(0.98)";

/** How a target eases into its pressed size and back. */
const PRESS_TRANSITION = `transform ${tokens.motion.duration.fast} ${tokens.motion.easing}`;

/** A hovered link's underline: twice its resting weight. */
const HOVER_UNDERLINE = "2px";

/** How far a hovered action rises, a hair, with the floating shadow under it. */
const LIFT = "translateY(-1px)";

/**
 * Hover that leaves a focused element's ring alone, since the ring is partly
 * a shadow, and gives way to the pressed state.
 */
const HOVER_NOT_FOCUSED = "&:hover:not(:focus-visible):not(:active)";

/**
 * The page's scrolling container. With `DOCUMENT_SCROLL` the document scrolls
 * instead, as any web page does; in a browser without `:has()` the document
 * stays fixed for the map and this container scrolls itself.
 */
export const scroller = style({
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  scrollPaddingBlockStart: ANCHOR_OFFSET,
  backgroundColor: tokens.color.pageBackground,
  color: tokens.color.text,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontVariantNumeric: "tabular-nums",
  // A long word breaks rather than widen the page, at 320 px and 200 percent text.
  overflowWrap: "break-word",
});

/** Where the document scrolls the page: the root, as on any web page. */
const SCROLLING_DOCUMENT = `:root:has(${scroller})`;

// When the document scrolls, the container must not be a scroll container of
// its own, or the sticky header would stick to it and scroll away with the
// page. `clip` still keeps anything wide from scrolling the page sideways.
globalStyle(`${SCROLLING_DOCUMENT} ${scroller}`, {
  overflow: "clip",
});

// An anchored section lands below the sticky header, not under it.
globalStyle(SCROLLING_DOCUMENT, {
  scrollPaddingBlockStart: ANCHOR_OFFSET,
});

/** The page's outer column, composed into each band of the page so its own media rules never replace the column's. */
const pageColumn = style({
  width: "100%",
  maxWidth: PAGE_WIDTH,
  marginInline: "auto",
  paddingInlineStart: `max(${tokens.space.md}, env(safe-area-inset-left, 0px))`,
  paddingInlineEnd: `max(${tokens.space.md}, env(safe-area-inset-right, 0px))`,
  "@media": {
    [TABLET]: {
      paddingInlineStart: `max(${tokens.space.xl}, env(safe-area-inset-left, 0px))`,
      paddingInlineEnd: `max(${tokens.space.xl}, env(safe-area-inset-right, 0px))`,
    },
  },
});

/**
 * The header: a slim bar that stays at the top of the screen, on the page's
 * own ground with a hairline under it, padded below a notch. It sits on the
 * chrome layer so nothing that scrolls under it paints over it.
 */
export const header = style({
  position: "sticky",
  insetBlockStart: 0,
  zIndex: zLayer("chrome"),
  paddingBlockStart: SAFE_TOP,
  backgroundColor: tokens.color.pageBackground,
  borderBlockEnd: `1px solid ${tokens.color.hairline}`,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
});

/** The header's row: the brand at the start, the links at the end. */
export const headerBar = style([
  pageColumn,
  {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: tokens.space.sm,
    minHeight: HEADER_HEIGHT,
  },
]);

/** The brand link: the cairn and the name, a full-size target. */
export const brand = style({
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xs,
  minHeight: tokens.size.minTarget,
  flexShrink: 0,
  color: tokens.color.text,
  textDecoration: "none",
  textUnderlineOffset: "0.25em",
  borderRadius: tokens.radius.inner,
  transition: PRESS_TRANSITION,
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": { transform: PRESSED },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        "&:hover": {
          textDecoration: "underline",
          textDecorationThickness: HOVER_UNDERLINE,
        },
      },
    },
  },
});

/**
 * The header's navigation: it may shrink, and scrolls sideways inside itself
 * when very large text leaves no room, so the header stays one row tall and
 * the scroll padding, which is in rem like the header, still clears it.
 */
export const navBox = style({
  minWidth: 0,
  overflowX: "auto",
});

/** The header's links, in one row. */
export const nav = style({
  display: "flex",
  "@media": {
    [ROOMY]: { columnGap: tokens.space.xxs },
  },
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One header link: a 44 px target, text only, tinted under a pointer. */
export const navLink = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
  minWidth: tokens.size.minTarget,
  justifyContent: "center",
  paddingInline: 0,
  borderRadius: tokens.radius.inner,
  color: tokens.color.accent,
  fontWeight: tokens.type.weight.semibold,
  textDecoration: "none",
  textUnderlineOffset: "0.25em",
  transition: PRESS_TRANSITION,
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": {
      transform: PRESSED,
      backgroundColor: tokens.color.accentTint,
    },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        "&:hover": {
          backgroundColor: tokens.color.accentTint,
          textDecoration: "underline",
          textDecorationThickness: HOVER_UNDERLINE,
        },
      },
    },
    [ROOMY]: { paddingInline: tokens.space.xs },
    [FORCED]: { textDecoration: "underline" },
  },
});

/** The main landmark, the skip link's target. */
export const main = style({
  outline: "none",
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/**
 * The hero: one grid cell that holds the contour motif and, over it, the
 * words. Stacking in a cell rather than positioning keeps both in flow, and
 * the motif is first in the markup, so the words paint over it.
 */
export const hero = style([
  pageColumn,
  {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    paddingBlockStart: tokens.space.xl,
    paddingBlockEnd: tokens.space.xl,
    "@media": {
      [TABLET]: {
        paddingBlockStart: SECTION_SPACE,
      },
    },
  },
]);

/** The contour motif: the whole hero cell, behind the words, cropped from its end side so the summit sits away from the text. */
export const heroMotif = style({
  gridArea: "1 / 1",
  width: "100%",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
  pointerEvents: "none",
});

/**
 * A contour of the motif: the hairline ink, the faintest line the theme has,
 * so text over it keeps its contrast in both themes (`ProductPage.test.tsx`
 * measures it). Its width never scales with the drawing.
 */
export const motifLine = style({
  fill: "none",
  stroke: tokens.color.hairline,
  strokeWidth: 1,
  vectorEffect: "non-scaling-stroke",
  "@media": {
    [FORCED]: { stroke: "transparent" },
  },
});

/** An index contour of the motif: the same ink, a little wider. */
export const motifIndex = style([
  motifLine,
  {
    strokeWidth: 2,
  },
]);

/**
 * The hero's words, over the motif, at the reading width. From the wide width
 * they are two columns: the heading, the lede, the button, the repository link
 * and the badges at the start, and the install command at the end, centred on
 * them. The markup's order, and so the reading and tab order, stays the same.
 */
export const heroText = style({
  gridArea: "1 / 1",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: tokens.space.lg,
  minWidth: 0,
  maxWidth: MEASURE,
  "@media": {
    [WIDE]: {
      display: "grid",
      gridTemplateColumns: `minmax(0, ${MEASURE}) minmax(0, 1fr)`,
      columnGap: SECTION_SPACE,
      rowGap: tokens.space.lg,
      justifyItems: "start",
      alignContent: "start",
      maxWidth: "none",
    },
  },
});

// On a wide screen every part of the hero is in the first column except the
// install command, which spans its rows in the second.
globalStyle(`${heroText} > *`, {
  "@media": { [WIDE]: { gridColumn: "1" } },
});

/** The page's one h1: the display step from a large phone up, never smaller than the title step. */
export const headline = style({
  margin: 0,
  fontSize: `clamp(${tokens.type.title.size}, 10vw, ${tokens.type.display.size})`,
  lineHeight: tokens.type.display.lineHeight,
  letterSpacing: tokens.type.display.tracking,
  fontWeight: tokens.type.weight.semibold,
  textWrap: "balance",
});

/** The sentence under the h1. */
export const lede = style({
  margin: 0,
  color: tokens.color.textMuted,
  textWrap: "pretty",
});

/**
 * What the actions share: a 48 px target, the icon and the words centred.
 * Under a pointer an action rises a hair onto the floating shadow; pressed, it
 * settles and shrinks a little.
 */
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
  textUnderlineOffset: "0.25em",
  transition: PRESS_TRANSITION,
} as const;

/** An action's pressed state: no lift and no shadow, a little smaller. */
const actionPressed = { transform: PRESSED, boxShadow: "none" } as const;

/** An action's hover: the lift and the shadow, unless focused, where the ring stays. */
const actionHover = {
  [HOVER_NOT_FOCUSED]: {
    transform: LIFT,
    boxShadow: tokens.shadow.floating,
  },
} as const;

/** In forced colours the shadow is gone, so a hovered action is underlined. */
const actionHoverForced = {
  [HOVER_FORCED]: {
    selectors: { "&:hover": { textDecoration: "underline" } },
  },
} as const;

/**
 * The page's one filled button: Try the playground. The full width on a
 * narrow phone, its own width from the roomy width.
 */
export const primaryAction = style({
  ...action,
  alignSelf: "stretch",
  border: `1px solid ${tokens.color.accent}`,
  backgroundColor: tokens.color.accent,
  color: tokens.color.accentContrast,
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": actionPressed,
  },
  "@media": {
    [ROOMY]: { alignSelf: "flex-start" },
    [HOVER]: { selectors: actionHover },
    ...actionHoverForced,
    /*
     * Forced colours paint a Canvas backplate behind text, so the accent fill
     * (Highlight there) would hide the HighlightText label. The action becomes
     * an outlined link on Canvas instead, in every state.
     */
    [FORCED]: {
      borderColor: "LinkText",
      backgroundColor: "Canvas",
      color: "LinkText",
    },
  },
});

/** The install command and what it needs, as wide as the reading column. */
export const installArea = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  alignSelf: "stretch",
  selectors: {
    [`${heroText} > &`]: {
      "@media": {
        [WIDE]: {
          gridColumn: "2",
          gridRow: "1 / span 5",
          alignSelf: "center",
          justifySelf: "stretch",
        },
      },
    },
  },
});

/** What the SDK needs, under the command: quiet and small. */
export const requirements = style({
  margin: 0,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  color: tokens.color.textMuted,
});

/** A link in running text or a list: under a pointer its underline doubles, and pressed it takes the accent tint. */
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
    "&:active": { backgroundColor: tokens.color.accentTint },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        "&:hover": { textDecorationThickness: HOVER_UNDERLINE },
      },
    },
  },
});

/** The repository, a plain text link on its own line: a 44 px target, underlined, tinted under a pointer. */
export const tertiaryLink = style([
  link,
  {
    display: "inline-flex",
    alignItems: "center",
    minHeight: tokens.size.minTarget,
    paddingInline: tokens.space.xxs,
    marginInline: `calc(-1 * ${tokens.space.xxs})`,
    fontSize: tokens.type.body.size,
    transition: PRESS_TRANSITION,
    selectors: {
      "&:active": { transform: PRESSED },
    },
    "@media": {
      [HOVER]: {
        selectors: {
          "&:hover": { backgroundColor: tokens.color.accentTint },
        },
      },
    },
  },
]);

/** The badges and the release line, a quiet group at the end of the hero. */
export const trust = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** The badges, in a row that wraps. */
export const badges = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A badge: a small label in a hairline pill, on the page's ground so the motif never shows through. */
export const badge = style({
  display: "inline-flex",
  alignItems: "center",
  paddingBlock: tokens.space.xxs,
  paddingInline: tokens.space.sm,
  border: `1px solid ${tokens.color.controlBoundary}`,
  borderRadius: tokens.radius.pill,
  backgroundColor: tokens.color.pageBackground,
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  color: tokens.color.text,
});

/** The licence badge's link to the licence section: the badge's words, underlined, the whole pill its target. */
export const badgeLink = style([
  link,
  {
    color: tokens.color.text,
    paddingBlock: 0,
  },
]);

/** The latest release, under the badges. */
export const trustLine = style({
  margin: 0,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  color: tokens.color.textMuted,
});

/**
 * The picture of the playground: the largest thing on the page, straight under
 * the hero. On a phone it runs edge to edge, up to the narrow capture's own
 * width; from the tablet width it is the wide capture, as wide as the screen
 * allows up to its own width, which on a large screen is the page's column.
 */
export const demo = style([
  pageColumn,
  {
    marginBlock: 0,
    paddingInlineStart: 0,
    paddingInlineEnd: 0,
    maxWidth: `calc(${WIDE_CAPTURE} + 2px + ${tokens.space.xl} * 2)`,
    display: "flex",
    flexDirection: "column",
    gap: tokens.space.sm,
    "@media": {
      [TABLET]: {
        paddingInlineStart: `max(${tokens.space.xl}, env(safe-area-inset-left, 0px))`,
        paddingInlineEnd: `max(${tokens.space.xl}, env(safe-area-inset-right, 0px))`,
      },
    },
  },
]);

/** A capture's frame: a fine rule round it in the control boundary colour, square on a phone where it runs edge to edge. */
export const plateFrame = style({
  lineHeight: 0,
  borderBlock: `1px solid ${tokens.color.controlBoundary}`,
  overflow: "hidden",
  marginInline: "auto",
  width: "100%",
});

/** The narrow capture: on a phone only, never wider than it was taken. */
export const plateNarrow = style({
  maxWidth: NARROW_CAPTURE,
  "@media": {
    [TABLET]: { display: "none" },
  },
});

/** The wide capture: from the tablet width, never wider than it was taken (its frame adds a pixel each side). */
export const plateWide = style({
  display: "none",
  "@media": {
    [TABLET]: {
      display: "block",
      maxWidth: `calc(${WIDE_CAPTURE} + 2px)`,
      border: `1px solid ${tokens.color.controlBoundary}`,
      borderRadius: tokens.radius.control,
    },
  },
});

/** One capture. Its width and height attributes give the shape that is held before it loads. */
export const plateImage = style({
  display: "block",
  width: "100%",
  height: "auto",
});

/** The light capture, shown unless the page is dark. */
export const plateLight = style({});

/** The dark capture, not drawn unless the page is dark, so it is never fetched in the light theme. */
export const plateDark = style({
  display: "none",
});

// The page's theme chooses the capture with CSS alone: an explicit choice on
// the root first, and with none the operating system's, as the tokens do.
globalStyle(`[data-theme="dark"] ${plateLight}`, { display: "none" });
globalStyle(`[data-theme="dark"] ${plateDark}`, { display: "block" });
globalStyle(`:root:not([data-theme]) ${plateLight}`, {
  "@media": { "(prefers-color-scheme: dark)": { display: "none" } },
});
globalStyle(`:root:not([data-theme]) ${plateDark}`, {
  "@media": { "(prefers-color-scheme: dark)": { display: "block" } },
});

/** The words under the picture: that it is a screenshot and what opens the real thing, then the credits, inside the page's margins. */
export const plateCaption = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  paddingInline: tokens.space.md,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  color: tokens.color.textMuted,
  "@media": {
    [TABLET]: { paddingInline: 0 },
  },
});

/** The credits line: the map's own credits, linked as the map links them. */
export const plateCredits = style({
  textWrap: "pretty",
});

/** One section: a heading and a few blocks in the reading column, two of the largest steps from its neighbours. */
export const section = style([
  pageColumn,
  {
    paddingBlockStart: SECTION_SPACE,
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
  },
]);

// Every block of a section keeps to the reading width.
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
  textWrap: "balance",
});

/** A paragraph. */
export const paragraph = style({
  margin: 0,
  textWrap: "pretty",
});

/** A subheading inside a section: the large step, in the semibold weight. */
export const subheading = style({
  margin: 0,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  fontWeight: tokens.type.weight.semibold,
  textWrap: "balance",
});

/*
 * The rhythm inside a section: one medium step between blocks, a large step
 * under the section's heading. A subheading groups with what it heads, so it
 * has the largest step above it and a small one below it. Margins, not a flex
 * gap, because the gap would be the same on both sides; the section is a flex
 * column, so they never collapse. The selectors outrank each block's own
 * `margin: 0`.
 */
globalStyle(`${section} > :not(:first-child)`, {
  marginBlockStart: tokens.space.md,
});

globalStyle(`${section} > ${sectionHeading} + *`, {
  marginBlockStart: tokens.space.lg,
});

globalStyle(`${section} > :not(${sectionHeading}) + ${subheading}`, {
  marginBlockStart: tokens.space.xl,
});

globalStyle(`${section} > ${subheading} + *`, {
  marginBlockStart: tokens.space.xs,
});

/** A list, with the markers inside the column so nothing hangs past its edge. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  margin: 0,
  paddingInlineStart: tokens.space.lg,
});

/** A name from the code, inline: one step smaller than the text round it, since the monospaced face draws larger at the same size. */
export const code = style({
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.body.size,
  overflowWrap: "anywhere",
});

/** What you get: a few benefits, one under another on a phone and two to a row from the tablet width. */
export const features = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: tokens.space.xl,
  margin: 0,
  padding: 0,
  listStyle: "none",
  selectors: {
    // In a section, the rule that holds every block to the reading width
    // would win over the wider grid; this is the more specific one.
    [`${section} > &`]: { maxWidth: "none" },
  },
  "@media": {
    [TABLET]: {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      columnGap: SECTION_SPACE,
    },
  },
});

/**
 * Short groups of a section side by side: as many columns as fit at 16rem or
 * more, so the licence, the cost and readiness scan on a wide screen and stack
 * on a phone.
 */
export const groups = style({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${GROUP_MIN}), 1fr))`,
  columnGap: SECTION_SPACE,
  rowGap: tokens.space.xl,
  selectors: {
    // As for the benefits: wider than the reading measure, which each group's own text keeps.
    [`${section} > &`]: { maxWidth: "none" },
  },
});

/** One group: its heading a small step above its lines, which are a small step apart. */
export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  minWidth: 0,
  maxWidth: MEASURE,
});

/** One benefit. */
export const feature = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** A benefit's name: an h3, the large step in the semibold weight. */
export const featureName = style([subheading]);

/** What a benefit lets you do: quieter than its name. */
export const featureText = style({
  margin: 0,
  color: tokens.color.textMuted,
  textWrap: "pretty",
});

/** A code example: one box with its name and copy button at the top and the code under them. */
export const codeExample = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: `1px solid ${tokens.color.hairline}`,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  overflow: "hidden",
});

/** The box's top: the file's name at its start, the copy button in its corner. */
export const codeHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  paddingInlineStart: tokens.space.md,
  borderBlockEnd: `1px solid ${tokens.color.hairline}`,
});

/** The file's name over its code: a small monospaced label. */
export const codeFile = style({
  minWidth: 0,
  overflowWrap: "anywhere",
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.small.size,
  color: tokens.color.textMuted,
});

/**
 * The copy button: a 44 px icon button with no frame of its own, in the corner
 * of its code. Its icon says what the last copy did, and its accessible name
 * says it in words. Under a pointer and pressed it takes the accent tint.
 */
export const copyButton = style({
  display: "inline-grid",
  placeItems: "center",
  flexShrink: 0,
  width: CORNER_BUTTON,
  height: CORNER_BUTTON,
  padding: 0,
  border: 0,
  borderRadius: tokens.radius.inner,
  backgroundColor: "transparent",
  color: tokens.color.textMuted,
  cursor: "pointer",
  transition: PRESS_TRANSITION,
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": {
      transform: PRESSED,
      backgroundColor: tokens.color.accentTint,
      color: tokens.color.text,
    },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        "&:hover": {
          backgroundColor: tokens.color.accentTint,
          color: tokens.color.text,
        },
      },
    },
    [HOVER_FORCED]: {
      selectors: {
        "&:hover": { outline: "1px solid CanvasText" },
      },
    },
  },
});

/** The copy button's icon: the accent once copied, the danger colour if the copy failed. */
export const copyIcon = style({
  flexShrink: 0,
  selectors: {
    [`${copyButton}[data-state="copied"] > &`]: { color: tokens.color.accent },
    [`${copyButton}[data-state="failed"] > &`]: { color: tokens.color.danger },
  },
});

/** Code in a box: its own scrolling, focusable region, so it never widens the page. */
export const codeBlock = style({
  margin: 0,
  padding: tokens.space.md,
  overflow: "auto",
  // A tall example scrolls inside its own box, so it does not take over the page.
  maxHeight: CODE_HEIGHT,
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.body.lineHeight,
  tabSize: 2,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** The install block: a group with no frame of its own, as wide as the reading column. */
export const install = style({
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
});

/**
 * The choices in a row of quiet tabs that wraps at large text, then the chosen
 * command across the full width under them, then the copy button's row, drawn
 * back up into the command's end corner by a negative margin, so it sits in the
 * command's box in flow, never positioned. `order` puts them in that sequence
 * whatever the markup's, which keeps each choice beside its own command.
 */
export const installRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  columnGap: tokens.space.xxs,
});

/** One manager: a wrapper that only groups its choice with its command, so the grid places them. */
export const installOption = style({
  display: "contents",
});

/**
 * A choice: a quiet tab, 44 px tall, in the muted ink. The chosen one is in the
 * text colour with a 2 px underline in the accent, so colour is not the only
 * sign, in forced colours too.
 */
export const installChoice = style({
  // The name and the radio share one cell, so the radio covers the tab.
  display: "inline-grid",
  placeItems: "center",
  order: 1,
  minHeight: tokens.size.minTarget,
  minWidth: tokens.size.minTarget,
  borderRadius: tokens.radius.inner,
  color: tokens.color.textMuted,
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  textDecorationColor: tokens.color.accent,
  textUnderlineOffset: "0.4em",
  cursor: "pointer",
  transition: PRESS_TRANSITION,
  selectors: {
    "&:has(input:checked)": {
      color: tokens.color.text,
      textDecoration: "underline",
      textDecorationThickness: "2px",
    },
    "&:has(input:focus-visible)": focusRing,
    "&:active": {
      transform: PRESSED,
      backgroundColor: tokens.color.accentTint,
    },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        "&:hover": {
          color: tokens.color.text,
          backgroundColor: tokens.color.accentTint,
        },
      },
    },
    [HOVER_FORCED]: {
      selectors: { "&:hover": { textDecoration: "underline" } },
    },
    [FORCED]: {
      selectors: {
        "&:has(input:checked)": { textDecorationColor: "Highlight" },
      },
    },
  },
});

/** The manager's name, in the tab's one grid cell, which carries the tab's padding so the radio covers it. */
export const installName = style({
  gridArea: "1 / 1",
  paddingInline: tokens.space.xs,
});

/** The native radio, invisible and in the same cell as the name, so the whole tab is its target. */
export const installRadio = style({
  gridArea: "1 / 1",
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  cursor: "pointer",
});

/**
 * The command of the chosen manager only, across the full width under the
 * tabs, with room at its end for the copy button. It wraps at its spaces
 * instead of scrolling sideways, so a phone shows all of it.
 */
export const installCommand = style([
  codeBlock,
  {
    order: 2,
    flexBasis: "100%",
    marginBlockStart: tokens.space.xxs,
    paddingInlineEnd: `calc(${CORNER_BUTTON} + ${tokens.space.xs})`,
    border: `1px solid ${tokens.color.hairline}`,
    borderRadius: tokens.radius.control,
    backgroundColor: tokens.color.surfaceRaised,
    whiteSpace: "pre-wrap",
    // Without `:has()` every command shows, each in its named region, so none is lost.
    "@supports": {
      "selector(:has(*))": {
        display: "none",
        selectors: {
          [`${installOption}:has(input:checked) > &`]: { display: "block" },
        },
      },
    },
  },
]);

/**
 * The copy button's row, one button tall, pulled up by its own height and a
 * hair so the button sits inside the command's end corner. It is there before
 * the button arrives, so nothing moves when the script runs.
 */
export const installCopy = style({
  order: 3,
  flexBasis: "100%",
  display: "flex",
  justifyContent: "flex-end",
  height: CORNER_BUTTON,
  marginBlockStart: `calc(-1 * (${CORNER_BUTTON} + ${tokens.space.xxs}))`,
  paddingInlineEnd: tokens.space.xxs,
});

/** A keyword in the code example: the one accent. */
export const codeKeyword = style({
  color: tokens.color.accent,
});

/** A string, number or comment in the code example: quieter than the code around it. */
export const codeMuted = style({
  color: tokens.color.textMuted,
});

/** A component or type name in the code example: the heavier weight, not a second colour. */
export const codeName = style({
  fontWeight: tokens.type.weight.semibold,
});

/** The questions, one under another, a hairline between them. */
export const disclosures = style({
  display: "flex",
  flexDirection: "column",
});

/** One question. */
export const disclosure = style({
  borderBlockEnd: `1px solid ${tokens.color.hairline}`,
});

/**
 * A question's row: the whole row is the target, at least 48 px tall, with a
 * chevron at its end in the text colour. Under a pointer the row takes the
 * accent; pressed, the tint.
 */
export const summary = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  minHeight: tokens.size.control,
  paddingBlock: tokens.space.sm,
  cursor: "pointer",
  fontWeight: tokens.type.weight.semibold,
  borderRadius: tokens.radius.inner,
  listStyle: "none",
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": {
      color: tokens.color.accent,
      backgroundColor: tokens.color.accentTint,
    },
    "&::-webkit-details-marker": { display: "none" },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        "&:hover": { color: tokens.color.accent },
      },
    },
  },
});

/** The chevron that says whether a question is open: down when closed, up when open, turning only as fast as the theme allows. */
export const marker = style({
  flexShrink: 0,
  color: tokens.color.text,
  transition: `transform ${tokens.motion.duration.base} ${tokens.motion.easing}`,
  selectors: {
    "details[open] > summary > &": { transform: "rotate(180deg)" },
    [`${summary}:active > &`]: { color: "inherit" },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        [`${summary}:hover > &`]: { color: "inherit" },
      },
    },
  },
});

/** An answer: its paragraphs, a small step apart, with a step of air under them. */
export const detailBody = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  paddingBlockEnd: tokens.space.lg,
});

/** A paragraph of an answer. */
export const detail = style({
  margin: 0,
  color: tokens.color.text,
  textWrap: "pretty",
});

/** The relief strip's place at the end of the page, after the last section and before the footer: the way ends at the cairn. */
export const closing = style([
  pageColumn,
  {
    paddingBlockStart: SECTION_SPACE,
    paddingBlockEnd: tokens.space.xl,
  },
]);

/** The relief strip, no wider than its sheet. */
export const closingArt = style({
  maxWidth: ART_WIDTH,
});

/** The footer: where the project is made, the licence and the links. */
export const footer = style([
  pageColumn,
  {
    display: "flex",
    flexDirection: "column",
    gap: tokens.space.md,
    paddingBlockEnd: `calc(${tokens.space.xl} + env(safe-area-inset-bottom, 0px))`,
    fontSize: tokens.type.small.size,
    lineHeight: tokens.type.small.lineHeight,
    letterSpacing: tokens.type.small.tracking,
    color: tokens.color.textMuted,
  },
]);

/** The footer's two groups of links, project links first and the site's own after, with a small gap between rows and groups. */
export const footerNav = style({
  display: "flex",
  flexDirection: "column",
  rowGap: tokens.space.xxs,
});

/** One group of the footer's links, wrapping onto as many rows as it needs. */
export const footerLinks = style({
  display: "flex",
  flexWrap: "wrap",
  columnGap: tokens.space.md,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One footer link: a full-size target that shrinks a little when pressed. */
export const footerLink = style([
  link,
  {
    display: "inline-flex",
    alignItems: "center",
    minHeight: tokens.size.minTarget,
    transition: PRESS_TRANSITION,
    selectors: {
      "&:active": { transform: PRESSED },
    },
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
