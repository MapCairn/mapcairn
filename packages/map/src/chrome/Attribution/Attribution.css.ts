// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { focusRing, surfaceBlurStyle, tokens, zLayer } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";
import { chromeVar, chromeVars } from "../MapChrome/chromeVars";

/**
 * The anchor for the popover. The button sits at the end edge of the
 * bottom-end slot; the popover is positioned against this box.
 */
export const root = style({
  position: "relative",
  display: "flex",
  justifyContent: "flex-end",
  // The button is a 48 px target with a bare icon in its middle, so the icon
  // looks well above the screen inset. Sinking the box by one step puts the
  // icon near the corner while the target stays fully on screen.
  marginBlockEnd: `calc(-1 * ${tokens.space.xs})`,
});

/**
 * The credits button sits on the same translucent chrome surface as the other
 * controls, so the icon reads over any basemap, over place names on a raster
 * map included. Hover keeps the surface and adds the hairline tint over it.
 */
export const onMapIcon = style({
  ...surfaceBlurStyle,
  borderRadius: "50%",
  boxShadow: tokens.shadow.floating,
  selectors: {
    '&:hover:not([aria-disabled="true"])': {
      backgroundColor: tokens.color.surface,
      backgroundImage: `linear-gradient(${tokens.color.hairline}, ${tokens.color.hairline})`,
    },
  },
});

/** The end stack's width plus the gap after it: how far a beside popover moves inwards. */
const besideOffset = `calc(${chromeVar(chromeVars.endStackWidth, "0px")} + ${tokens.space.sm})`;

/**
 * The credits popover. It grows upwards and inwards from the button, on the
 * `chromeRaised` layer. Its width is capped at the chrome width minus both
 * insets, and its height at the room `MapChrome` measures between the end
 * stack and this slot, so it never covers the end stack above it or the
 * scale bar beside the button (which it clears by sitting above the bottom
 * row).
 *
 * With `data-placement="beside"` (chosen when the list would scroll above the
 * button) its end edge moves a gap clear of the end stack's start edge, and
 * it may rise to the gap below the search row. Its width then also leaves the
 * side panel's room. Anything that still does not fit scrolls inside it.
 */
export const popover = style({
  ...surfaceBlurStyle,
  position: "absolute",
  insetBlockEnd: `calc(100% + ${tokens.space.xs})`,
  insetInlineEnd: 0,
  zIndex: zLayer("chromeRaised"),
  boxSizing: "border-box",
  width: "max-content",
  maxWidth: `calc(${chromeVar(chromeVars.width, "100vw")} - 2 * ${tokens.space.inset})`,
  maxHeight: chromeVar(chromeVars.bottomEndRoom, "none"),
  overflowY: "auto",
  overscrollBehavior: "contain",
  margin: 0,
  padding: `${tokens.space.sm} ${tokens.space.md}`,
  border: `1px solid ${tokens.color.chromeBorder}`,
  borderRadius: tokens.radius.control,
  boxShadow: tokens.shadow.floating,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  fontWeight: tokens.type.weight.regular,
  selectors: {
    "&[hidden]": { display: "none" },
    // The fade after the credits' first showing. The duration token drops to
    // near zero under prefers-reduced-motion, and the component skips the
    // fade altogether when reduced motion is on.
    '&[data-closing="true"]': {
      opacity: 0,
      transition: `opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    },
    "&:focus-visible": focusRing,
    '&[data-placement="beside"]': {
      insetInlineEnd: besideOffset,
      maxWidth: `calc(${chromeVar(chromeVars.width, "100vw")} - 2 * ${tokens.space.inset} - ${besideOffset} - ${chromeVar(chromeVars.bottomStartX, "0px")})`,
      maxHeight: chromeVar(chromeVars.bottomEndBesideRoom, "none"),
    },
  },
});

/** The credit lines, one per row. */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: tokens.space.xxs,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/**
 * A credit link: underlined so it is not identified by colour alone, with a
 * tall enough line box to stay easy to hit inside the popover.
 */
export const link = style({
  display: "inline-block",
  paddingBlock: tokens.space.xxs,
  color: tokens.color.accent,
  textDecorationLine: "underline",
  borderRadius: tokens.radius.inner,
  selectors: {
    "&:focus-visible": focusRing,
  },
});
