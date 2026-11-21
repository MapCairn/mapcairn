// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { globalStyle, style } from "@vanilla-extract/css";

/*
 * The product page: calm and in one reading column, set like a survey sheet.
 * The hero carries the pitch, the install block, the actions and the survey sheet
 * beside them; every section below is a graticule rule (a ruler's ticks, in the
 * blue of the survey marks), a heading and a few short blocks, with the detail
 * one tap away in native disclosures, except what you get, which is a legend
 * and always shown. Mobile first: one column at 320 px; from the `wide` width
 * the hero puts the art beside its words. The type is the large step for
 * reading, the title step for section headings and the small step for
 * captions, never below 13 px. Tokens only.
 */

/** From here the hero puts its art beside its words. */
const WIDE = "screen and (min-width: 56rem)";

/** From here the actions sit side by side, wrapping onto a second row when they do not fit. */
const ROOMY = "screen and (min-width: 30rem)";

/** The reading width of the sections, about 65 characters of the large type. */
const MEASURE = "40rem";

/** The tallest the code example gets before it scrolls inside its own box. */
const CODE_HEIGHT = "26rem";

/** The widest the art gets, so it stays beside the words rather than taking over. */
const ART_WIDTH = "30rem";

/** The widest the page gets. */
const PAGE_WIDTH = "60rem";

/** The space between sections: two of the largest steps. */
const SECTION_SPACE = `calc(${tokens.space.xl} * 2)`;

/**
 * A section's top, the largest step in all: the space above its rule, the rule
 * and the space between the rule and its heading, which add up to one
 * `space.xl`, so the rule sits on its heading like a ruler on a line.
 */
const RULE_HEIGHT = tokens.space.sm;

/** The space between a section's rule and its heading. */
const RULE_TO_HEADING = tokens.space.xs;

/** The distance between the rule's ticks, and a long tick every fifth. */
const TICK_PITCH = tokens.size.control;
const LONG_TICK_PITCH = `calc(${TICK_PITCH} * 5)`;

/** How wide a tick is: a long one is twice a short one. */
const TICK_WIDTH = "1px";
const LONG_TICK_WIDTH = "2px";

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

/** The header's links. */
export const nav = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One header link: a 44 px target with the text centred in it, tinted under a pointer. */
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
          textDecorationThickness: HOVER_UNDERLINE,
        },
      },
    },
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
 * The hero: words first, then the art below them, or beside them on a wide
 * screen. On a wide screen it has more room above it, but never more below:
 * its bottom padding and the first section's top add up to the same gap as
 * between sections, at every width.
 */
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
      paddingBlockStart: SECTION_SPACE,
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

/**
 * The actions: the one button, then the row of two links. On a phone the button
 * is the full width and the links sit at either end of the row under it; from
 * the roomy width the button and the links share one line.
 */
export const actions = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  "@media": {
    [ROOMY]: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      columnGap: tokens.space.lg,
    },
  },
});

/** The two links: at either end of their row on a phone, side by side from the roomy width. */
export const heroLinks = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: tokens.space.md,
  margin: 0,
  padding: 0,
  listStyle: "none",
  "@media": {
    [ROOMY]: { justifyContent: "flex-start" },
  },
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

/** The primary action: View on GitHub. */
export const primaryAction = style({
  ...action,
  border: `1px solid ${tokens.color.accent}`,
  backgroundColor: tokens.color.accent,
  color: tokens.color.accentContrast,
  selectors: {
    "&:focus-visible": focusRing,
    "&:active": actionPressed,
  },
  "@media": {
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

/** A link of the hero's row: the header link's look. */
export const heroLink = style([navLink]);

/** The quiet line under the actions. */
export const note = style({
  margin: 0,
  fontSize: tokens.type.body.size,
  lineHeight: tokens.type.body.lineHeight,
  color: tokens.color.textMuted,
});

/** One section: a heading and a few blocks, in the reading column, with room around it. Neighbours' padding adds up to two of the largest steps between them. */
export const section = style({
  ...pageColumn,
  paddingBlockStart: 0,
  paddingBlockEnd: tokens.space.xl,
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  scrollMarginBlockStart: tokens.space.md,
  selectors: {
    /*
     * The graticule rule: a baseline with a short tick every 48 px and a long
     * one every 240 px, all of it decoration, in flow so it takes its own
     * height. The ticks are the blue of the survey marks, a graphic colour that
     * keeps 3:1 on the page in both themes; the pattern is the same read from
     * either end, so it needs no mirrored copy.
     */
    "&::before": {
      content: '""',
      display: "block",
      // The border-box keeps the rule 12 px tall with the forced-colours border added.
      boxSizing: "border-box",
      height: RULE_HEIGHT,
      marginBlockStart: tokens.space.sm,
      marginBlockEnd: RULE_TO_HEADING,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "0 100%",
      backgroundSize: `100% 100%, 100% ${tokens.space.xs}, 100% 1px`,
      backgroundImage: [
        `repeating-linear-gradient(90deg, ${tokens.color.mapMeasureLine} 0 ${LONG_TICK_WIDTH}, transparent ${LONG_TICK_WIDTH} ${LONG_TICK_PITCH})`,
        `repeating-linear-gradient(90deg, ${tokens.color.mapMeasureLine} 0 ${TICK_WIDTH}, transparent ${TICK_WIDTH} ${TICK_PITCH})`,
        `linear-gradient(${tokens.color.controlBoundary}, ${tokens.color.controlBoundary})`,
      ].join(", "),
    },
  },
  "@media": {
    [WIDE]: {
      paddingInline: tokens.space.xl,
    },
    /* Forced colours repaint no background image, so the rule is a plain line in the system's text colour. */
    [FORCED]: {
      selectors: {
        "&::before": {
          backgroundImage: "none",
          borderBlockEnd: "1px solid CanvasText",
        },
      },
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
  textWrap: "balance",
});

/** A paragraph. */
export const paragraph = style({
  margin: 0,
  textWrap: "pretty",
});

/** A subheading inside a section. */
export const subheading = style({
  margin: 0,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  fontWeight: tokens.type.weight.semibold,
});

/*
 * The rhythm inside a section: one medium step between blocks. A subheading
 * groups with what it heads, so it has a larger step above it (unless it
 * comes straight after the section's heading) and a small one below it.
 * Margins, not a flex gap, because the gap would be the same on both sides;
 * the section is a flex column, so they never collapse. The selectors outrank
 * each block's own `margin: 0`.
 */
globalStyle(`${section} > :not(:first-child)`, {
  marginBlockStart: tokens.space.md,
});

globalStyle(`${section} > :not(${sectionHeading}) + ${subheading}`, {
  marginBlockStart: tokens.space.lg,
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

/** A name from the code, inline. */
export const code = style({
  fontFamily: tokens.type.familyMono,
  overflowWrap: "anywhere",
});

/** The code example and its copy button, the button above the code at its end. */
export const codeExample = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
});

/** A file's name at the start of the row, the copy button at its end. */
export const codeHeader = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: tokens.space.sm,
  maxWidth: MEASURE,
});

/** The file's name over its code: monospace, quieter than the code. */
export const codeFile = style({
  minWidth: 0,
  overflowWrap: "anywhere",
  fontFamily: tokens.type.familyMono,
  fontSize: tokens.type.small.size,
  color: tokens.color.textMuted,
});

/**
 * The copy button: a quiet 48 px pill that reads like the secondary action,
 * with the same hover and pressed states. Its words and icon say what the
 * last copy did.
 */
export const copyButton = style({
  ...action,
  flexShrink: 0,
  paddingInline: tokens.space.md,
  border: `1px solid ${tokens.color.controlBoundary}`,
  backgroundColor: tokens.color.surfaceRaised,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  cursor: "pointer",
  selectors: {
    "&:focus-visible": focusRing,
    '&[data-state="copied"]': { borderColor: tokens.color.accent },
    "&:active": {
      ...actionPressed,
      borderColor: tokens.color.accent,
      backgroundColor: tokens.color.accentTint,
    },
  },
  "@media": {
    [HOVER]: {
      selectors: {
        ...actionHover,
        "&:hover": {
          borderColor: tokens.color.accent,
          backgroundColor: tokens.color.accentTint,
        },
      },
    },
    ...actionHoverForced,
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

/** The install block: a group with no frame of its own, as wide as the reading column. */
export const install = style({
  minWidth: 0,
  maxWidth: MEASURE,
  margin: 0,
  padding: 0,
  border: 0,
});

/**
 * The choices in a row that wraps, then the chosen command and the copy
 * button's row, each across the full width. `order` puts them in that sequence
 * whatever the markup's, which keeps each choice beside its own command.
 */
export const installRow = style({
  display: "flex",
  flexWrap: "wrap",
  gap: tokens.space.xs,
});

/** One manager: a wrapper that only groups its choice with its command, so the grid places them. */
export const installOption = style({
  display: "contents",
});

/**
 * A choice, a 48 px pill that reads like the secondary action. The chosen one
 * takes the accent edge and tint, and is underlined so colour is not the only
 * sign, in forced colours too.
 */
export const installChoice = style({
  ...action,
  // The name and the radio share one cell, so the radio covers the pill.
  display: "inline-grid",
  placeItems: "center",
  order: 1,
  minWidth: tokens.size.control,
  paddingInline: 0,
  border: `1px solid ${tokens.color.controlBoundary}`,
  backgroundColor: tokens.color.surfaceRaised,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  cursor: "pointer",
  selectors: {
    "&:has(input:checked)": {
      borderColor: tokens.color.accent,
      backgroundColor: tokens.color.accentTint,
      textDecoration: "underline",
      textDecorationThickness: "2px",
    },
    "&:has(input:focus-visible)": focusRing,
    "&:active": {
      ...actionPressed,
      borderColor: tokens.color.accent,
      backgroundColor: tokens.color.accentTint,
    },
  },
  "@media": {
    // The pill's own focus is its radio's, so the ring is kept as on the copy button.
    [HOVER]: {
      selectors: {
        "&:hover:not(:has(input:focus-visible)):not(:active)": {
          transform: LIFT,
          boxShadow: tokens.shadow.floating,
          borderColor: tokens.color.accent,
          backgroundColor: tokens.color.accentTint,
        },
      },
    },
    [HOVER_FORCED]: {
      selectors: { "&:hover": { textDecoration: "underline" } },
    },
    [FORCED]: {
      selectors: {
        "&:has(input:checked)": { borderColor: "Highlight" },
      },
    },
  },
});

/** The manager's name, in the pill's one grid cell, which carries the pill's padding so the radio covers it. */
export const installName = style({
  gridArea: "1 / 1",
  paddingInline: tokens.space.md,
});

/** The native radio, invisible and in the same cell as the name, so the whole pill is its target. */
export const installRadio = style({
  gridArea: "1 / 1",
  width: "100%",
  height: "100%",
  margin: 0,
  opacity: 0,
  cursor: "pointer",
});

/** The command of the chosen manager only, across the full width under the choices. */
export const installCommand = style([
  codeBlock,
  {
    order: 2,
    flexBasis: "100%",
    // The command wraps at its spaces instead of scrolling sideways, so a phone shows all of it.
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
 * The row for the copy button: reserved, so the page does not move when the
 * button arrives, and gone where scripts do not run, since no button comes.
 */
export const installCopy = style({
  order: 3,
  flexBasis: "100%",
  display: "flex",
  justifyContent: "flex-end",
  minHeight: tokens.size.control,
  "@media": {
    "(scripting: none)": { display: "none" },
  },
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

/** The legend: one entry for each thing you get, with no card, border or shadow around it. */
export const legend = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.lg,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/**
 * One entry. On a phone the symbol and the name share a row and what it means
 * runs the full width beneath them, so the text keeps its measure; from the
 * `ROOMY` width the symbol is a key column beside the name and the text.
 */
export const legendItem = style({
  display: "grid",
  gridTemplateColumns: `${tokens.size.control} minmax(0, 1fr)`,
  columnGap: tokens.space.md,
  rowGap: tokens.space.xs,
  alignItems: "center",
  "@media": {
    [ROOMY]: {
      rowGap: tokens.space.xxs,
      alignItems: "start",
    },
  },
});

/**
 * An entry's symbol: its icon in the accent on the accent tint, as a map's key
 * draws a symbol beside its words. In forced colours the tint is dropped, and
 * the icon takes the system's text colour.
 */
export const legendSymbol = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: tokens.size.control,
  height: tokens.size.control,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.accentTint,
  color: tokens.color.accent,
  "@media": {
    [ROOMY]: { gridRow: "1 / span 2" },
    [FORCED]: { color: "CanvasText" },
  },
});

/** An entry's name: the semibold weight at the reading size. */
export const legendName = style({
  fontWeight: tokens.type.weight.semibold,
  textWrap: "balance",
});

/** What an entry means: quieter than its name. */
export const legendText = style({
  gridColumn: "1 / -1",
  margin: 0,
  color: tokens.color.textMuted,
  textWrap: "pretty",
  "@media": {
    [ROOMY]: { gridColumn: "2" },
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

/** A disclosure's one-line summary: a 44 px target with a chevron at its end, in the accent under a pointer. */
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
    "&:active": { color: tokens.color.accent },
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

/** The chevron that says whether a disclosure is open: down when closed, up when open. */
export const marker = style({
  flexShrink: 0,
  color: tokens.color.textMuted,
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

/** A disclosure's detail. */
export const detail = style({
  margin: 0,
  paddingBlockEnd: tokens.space.md,
  maxWidth: MEASURE,
  color: tokens.color.text,
});

/** The deep links into the playground, one to a line. */
export const deepLinks = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A link on its own line: a full-size target, tinted under a pointer, that shrinks a little when pressed. */
export const blockLink = style([
  link,
  {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.space.xs,
    minHeight: tokens.size.minTarget,
    paddingInline: tokens.space.xxs,
    marginInline: `calc(-1 * ${tokens.space.xxs})`,
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
