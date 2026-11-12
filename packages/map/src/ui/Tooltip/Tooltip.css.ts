// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { surfaceBlurStyle, tokens, zLayer } from "@mapcairn/theme";
import { keyframes, style } from "@vanilla-extract/css";

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

/**
 * The tooltip bubble. It sits on the popover layer, uses the translucent
 * surface with its blur, and keeps text at the smallest allowed size (13px).
 * Only opacity animates, and the duration token drops to near zero under
 * `prefers-reduced-motion`.
 */
export const content = style({
  ...surfaceBlurStyle,
  zIndex: zLayer("popover"),
  maxWidth: "20rem",
  padding: `${tokens.space.xs} ${tokens.space.sm}`,
  border: `1px solid ${tokens.color.chromeBorder}`,
  borderRadius: tokens.radius.inner,
  boxShadow: tokens.shadow.floating,
  color: tokens.color.text,
  fontFamily: tokens.type.family,
  fontWeight: tokens.type.weight.regular,
  fontSize: tokens.type.small.size,
  lineHeight: tokens.type.small.lineHeight,
  letterSpacing: tokens.type.small.tracking,
  overflowWrap: "anywhere",
  animationName: fadeIn,
  animationDuration: tokens.motion.duration.fast,
  animationTimingFunction: tokens.motion.easing,
});
