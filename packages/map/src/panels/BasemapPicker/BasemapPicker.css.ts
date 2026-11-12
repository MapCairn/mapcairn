// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, tokens } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

/**
 * The custom property that carries a basemap's own swatch colour (see
 * `BasemapDefinition.swatch`). It is set on the element with CSSOM, never as
 * an inline `style` attribute, which the production CSP refuses.
 */
export const swatchColourVar = "--basemap-swatch";

/** Three tiles across, with token gaps. */
export const grid = style({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: tokens.space.sm,
});

/**
 * One tile: the preview, then the name. The focus ring is drawn around the
 * whole tile when the hidden radio inside it has keyboard focus. The padding
 * keeps that ring clear of the selected outline on the preview.
 */
export const tile = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xs,
  minWidth: 0,
  padding: tokens.space.xxs,
  borderRadius: tokens.radius.inner,
  cursor: "pointer",
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  selectors: { "&:has(:focus-visible)": focusRing },
});

/**
 * The preview frame. Its background shows only while a preview is loading: a
 * basemap with no preview, or one whose preview failed, fills the frame with
 * its swatch instead.
 * The 2px border is transparent until selected, when it becomes a ring in the
 * raised surface colour. The accent outline sits outside that ring, so the
 * selection reads against the sheet on one side and against any thumbnail on
 * the other. Preview and badge share one grid cell, so nothing needs absolute
 * positioning.
 */
export const thumb = recipe({
  base: {
    display: "grid",
    boxSizing: "border-box",
    aspectRatio: "4 / 3",
    overflow: "hidden",
    border: "2px solid transparent",
    borderRadius: tokens.radius.inner,
    backgroundColor: tokens.color.pageBackground,
    forcedColorAdjust: "none",
  },
  variants: {
    unavailable: {
      // Only the preview fades. The name and the note stay at full contrast.
      true: { opacity: 0.5 },
      false: {},
    },
    selected: {
      true: {
        borderColor: tokens.color.surfaceRaised,
        outline: `calc(${tokens.focus.outerWidth} + 1px) solid ${tokens.color.accent}`,
        outlineOffset: 0,
      },
      false: {
        "@media": {
          "(hover: hover)": {
            selectors: {
              "label:hover &": {
                outline: `1px solid ${tokens.color.controlBoundary}`,
              },
            },
          },
        },
      },
    },
  },
  defaultVariants: { selected: false, unavailable: false },
});

/** The row under the grid that holds "Try again". */
export const retry = style({
  display: "flex",
  justifyContent: "center",
  marginTop: tokens.space.sm,
});

/** The preview image, filling the frame. */
export const image = style({
  display: "block",
  gridArea: "1 / 1",
  width: "100%",
  height: "100%",
  objectFit: "cover",
});

/**
 * A plain colour in place of the preview, for a basemap with no preview, one
 * whose preview failed to load, and Save data mode: the basemap's own swatch
 * colour when it has one, else the map's background colour, so the tile
 * keeps its size without an image. The hairline keeps it visible against a
 * sheet of a similar colour.
 */
export const swatch = style({
  display: "block",
  gridArea: "1 / 1",
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  border: `1px solid ${tokens.color.hairline}`,
  backgroundColor: `var(${swatchColourVar}, ${tokens.color.mapBackground})`,
});

/**
 * The check badge in the corner of the selected preview: an accent disc with
 * a ring in the raised surface colour. Over a light preview the accent
 * contrasts; over a dark one the ring does. The tick is a shape, so the state
 * never depends on colour.
 */
export const badge = style({
  gridArea: "1 / 1",
  justifySelf: "end",
  alignSelf: "start",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "content-box",
  width: tokens.size.icon,
  height: tokens.size.icon,
  margin: tokens.space.xxs,
  border: `2px solid ${tokens.color.surfaceRaised}`,
  borderRadius: tokens.radius.round,
  backgroundColor: tokens.color.accent,
  color: tokens.color.accentContrast,
  forcedColorAdjust: "none",
});

/** The tick inside the badge. */
export const badgeIcon = style({
  width: "100%",
  height: "100%",
  padding: tokens.space.xxs,
  boxSizing: "border-box",
  strokeWidth: tokens.size.iconStroke,
});

/** The short note under a name, such as "Uses more data" in Save data mode. */
export const dataNote = style({
  display: "block",
  textAlign: "center",
  color: tokens.color.textMuted,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
});

/** The basemap name under the preview. */
export const name = recipe({
  base: {
    overflowWrap: "anywhere",
    textAlign: "center",
    fontSize: tokens.type.small.size,
    lineHeight: tokens.type.small.lineHeight,
    letterSpacing: tokens.type.small.tracking,
  },
  variants: {
    selected: {
      true: { fontWeight: tokens.type.weight.semibold },
      false: { fontWeight: tokens.type.weight.regular },
    },
  },
  defaultVariants: { selected: false },
});
