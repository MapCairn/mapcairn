import { focusRing, surfaceBlurStyle, tokens, zLayer } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import { chromeVar, chromeVars } from "../MapChrome/chromeVars";

/** Width of the side panel: 360 px, written on the spacing scale (32 × 11.25). */
const panelWidth = `calc(${tokens.space.xl} * 11.25)`;

const safe = {
  top: "env(safe-area-inset-top, 0px)",
  right: "env(safe-area-inset-right, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
} as const;

/** Hidden after the exit transition, so a closed surface is not painted or hit. */
const closedVisibility = {
  visibility: "hidden",
  transition: [
    `transform ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    `opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    `visibility 0s linear ${tokens.motion.duration.base}`,
  ].join(", "),
} as const;

/**
 * The sheet or side panel: one element styled by `data-layout`, so its
 * content stays mounted when a rotation or resize changes the layout.
 * Attribute selectors keep these rules above the shared surface look.
 *
 * Sheet layout: pinned to the bottom edge at the full detent's height
 * (`--sheet-full-height`) and moved down by `--sheet-offset`, both set with
 * CSSOM. Only the transform changes while dragging or settling, so a drag
 * never causes layout. `data-dragging` turns the transition off so the sheet
 * follows the finger; settling uses the spring.
 *
 * Panel layout: a floating panel on the left, starting below the top-start
 * slot (the search pill is docked there by the app, and `MapChrome`
 * publishes that slot's bottom edge as `--chrome-top-start-bottom`) and
 * stopping at the bottom inset.
 *
 * Opening and closing animate transform and opacity only; the motion tokens
 * drop to near zero under `prefers-reduced-motion`.
 */
export const surface = style({
  ...surfaceBlurStyle,
  position: "absolute",
  zIndex: zLayer("sheet"),
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  border: `1px solid ${tokens.color.chromeBorder}`,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  pointerEvents: "auto",
  selectors: {
    '&[data-layout="sheet"]': {
      insetInline: 0,
      insetBlockEnd: 0,
      height: `var(--sheet-full-height, calc(100% - ${tokens.space.inset}))`,
      borderStartStartRadius: tokens.radius.sheet,
      borderStartEndRadius: tokens.radius.sheet,
      boxShadow: tokens.shadow.sheet,
      paddingInline: `${safe.left} ${safe.right}`,
      transform: "translateY(var(--sheet-offset, 100%))",
      transition: `transform ${tokens.motion.duration.slow} ${tokens.motion.spring}, opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    },
    '&[data-layout="sheet"][data-dragging="true"]': {
      transition: "none",
    },
    '&[data-layout="sheet"][data-state="closed"]': {
      ...closedVisibility,
      transform: "translateY(100%)",
      opacity: 0,
    },
    '&[data-layout="panel"]': {
      insetInlineStart: `calc(${tokens.space.inset} + ${safe.left})`,
      insetBlockStart: `calc(${chromeVar(chromeVars.topStartBottom, tokens.space.inset)} + ${tokens.space.sm})`,
      insetBlockEnd: `calc(${tokens.space.inset} + ${safe.bottom})`,
      width: `min(${panelWidth}, calc(100% - 2 * ${tokens.space.inset}))`,
      borderRadius: tokens.radius.sheet,
      boxShadow: tokens.shadow.floating,
      transform: "translateX(0)",
      opacity: 1,
      transition: `transform ${tokens.motion.duration.base} ${tokens.motion.easing}, opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    },
    '&[data-layout="panel"][data-state="closed"]': {
      ...closedVisibility,
      transform: `translateX(calc(-1 * ${tokens.space.lg}))`,
      opacity: 0,
    },
  },
});

/**
 * The header: handle, title and Close. In the sheet layout it is a drag
 * target with the handle, so it takes over touch gestures; the content below
 * keeps native scrolling.
 */
export const header = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gridTemplateAreas: '"handle handle" "brand brand" "title close"',
  alignItems: "center",
  columnGap: tokens.space.xs,
  paddingInline: `${tokens.space.md} ${tokens.space.xs}`,
  paddingBlock: tokens.space.xs,
  flexShrink: 0,
  selectors: {
    '[data-layout="sheet"] > &': {
      touchAction: "none",
      userSelect: "none",
      WebkitUserSelect: "none",
    },
  },
});

/**
 * The resize handle: a real button the width of the header with a visible
 * grabber bar, tall enough to be a 44 px target.
 */
export const handle = style({
  gridArea: "handle",
  display: "grid",
  placeItems: "center",
  justifySelf: "center",
  width: `calc(${tokens.size.control} * 2)`,
  height: tokens.size.minTarget,
  margin: 0,
  marginBlockStart: `calc(-1 * ${tokens.space.xs})`,
  padding: 0,
  border: "none",
  borderRadius: tokens.radius.inner,
  backgroundColor: "transparent",
  color: tokens.color.controlBoundary,
  cursor: "grab",
  touchAction: "none",
  selectors: {
    "&:focus-visible": focusRing,
    '[data-dragging="true"] &': { cursor: "grabbing" },
  },
});

/** The grabber bar drawn inside the handle. */
export const grabber = style({
  width: tokens.space.xl,
  height: tokens.space.xxs,
  borderRadius: tokens.radius.inner,
  backgroundColor: "currentColor",
});

/**
 * The host's decorative brand, a small row above the title. It takes no
 * room without a brand (an empty grid row has no height), and it is left out
 * at the peek detent of the bottom sheet, which has no room for a row.
 */
export const brand = style({
  gridArea: "brand",
  display: "flex",
  alignItems: "center",
  gap: tokens.space.xs,
  paddingBlockEnd: tokens.space.xs,
  selectors: {
    [`${surface}[data-layout="sheet"][data-detent="peek"] &`]: {
      display: "none",
    },
  },
});

/** The title. Focus lands here when the surface opens. */
export const title = style({
  gridArea: "title",
  margin: 0,
  fontSize: tokens.type.large.size,
  lineHeight: tokens.type.large.lineHeight,
  letterSpacing: tokens.type.large.tracking,
  fontWeight: tokens.type.weight.semibold,
  overflowWrap: "anywhere",
  borderRadius: tokens.radius.inner,
  selectors: {
    "&:focus-visible": focusRing,
  },
});

/** Keeps Close in its grid cell. */
export const close = style({ gridArea: "close" });

/**
 * The scrolling content. Overscroll stays inside so the page and the map do
 * not move, and the bottom padding clears the home indicator.
 *
 * In the sheet layout the sheet is always full height, moved down by
 * `--sheet-offset`, so at peek and half its lower part is off screen. The
 * bottom padding grows by that offset, so every section can still scroll up
 * into the visible part (for example the pin card a long-press opens).
 */
export const content = style({
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingInline: tokens.space.md,
  paddingBlockEnd: `calc(${tokens.space.md} + ${safe.bottom})`,
  selectors: {
    [`${surface}[data-layout="sheet"] &`]: {
      paddingBlockEnd: `calc(${tokens.space.md} + ${safe.bottom} + var(--sheet-offset, 0px))`,
    },
  },
});

/**
 * A focus sentinel at either end of the modal sheet: an empty, zero-size box
 * that takes no room in the column and draws nothing.
 */
export const sentinel = style({
  display: "block",
  flex: "none",
  width: 0,
  height: 0,
  overflow: "hidden",
});
