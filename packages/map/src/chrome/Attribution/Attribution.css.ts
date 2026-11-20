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
 *
 * It overrides the `IconButton` recipe, which sits in a lower cascade layer
 * (DESIGN.md, "Overriding a primitive"), so the surface, radius and shadow win
 * whatever order the stylesheets load in. The focus ring (whose inner ring is a
 * shadow) and the hover tint are set here too, to stay above the floating
 * shadow and the surface.
 */
export const onMapIcon = style({
  ...surfaceBlurStyle,
  borderRadius: "50%",
  boxShadow: tokens.shadow.floating,
  selectors: {
    "&:focus-visible": focusRing,
    '&:hover:not([aria-disabled="true"])': {
      backgroundColor: tokens.color.surface,
      backgroundImage: `linear-gradient(${tokens.color.hairline}, ${tokens.color.hairline})`,
    },
  },
});

/** The end stack's width plus the gap after it: how far a beside popover moves inwards. */
const besideOffset = `calc(${chromeVar(chromeVars.endStackWidth, "0px")} + ${tokens.space.sm})`;

/** The step the popover sits above the top of the bottom row. */
const popoverStep = tokens.space.xs;

/**
 * A room `MapChrome` measured from the top of the bottom row, less the step
 * the popover sits above that row, so its top still stops a gap below the
 * slot above it, and less the extra rise over a toolbar it shares width with.
 */
function roomAboveStep(
  room: typeof chromeVars.bottomEndRoom | typeof chromeVars.bottomEndBesideRoom,
): string {
  return `calc(${chromeVar(room, "100vh")} - ${popoverStep} - ${chromeVar(chromeVars.popoverCentreRise, "0px")})`;
}

/**
 * The credits popover. It grows upwards and inwards from the button, on the
 * `chromeRaised` layer. Its width is capped at the chrome width minus both
 * insets, and its height at the room `MapChrome` measures between the end
 * stack and the bottom row, less the step it sits above that row, so it stops
 * a gap below the end stack above it. It
 * sits a gap above the top of the whole bottom row, not just the button
 * (`bottomEndRise` is how far a taller neighbour, such as the readout with
 * the cursor coordinates, reaches above the button), so it never covers the
 * scale bar or the coordinates beside the button; the rise is a transform, so
 * it slides when the readout's height changes (from `data-settled="true"`, with
 * the base duration, which the tokens drop to near zero under
 * `prefers-reduced-motion`). With `data-readout-clear="true"` (set when the popover starts a gap after the
 * readout's end edge, so the two share no width) it sits only a step above
 * the button, next to it, and the rise is left out.
 *
 * With `data-placement="beside"` (chosen when the list would scroll above the
 * button) its end edge moves a gap clear of the end stack's start edge, and
 * it may rise to the gap below the search row. Its width then also leaves the
 * side panel's room. Anything that still does not fit scrolls inside it.
 */
export const popover = style({
  ...surfaceBlurStyle,
  position: "absolute",
  insetBlockEnd: `calc(100% + ${popoverStep})`,
  transform: `translateY(calc(-1 * ${chromeVar(chromeVars.bottomEndRise, "0px")}))`,
  // The extra rise over a toolbar or message in the bottom-centre slot it shares
  // width with. It is `translate`, which no transition covers, and `MapChrome`
  // writes it in the observer callback that sees the slot change, so the popover
  // is clear of the slot in that frame and never slides over it, unlike the
  // readout's rise above, which is a `transform` that slides.
  translate: `0 calc(-1 * ${chromeVar(chromeVars.popoverCentreRise, "0px")})`,
  insetInlineEnd: 0,
  zIndex: zLayer("chromeRaised"),
  boxSizing: "border-box",
  width: "max-content",
  maxWidth: `calc(${chromeVar(chromeVars.width, "100vw")} - 2 * ${tokens.space.inset})`,
  maxHeight: roomAboveStep(chromeVars.bottomEndRoom),
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
    "&:focus-visible": focusRing,
    '&[data-readout-clear="true"]': {
      transform: "none",
    },
    // The rise follows the readout's height, which changes as the cursor
    // coordinates appear and go, so it slides rather than jumps. Only once the
    // popover has been on screen for a frame, so opening never slides it.
    '&[data-settled="true"]': {
      transition: `transform ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    },
    // The fade after the credits' first showing, after the rule above so that
    // it wins. The duration token drops to near zero under
    // prefers-reduced-motion, and the component skips the fade altogether when
    // reduced motion is on.
    '&[data-closing="true"]': {
      opacity: 0,
      transition: `opacity ${tokens.motion.duration.base} ${tokens.motion.easing}`,
    },
    '&[data-placement="beside"]': {
      insetInlineEnd: besideOffset,
      maxWidth: `calc(${chromeVar(chromeVars.width, "100vw")} - 2 * ${tokens.space.inset} - ${besideOffset} - ${chromeVar(chromeVars.bottomStartX, "0px")})`,
      maxHeight: roomAboveStep(chromeVars.bottomEndBesideRoom),
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
