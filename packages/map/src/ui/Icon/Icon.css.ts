// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { tokens } from "@mapcairn/theme";
import { keyframes, style } from "@vanilla-extract/css";

const spin = keyframes({
  from: { transform: "rotate(0deg)" },
  to: { transform: "rotate(360deg)" },
});

/**
 * The icon box. Size and stroke come from the tokens and win over the
 * `width`, `height` and `stroke-width` attributes lucide writes, so an icon
 * can never be sized or weighted off the system.
 */
export const icon = style({
  display: "block",
  flexShrink: 0,
  width: tokens.size.icon,
  height: tokens.size.icon,
  strokeWidth: tokens.size.iconStroke,
});

/**
 * Rotates the icon by transform only. A full turn takes three slow motion
 * durations, and `prefers-reduced-motion` stops it, leaving the static glyph.
 */
export const spinning = style({
  animation: `${spin} calc(${tokens.motion.duration.slow} * 3) linear infinite`,
  "@media": {
    "(prefers-reduced-motion: reduce)": { animation: "none" },
  },
});

/**
 * Flips a glyph that points along the reading direction (next, back, a
 * disclosure arrow) when the page reads right to left. A glyph that does not
 * (a clock, a magnifier, a logo) is not given this.
 */
export const mirroredInRtl = style({
  selectors: { '[dir="rtl"] &': { transform: "scaleX(-1)" } },
});
