import { surfaceBlurStyle, tokens } from "@mapcairn/theme";
import { recipe } from "@vanilla-extract/recipes";

/**
 * The translucent, blurred surface every piece of floating chrome sits on.
 * The opaque fallback (no `backdrop-filter`, reduced transparency, more
 * contrast, forced colours) comes from the colour and blur tokens, so nothing
 * here branches on it. The border is transparent by default and painted by
 * the `chromeBorder` token where shape must stay visible.
 */
export const surface = recipe({
  base: {
    ...surfaceBlurStyle,
    boxSizing: "border-box",
    border: `1px solid ${tokens.color.chromeBorder}`,
    color: tokens.color.text,
  },
  variants: {
    variant: {
      floating: { boxShadow: tokens.shadow.floating },
      raised: { backgroundColor: tokens.color.surfaceRaised },
      flat: {},
    },
    radius: {
      pill: { borderRadius: tokens.radius.pill },
      control: { borderRadius: tokens.radius.control },
      sheet: { borderRadius: tokens.radius.sheet },
    },
  },
  defaultVariants: { variant: "floating", radius: "control" },
});
