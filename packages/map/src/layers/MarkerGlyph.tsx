import type { MarkerShape, PaletteSlot } from "@karta/core";
import * as styles from "./Layers.css";
import { paletteColour } from "./mapFeatures";

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
 * the list and the card, so words and map look the same. Decorative: the
 * words beside it carry the meaning. The colour is an SVG `fill` attribute,
 * not a style, so it needs nothing from the Content-Security-Policy.
 */
export function MarkerGlyph({ shape, colour, radius }: MarkerGlyphProps) {
  const extent = Math.ceil(radius + 2);
  const size = extent * 2;
  return (
    <svg
      className={styles.glyph}
      width={size}
      height={size}
      viewBox={`${-extent} ${-extent} ${size} ${size}`}
      fill={paletteColour(colour)}
      aria-hidden="true"
      focusable="false"
    >
      <ShapePath shape={shape} r={radius} />
    </svg>
  );
}
