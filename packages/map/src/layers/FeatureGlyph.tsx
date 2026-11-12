// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  evaluatePointStyle,
  evaluateShapeStyle,
  type FeedLayerDefinition,
  type FieldValue,
  isShapeStyle,
  type LegendEntry,
} from "@mapcairn/core";
import { MarkerGlyph } from "./MarkerGlyph";
import { ShapeGlyph } from "./ShapeGlyph";

/** The words for the class a feature falls in, such as `Orange alert` or `10 to 99`. */
export function featureClass(
  definition: FeedLayerDefinition,
  fields: Readonly<Record<string, FieldValue>>,
): string {
  const { style } = definition;
  return isShapeStyle(style)
    ? evaluateShapeStyle(style, fields).label
    : evaluatePointStyle(style, fields).label;
}

/** Props for {@link FeatureGlyph}. */
export interface FeatureGlyphProps {
  readonly definition: FeedLayerDefinition;
  readonly fields: Readonly<Record<string, FieldValue>>;
  /** Draws a point's marker at exactly this radius, instead of the map's. */
  readonly radius?: number;
  /** Otherwise draws it at the map's radius, but no larger than this. */
  readonly maxRadius?: number;
}

/**
 * The picture of how the map draws one feature, from its layer's style: its
 * marker for a point, its fill or stroke for a polygon or line.
 */
export function FeatureGlyph({
  definition,
  fields,
  radius,
  maxRadius = Number.POSITIVE_INFINITY,
}: FeatureGlyphProps) {
  const { style } = definition;
  if (isShapeStyle(style)) {
    const look = evaluateShapeStyle(style, fields);
    return (
      <ShapeGlyph
        swatch={style.geometry}
        colour={look.colour}
        pattern={look.pattern}
        dash={look.dash}
        width={look.width}
      />
    );
  }
  const marker = evaluatePointStyle(style, fields);
  return (
    <MarkerGlyph
      shape={marker.shape}
      colour={marker.colour}
      radius={radius ?? Math.min(marker.radius, maxRadius)}
    />
  );
}

/** The glyph for one line of a legend. */
export function LegendGlyph({ entry }: { readonly entry: LegendEntry }) {
  if (entry.swatch === "area" || entry.swatch === "line") {
    return (
      <ShapeGlyph
        swatch={entry.swatch}
        colour={entry.colour}
        pattern={entry.pattern}
        dash={entry.dash}
        width={entry.width}
      />
    );
  }
  return (
    <MarkerGlyph
      shape={entry.shape}
      colour={entry.colour}
      radius={entry.radius}
    />
  );
}
