// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { mapOverlayTokens, tokens, zLayer } from "@mapcairn/theme";
import { style } from "@vanilla-extract/css";

/** Width of a measure line or crosshair stroke. */
const lineWidth = tokens.space.xxs;
/** Width of the halo drawn under a line, so it reads on any basemap. */
const haloWidth = `calc(${tokens.space.xxs} + 2 * ${tokens.focus.innerWidth})`;
/** Width of an outline around a filled shape. */
const outlineWidth = tokens.focus.outerWidth;

/**
 * The one overlay layer. It spans the map host and is one of the few
 * components allowed `position: absolute`. It never takes pointer events, so
 * the engine underneath keeps every gesture.
 */
export const layer = style({
  position: "absolute",
  inset: 0,
  zIndex: zLayer("mapOverlay"),
  overflow: "hidden",
  pointerEvents: "none",
});

/** The SVG canvas every overlay draws into. */
export const canvas = style({
  display: "block",
  width: "100%",
  height: "100%",
  overflow: "visible",
});

const roundStroke = {
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** The dropped pin's body. */
export const pinBody = style({
  fill: mapOverlayTokens.pin,
  stroke: mapOverlayTokens.halo,
  strokeWidth: outlineWidth,
  ...roundStroke,
});

/** The dot in the pin's head. */
export const pinDot = style({
  fill: mapOverlayTokens.halo,
});

/** The halo under a measure line. */
export const measureHalo = style({
  fill: "none",
  stroke: mapOverlayTokens.halo,
  strokeWidth: haloWidth,
  ...roundStroke,
});

/** A committed measure line. */
export const measureLine = style({
  fill: "none",
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: lineWidth,
  ...roundStroke,
});

/** The dashed line to the hover point, not yet committed. */
export const measurePreview = style([
  measureLine,
  { strokeDasharray: `${tokens.space.xs} ${tokens.space.xs}` },
]);

/** The fill of a measured area. Translucent; the outline carries the contrast. */
export const measureFill = style({
  fill: mapOverlayTokens.measureFill,
  stroke: "none",
});

/** A measure vertex. */
export const measureVertex = style({
  fill: mapOverlayTokens.halo,
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: outlineWidth,
});

/** A finished shape drawn with the draw tool. Translucent fill, outline in the measure colour. */
export const drawLine = style([measureLine]);

/** The selected shape, heavier than the others so selection never rests on colour alone. */
export const drawLineSelected = style({
  fill: "none",
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: `calc(${lineWidth} + ${outlineWidth})`,
  ...roundStroke,
});

/** The shape still being drawn: dashed, like the preview edge. */
export const drawDraft = style([
  measureLine,
  { strokeDasharray: `${tokens.space.xs} ${tokens.space.xs}` },
]);

/** The fill of a finished or unfinished area. */
export const drawFill = style({
  fill: mapOverlayTokens.measureFill,
  stroke: "none",
});

/** A point shape. */
export const drawPoint = style({
  fill: mapOverlayTokens.measureLine,
  stroke: mapOverlayTokens.halo,
  strokeWidth: outlineWidth,
});

/** The selected point shape, with a heavier edge. */
export const drawPointSelected = style({
  fill: mapOverlayTokens.measureLine,
  stroke: mapOverlayTokens.halo,
  strokeWidth: `calc(${outlineWidth} * 2)`,
});

/** A vertex handle. */
export const drawVertex = style({
  fill: mapOverlayTokens.halo,
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: outlineWidth,
});

/** The selected vertex: larger and filled, so it differs by more than colour. */
export const drawVertexSelected = style({
  fill: mapOverlayTokens.measureLine,
  stroke: mapOverlayTokens.halo,
  strokeWidth: `calc(${outlineWidth} * 2)`,
});

/** A midpoint handle: small and hollow, because pressing it adds a vertex. */
export const drawMidpoint = style({
  fill: mapOverlayTokens.halo,
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: outlineWidth,
  opacity: 0.85,
});

/** A circle's radius handle: a square, so it is not mistaken for a vertex. */
export const drawRadiusHandle = style({
  fill: mapOverlayTokens.halo,
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: outlineWidth,
});

/** The location accuracy circle. */
export const accuracy = style({
  fill: mapOverlayTokens.accuracyFill,
  stroke: mapOverlayTokens.accuracyStroke,
  strokeWidth: outlineWidth,
});

/** The halo under the centre crosshair. */
export const crosshairHalo = style({
  stroke: mapOverlayTokens.halo,
  strokeWidth: haloWidth,
  ...roundStroke,
});

/** The centre crosshair. */
export const crosshairLine = style({
  stroke: mapOverlayTokens.measureLine,
  strokeWidth: outlineWidth,
  ...roundStroke,
});
