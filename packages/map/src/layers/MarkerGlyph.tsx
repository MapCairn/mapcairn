// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MarkerShape, PaletteSlot } from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import * as styles from "./Layers.css";
import { paletteColour } from "./mapFeatures";

const { edge, halo, edgeWidth, haloWidth } = tokenValues.dataMarker;

/** How far a shape's corners reach past its radius. */
const SHAPE_REACH = 1.15;

/** Props for {@link MarkerGlyph}. */
export interface MarkerGlyphProps {
  readonly shape: MarkerShape;
  readonly colour: PaletteSlot;
  /** The radius the map draws it at, in CSS pixels. */
  readonly radius: number;
}

/** The SVG for a shape of radius `r` centred on the origin. */
function ShapePath({ shape, r }: { shape: MarkerShape; r: number }) {
  switch (shape) {
    case "circle":
      return <circle r={r} />;
    case "square": {
      const half = r * 0.86;
      return <rect x={-half} y={-half} width={half * 2} height={half * 2} />;
    }
    case "diamond": {
      const d = r * 1.13;
      return <polygon points={`0,${-d} ${d},0 0,${d} ${-d},0`} />;
    }
    case "triangle": {
      const side = r * 1.1;
      const top = -side * (2 / Math.sqrt(3)) + r * 0.15;
      const base = side / Math.sqrt(3) + r * 0.15;
      return <polygon points={`0,${top} ${side},${base} ${-side},${base}`} />;
    }
  }
}

/**
 * The marker a layer draws for a feature, as a small picture for the legend,
 * the list and the card, so words and map look the same: the fill over a
 * dark edge over a white halo, which shows on a light surface (the edge) and
 * a dark one (the halo) alike. Decorative: the words beside it carry the
 * meaning. Colours are SVG attributes, not styles, so they need nothing from
 * the Content-Security-Policy.
 */
export function MarkerGlyph({ shape, colour, radius }: MarkerGlyphProps) {
  // A diamond's and a triangle's corners reach past the radius.
  const extent = Math.ceil(radius * SHAPE_REACH + edgeWidth + haloWidth);
  const size = extent * 2;
  return (
    <svg
      className={styles.glyph}
      width={size}
      height={size}
      viewBox={`${-extent} ${-extent} ${size} ${size}`}
      aria-hidden="true"
      focusable="false"
      strokeLinejoin="round"
    >
      <g fill={halo} stroke={halo} strokeWidth={2 * (edgeWidth + haloWidth)}>
        <ShapePath shape={shape} r={radius} />
      </g>
      <g fill={edge} stroke={edge} strokeWidth={2 * edgeWidth}>
        <ShapePath shape={shape} r={radius} />
      </g>
      <g fill={paletteColour(colour)}>
        <ShapePath shape={shape} r={radius} />
      </g>
    </svg>
  );
}
