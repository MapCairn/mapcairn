import { tokens, tokenValues, zLayer } from "@mapcairn/theme";
import { style, styleVariants } from "@vanilla-extract/css";

/** Height of the sticky nav: one row of 44px links with a little air. */
const NAV_HEIGHT = `calc(${tokens.size.minTarget} + ${tokens.space.xs} * 2)`;

/**
 * The scrolling page. The document is fixed for the map, so this scrolls
 * itself, and its scroll padding keeps anchor targets and focused controls
 * clear of the sticky nav (WCAG 2.4.11).
 */
export const scroller = style({
  height: "100%",
  overflowY: "auto",
  overscrollBehavior: "contain",
  scrollPaddingTop: `calc(${NAV_HEIGHT} + ${tokens.space.md})`,
  backgroundColor: tokens.color.pageBackground,
  color: tokens.color.text,
});

/** The centred column every part of the page sits in. */
const column = {
  width: "100%",
  maxWidth: "72rem",
  marginInline: "auto",
  paddingInline: tokens.space.inset,
} as const;

/** The page header: the title and intro, with the theme control beside or below them. */
export const header = style({
  ...column,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: tokens.space.md,
  paddingBlock: `${tokens.space.xl} ${tokens.space.md}`,
});

/** The title and intro, which shrink before the theme control does. */
export const headerText = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  minWidth: 0,
});

/** The page's one h1, at the title size. */
export const title = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** The theme control and its label. */
export const themeControl = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  width: "min(100%, 20rem)",
});

/** The sticky bar that holds the in-page nav. */
export const navBar = style({
  position: "sticky",
  top: 0,
  zIndex: zLayer("chrome"),
  backgroundColor: tokens.color.pageBackground,
  borderBottom: `1px solid ${tokens.color.hairline}`,
  "@media": {
    "(forced-colors: active)": {
      borderBottomColor: "CanvasText",
    },
  },
});

/**
 * The links scroll sideways inside the bar on narrow screens rather than
 * widening the page. The padding leaves room for the focus ring, which the
 * scroll box would otherwise clip.
 */
export const navList = style({
  ...column,
  display: "flex",
  gap: tokens.space.xxs,
  margin: "0 auto",
  paddingBlock: tokens.space.xs,
  listStyle: "none",
  overflowX: "auto",
  scrollbarWidth: "thin",
});

/** One in-page link, a full 44px target. */
export const navLink = style({
  display: "inline-flex",
  alignItems: "center",
  minHeight: tokens.size.minTarget,
  paddingInline: tokens.space.sm,
  borderRadius: tokens.radius.pill,
  color: tokens.color.text,
  fontWeight: tokens.type.weight.semibold,
  textDecoration: "none",
  whiteSpace: "nowrap",
  ":hover": {
    backgroundColor: tokens.color.accentTint,
    textDecoration: "underline",
  },
});

/** The page content: every section in one column. */
export const main = style({
  ...column,
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xl,
  paddingBlock: `${tokens.space.lg} ${tokens.space.xl}`,
});

/** One section, named by its h2. */
export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.md,
  minWidth: 0,
});

/** A section's h2, with a hairline above it. */
export const sectionTitle = style({
  margin: 0,
  paddingTop: tokens.space.md,
  borderTop: `1px solid ${tokens.color.hairline}`,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  letterSpacing: tokens.type.title.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** An h3: a component name or a sub-topic. */
export const subTitle = style({
  margin: 0,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontWeight: tokens.type.weight.semibold,
});

/** Explanatory text, kept to a readable line length. */
export const prose = style({
  margin: 0,
  maxWidth: "42rem",
  color: tokens.color.textMuted,
});

/** Small muted text: captions, state labels and token values. */
export const caption = style({
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  color: tokens.color.textMuted,
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
});

/** Tabular figures, so numbers line up in columns. */
export const figures = style({
  fontVariantNumeric: "tabular-nums",
});

/** Proportional figures, shown beside tabular ones for comparison. */
export const proportional = style({
  fontVariantNumeric: "proportional-nums",
});

/** A responsive grid of cards that drops to one column on a phone. */
export const grid = style({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 15rem), 1fr))",
  gap: tokens.space.md,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A grid of small tiles: icons and radii. */
export const narrowGrid = style([
  grid,
  { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 8rem), 1fr))" },
]);

/** A token or component card. */
export const card = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  minWidth: 0,
  padding: tokens.space.md,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  border: `1px solid ${tokens.color.hairline}`,
});

/** A card's token or role name. */
export const cardName = style({
  fontWeight: tokens.type.weight.semibold,
  overflowWrap: "anywhere",
});

/** The light and dark swatches of one role, side by side. */
export const swatchPair = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: tokens.space.xs,
});

/**
 * Sets one theme's variables on a swatch, over that theme's own map
 * background, so a translucent role shows as it does in the app.
 */
export const swatchFrame = style({
  padding: tokens.space.xxs,
  borderRadius: tokens.radius.inner,
  backgroundColor: tokens.color.pageBackground,
  border: `1px solid ${tokens.color.controlBoundary}`,
  forcedColorAdjust: "none",
});

const swatchBase = style({
  display: "block",
  height: tokens.size.control,
  borderRadius: tokens.radius.inner,
  forcedColorAdjust: "none",
});

/** One swatch class per colour role, painted with that role's variable. */
export const swatch = styleVariants(tokens.color, (value) => [
  swatchBase,
  { backgroundColor: value },
]);

/** Term and value pairs on a card. */
export const facts = style({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  columnGap: tokens.space.sm,
  rowGap: tokens.space.xxs,
  margin: 0,
});

/** A term on a card, such as Light or Pair. */
export const factTerm = style({
  color: tokens.color.textMuted,
});

/** A value on a card, such as a hex colour. */
export const factValue = style({
  margin: 0,
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
});

/** A full-width data table with tabular figures. */
export const table = style({
  width: "100%",
  borderCollapse: "collapse",
  fontVariantNumeric: "tabular-nums",
});

/** A table's caption, aligned with its first column. */
export const tableCaption = style({
  textAlign: "start",
  paddingBottom: tokens.space.xs,
  color: tokens.color.textMuted,
});

/** A table cell. It wraps between words, never inside one. */
export const cell = style({
  padding: `${tokens.space.xs} ${tokens.space.xs} ${tokens.space.xs} 0`,
  borderBottom: `1px solid ${tokens.color.hairline}`,
  textAlign: "start",
  verticalAlign: "baseline",
  overflowWrap: "break-word",
});

/** A column header cell. */
export const headCell = style([
  cell,
  {
    fontWeight: tokens.type.weight.semibold,
    color: tokens.color.textMuted,
  },
]);

/** A ratio with its result under it, so the column stays narrow. */
export const result = style({
  display: "flex",
  flexDirection: "column",
});

/** Pass or Fail with its icon, kept on one line. */
export const verdict = style({
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: tokens.space.xxs,
  fontWeight: tokens.type.weight.semibold,
});

/** A passing verdict, in the text colour. */
export const pass = style({ color: tokens.color.text });

/** A failing verdict, in the danger colour. */
export const fail = style({ color: tokens.color.danger });

/** One sample per step of the type scale. */
export const typeSample = styleVariants(
  tokenValues.typeScale,
  (_value, key) => ({
    margin: 0,
    fontSize: tokens.type[key].size,
    lineHeight: tokens.type[key].lineHeight,
    letterSpacing: tokens.type[key].tracking,
    overflowWrap: "anywhere",
  }),
);

/** Weight 600. */
export const semibold = style({
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
});

/** Weight 400. */
export const regular = style({
  margin: 0,
  fontWeight: tokens.type.weight.regular,
});

/** A vertical stack with a small gap. */
export const stack = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  minWidth: 0,
});

/** A spacing bar, as wide as its token. */
const barBase = style({
  display: "block",
  height: tokens.space.sm,
  borderRadius: tokens.radius.inner,
  backgroundColor: tokens.color.accent,
  forcedColorAdjust: "none",
});

/** One bar per spacing token, as wide as the token. */
export const spaceBar = styleVariants(tokens.space, (value) => [
  barBase,
  { width: value },
]);

const radiusBase = style({
  display: "block",
  width: tokens.size.control,
  height: tokens.size.control,
  backgroundColor: tokens.color.accentTint,
  border: `2px solid ${tokens.color.accent}`,
});

/** One sample square per radius token. */
export const radiusBox = styleVariants(tokens.radius, (value) => [
  radiusBase,
  { borderRadius: value },
]);

/** One sample card per elevation shadow. */
export const elevationBox = styleVariants(tokens.shadow, (value) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "6rem",
  padding: tokens.space.md,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  boxShadow: value,
}));

/** The space around the elevation samples, so their shadows show. */
export const elevationGrid = style([grid, { padding: tokens.space.md }]);

/** A tile with a centred sample and its name underneath. */
export const iconTile = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: tokens.space.xs,
  padding: tokens.space.sm,
  borderRadius: tokens.radius.control,
  backgroundColor: tokens.color.surfaceRaised,
  border: `1px solid ${tokens.color.hairline}`,
  textAlign: "center",
});

/** The z layers, drawn top layer first. */
export const layerList = style({
  display: "flex",
  flexDirection: "column-reverse",
  gap: tokens.space.xxs,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One z layer: its name and value on a baseline. */
export const layerItem = style({
  alignItems: "baseline",
  display: "flex",
  justifyContent: "space-between",
  gap: tokens.space.md,
  padding: `${tokens.space.xs} ${tokens.space.sm}`,
  borderRadius: tokens.radius.inner,
  backgroundColor: tokens.color.surfaceRaised,
  border: `1px solid ${tokens.color.hairline}`,
  fontVariantNumeric: "tabular-nums",
});

/** One component's demo, under its h3. */
export const demo = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.sm,
  padding: tokens.space.md,
  borderRadius: tokens.radius.sheet,
  backgroundColor: tokens.color.surfaceRaised,
  border: `1px solid ${tokens.color.hairline}`,
  minWidth: 0,
});

/** The states of one component, labelled, wrapping on narrow screens. */
export const states = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: tokens.space.md,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** One labelled state of a component, as wide as its content. */
export const state = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: tokens.space.xxs,
  minWidth: 0,
  maxWidth: "100%",
});

/** A state that needs the full width of the demo, such as a slider or a message. */
export const wideState = style([state, { flex: "1 1 18rem" }]);

/** Makes a demo fill the width of its state. */
export const fullWidth = style({
  width: "100%",
});

/** A plain list with no bullets or indent. */
export const list = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
  width: "100%",
});

/** The font check's result line. */
export const fontGate = style({
  display: "flex",
  alignItems: "center",
  gap: tokens.space.xs,
  margin: 0,
  fontWeight: tokens.type.weight.semibold,
});

/** The font check's result when Plex did not load. */
export const fontGateFailed = style({
  color: tokens.color.danger,
});

/** The probe text at the title size. */
export const specimen = style({
  margin: 0,
  fontSize: tokens.type.title.size,
  lineHeight: tokens.type.title.lineHeight,
  overflowWrap: "anywhere",
});

/** Text inside a Surface demo, padded so the surface shows around it. */
export const surfaceSample = style({
  margin: 0,
  minWidth: "8rem",
  padding: tokens.space.md,
});

/** A spacing row: the token name in a fixed column, then its bar. */
export const spaceRow = style({
  display: "grid",
  gridTemplateColumns: "7rem 1fr",
  alignItems: "center",
  justifyItems: "start",
  gap: tokens.space.md,
  padding: `${tokens.space.xs} ${tokens.space.sm}`,
  borderRadius: tokens.radius.inner,
  backgroundColor: tokens.color.surfaceRaised,
  border: `1px solid ${tokens.color.hairline}`,
});
