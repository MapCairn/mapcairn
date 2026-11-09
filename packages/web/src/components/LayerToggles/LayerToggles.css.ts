import { vars } from "@karta/theme";
import { globalStyle, style } from "@vanilla-extract/css";
import { appVars } from "../../theme/app.css";

/** Search fields retain a visible keyboard focus ring in either theme. */
export const searchLabel = style({
  display: "grid",
  gap: "0.375rem",
  color: vars.color.onSurfaceVariant,
  fontSize: appVars.fontSize.md,
});
globalStyle(`.${searchLabel} input`, {
  minHeight: "44px",
  padding: "0.5rem 0.75rem",
  border: `1px solid ${vars.color.outlineVariant}`,
  borderRadius: vars.shape.cornerSmall,
  background: vars.color.surfaceContainerLowest,
  color: vars.color.onSurface,
  font: "inherit",
});
globalStyle(`.${searchLabel} input:focus-visible`, {
  outline: `${appVars.focusRingWidth} solid ${vars.color.onSurface}`,
  outlineOffset: 2,
});

/** Group boundaries are semantic rather than decorative. */
export const group = style({
  display: "grid",
  gap: "0.25rem",
  margin: 0,
  padding: "0.75rem 0",
  border: 0,
});

/** Removes browser list spacing from the control stack. */
export const list = style({ listStyle: "none", margin: 0, padding: 0 });

/** Keeps each control large enough for touch interaction. */
export const row = style({
  display: "grid",
  gap: "0.375rem",
  padding: "0.5rem 0.625rem",
  minHeight: "48px",
  borderRadius: vars.shape.cornerSmall,
  fontSize: appVars.fontSize.base,
});

/** The visible label and checkbox share a single hit target. */
export const rowLabel = style({
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  cursor: "pointer",
});

/** Uses the shared accent rather than a browser-specific checkbox colour. */
export const checkbox = style({
  width: "1.25rem",
  height: "1.25rem",
  accentColor: vars.color.primary,
});

/** Layer labels wrap rather than clip on narrow screens. */
export const label = style({
  color: vars.color.onSurface,
  overflowWrap: "anywhere",
});

/** Secondary copy remains separate from the control's accessible name. */
export const description = style({
  margin: 0,
  color: vars.color.onSurfaceVariant,
  fontSize: appVars.fontSize.sm,
});

/** Marks configured layers which are not available yet. */
export const badge = style({
  fontSize: appVars.fontSize.sm,
  color: vars.color.onSurfaceVariant,
});

/** Load failures use the theme's error colour. */
export const badgeError = style({
  fontSize: appVars.fontSize.sm,
  color: vars.color.error,
});
