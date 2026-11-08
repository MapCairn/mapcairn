import { vars } from "@karta/theme";
import { globalStyle, style } from "@vanilla-extract/css";

export const root = style({
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: 0,
});

globalStyle(`${root} legend`, {
  marginBottom: "0.5rem",
  padding: 0,
  color: vars.color.onSurfaceVariant,
  fontSize: "0.8125rem",
  fontWeight: 600,
});

export const options = style({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "0.375rem",
});

export const option = style({
  display: "grid",
  justifyItems: "center",
  gap: "0.25rem",
  minWidth: 0,
  minHeight: "64px",
  padding: "0.25rem",
  border: "2px solid transparent",
  borderRadius: vars.shape.cornerMedium,
  background: "transparent",
  color: vars.color.onSurfaceVariant,
  font: "inherit",
  fontSize: "0.6875rem",
  cursor: "pointer",
  selectors: {
    '&[aria-pressed="true"]': {
      borderColor: vars.color.primary,
      color: vars.color.onSurface,
      background: vars.state.selected,
    },
    "&:hover": { background: vars.state.hover },
    "&:focus-visible": {
      outline: `2px solid ${vars.color.onSurface}`,
      outlineOffset: 2,
    },
  },
});

export const swatch = style({
  display: "block",
  width: "100%",
  height: "2.25rem",
  borderRadius: vars.shape.cornerSmall,
  background: vars.color.surfaceVariant,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${vars.color.onSurface} 12%, transparent)`,
});

globalStyle(`${option}[data-basemap="positron"] .${swatch}`, {
  background:
    "linear-gradient(135deg, #f1f0eb 0 42%, #d2d5d0 43% 47%, #f7f6f2 48% 72%, #d6ddd8 73%)",
});
globalStyle(`${option}[data-basemap="liberty"] .${swatch}`, {
  background:
    "linear-gradient(135deg, #e6d9c4 0 35%, #efeee8 36% 51%, #cbd9cf 52% 68%, #d5c6b7 69%)",
});
globalStyle(`${option}[data-basemap="dark"] .${swatch}`, {
  background:
    "linear-gradient(135deg, #343a40 0 40%, #555b60 41% 48%, #282d32 49% 72%, #48504c 73%)",
});
globalStyle(`${option}[data-basemap="satellite"] .${swatch}`, {
  background:
    "linear-gradient(135deg, #526a45 0 35%, #87916a 36% 55%, #3c5748 56% 72%, #a28f70 73%)",
});
globalStyle(`${option}[data-basemap="topo"] .${swatch}`, {
  background:
    "linear-gradient(135deg, #c8d4b8 0 35%, #e4ddc9 36% 54%, #a9c5c6 55% 69%, #d6c6a9 70%)",
});

export const optionLabel = style({
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
