import type { FillPattern, LineDash, PaletteSlot } from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import { useId } from "react";
import * as styles from "./Layers.css";
import { paletteColour } from "./mapFeatures";

const { edge, halo } = tokenValues.dataMarker;

const WIDTH = 28;
const HEIGHT = 16;

/** The widest stroke the swatch can show; wider strokes are drawn at this width. */
const MAX_STROKE = 6;

/** Opacity of an area swatch's fill, close to the map's own fill so the key looks like the map. */
const AREA_FILL_OPACITY = 0.7;

/** The dash array of a line style, in swatch pixels. */
const DASH_ARRAY: Readonly<Record<LineDash, string | undefined>> = {
  solid: undefined,
  dashed: "4 3",
  dotted: "1 3",
};

/** Props for {@link ShapeGlyph}. */
export interface ShapeGlyphProps {
  /** An area (a filled box) or a line (a stroke). */
  readonly swatch: "area" | "line";
  readonly colour: PaletteSlot;
  /** Hatching over an area's fill. Defaults to none. */
  readonly pattern?: FillPattern;
  /** Dashing of the outline or line. Defaults to solid. */
  readonly dash?: LineDash;
  /** Outline or line width in pixels. Defaults to 1.5 for an area and 3 for a line. */
  readonly width?: number;
}

/** The marks of one hatching pattern, in a 6 pixel cell. */
function PatternMarks({ pattern }: { pattern: Exclude<FillPattern, "solid"> }) {
  switch (pattern) {
    case "stripes":
      return (
        <path
          d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5"
          stroke={edge}
          strokeWidth={1}
        />
      );
    case "crosshatch":
      return (
        <path
          d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5 M-1,5 L1,7 M0,0 L6,6 M5,-1 L7,1"
          stroke={edge}
          strokeWidth={0.8}
        />
      );
    case "dots":
      return <circle cx={3} cy={3} r={1.1} fill={edge} />;
  }
}

/**
 * What a polygon or line looks like on the map, as a small picture for the
 * legend, the list and the card, so the words and the map agree: the fill
 * over its hatching and ink outline, or the coloured line over a white
 * casing. Decorative: the words beside it carry the meaning. Colours are SVG
 * attributes, not styles, so they need nothing from the
 * Content-Security-Policy.
 */
export function ShapeGlyph({
  swatch,
  colour,
  pattern = "solid",
  dash = "solid",
  width,
}: ShapeGlyphProps) {
  const patternId = `mapcairn-hatch-${useId().replaceAll(":", "")}`;
  const fill = paletteColour(colour);
  const stroke = Math.min(width ?? (swatch === "area" ? 1.5 : 3), MAX_STROKE);
  const dashArray = DASH_ARRAY[dash];
  const hatched = swatch === "area" && pattern !== "solid";
  return (
    <svg
      className={styles.glyph}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      data-pattern={hatched ? pattern : undefined}
    >
      {hatched ? (
        <defs>
          <pattern
            id={patternId}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
          >
            <PatternMarks pattern={pattern} />
          </pattern>
        </defs>
      ) : null}
      {swatch === "area" ? (
        <>
          <rect
            data-part="fill"
            x={1.5}
            y={1.5}
            width={WIDTH - 3}
            height={HEIGHT - 3}
            fill={fill}
            fillOpacity={AREA_FILL_OPACITY}
          />
          {hatched ? (
            <rect
              data-part="hatch"
              x={1.5}
              y={1.5}
              width={WIDTH - 3}
              height={HEIGHT - 3}
              fill={`url(#${patternId})`}
            />
          ) : null}
          <rect
            data-part="outline"
            x={1.5}
            y={1.5}
            width={WIDTH - 3}
            height={HEIGHT - 3}
            fill="none"
            stroke={edge}
            strokeWidth={stroke}
            strokeDasharray={dashArray}
          />
        </>
      ) : (
        <>
          <line
            data-part="casing"
            x1={2}
            y1={HEIGHT / 2}
            x2={WIDTH - 2}
            y2={HEIGHT / 2}
            stroke={halo}
            strokeWidth={stroke + 3}
            strokeLinecap="butt"
          />
          <line
            data-part="line"
            x1={2}
            y1={HEIGHT / 2}
            x2={WIDTH - 2}
            y2={HEIGHT / 2}
            stroke={fill}
            strokeWidth={stroke}
            strokeDasharray={dashArray}
            strokeLinecap="butt"
          />
        </>
      )}
    </svg>
  );
}
