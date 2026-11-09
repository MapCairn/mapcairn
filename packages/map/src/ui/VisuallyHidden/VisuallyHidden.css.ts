import { style } from "@vanilla-extract/css";

/**
 * Hides content visually while keeping it available to assistive technology.
 * The clip pattern, not `display: none`, so screen readers still read it.
 */
export const visuallyHidden = style({
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
});
