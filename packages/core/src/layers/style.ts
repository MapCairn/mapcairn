// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { resolveText } from "../messages/resolveText";
import type { FieldValue } from "../ports/layers";
import type { DefinitionText, MessageCatalogue } from "../ports/messages";
import {
  type FeedShapeStyle,
  type FillPattern,
  type HeatmapSpec,
  isFeedLayer,
  isHeatmapLayer,
  isShapeStyle,
  isVectorTileLayer,
  type LayerDefinition,
  type LineDash,
  type MarkerShape,
  type PaletteSlot,
  type PointStyle,
} from "./definition";
import { stepFor, toNumber } from "./numbers";
import { shapeClasses } from "./shapeStyle";

/** The radius in pixels of a marker whose style has no size rule. */
export const DEFAULT_MARKER_RADIUS = 6;

/** How one feature is drawn, worked out from its definition's style. */
export interface MarkerStyle {
  /** The palette slot the marker is filled with. */
  readonly colour: PaletteSlot;
  /** The marker's radius in CSS pixels. */
  readonly radius: number;
  /** The marker's shape. */
  readonly shape: MarkerShape;
  /**
   * The words for the colour, such as `Orange alert`, for the list and card,
   * as the definition writes them: a message key, a host text or a plain
   * string, which `resolveText` turns into text in the active language.
   */
  readonly label: DefinitionText;
}

/** One line of a legend. */
export interface LegendEntry {
  /** The row's words. */
  readonly label: string;
  /** The palette slot of the glyph. */
  readonly colour: PaletteSlot;
  /** The marker shape of the glyph. */
  readonly shape: MarkerShape;
  /** The glyph's radius in CSS pixels. */
  readonly radius: number;
  /**
   * What the swatch draws. A marker (the default) uses `shape` and `radius`;
   * an area or a line also uses `pattern`, `dash` and `width`, so the key
   * shows every signal the map does.
   */
  readonly swatch?: "marker" | "area" | "line" | "density";
  /** The hatching of an area glyph. */
  readonly pattern?: FillPattern;
  /** The dashing of a line glyph. */
  readonly dash?: LineDash;
  /** The stroke width of a line glyph, in pixels. */
  readonly width?: number;
}

/** A layer's legend, derived from its style so the two cannot disagree. */
export interface Legend {
  /** The rows of the key, in the order the layer's style lists them. */
  readonly entries: readonly LegendEntry[];
}

function radiusFor(style: PointStyle, value: number | null): number {
  if (!style.size) {
    return DEFAULT_MARKER_RADIUS;
  }
  return stepFor(style.size.stops, ([min]) => min, value)[1];
}

/** Works out a feature's colour, size, shape and label from a point style. */
export function evaluatePointStyle(
  style: PointStyle,
  fields: Readonly<Record<string, FieldValue>>,
): MarkerStyle {
  const shape = style.shape ?? "circle";
  const size = style.size ? toNumber(fields[style.size.field]) : null;
  const radius = radiusFor(style, size);
  const { colour } = style;
  switch (colour.kind) {
    case "fixed":
      return { colour: colour.colour, radius, shape, label: colour.label };
    case "steps": {
      const step = stepFor(
        colour.steps,
        (item) => item.min,
        toNumber(fields[colour.field]),
      );
      return { colour: step.colour, radius, shape, label: step.label };
    }
    case "category": {
      const value = fields[colour.field];
      const category = colour.categories.find((item) => item.value === value);
      return category
        ? {
            colour: category.colour,
            radius,
            shape: category.shape ?? shape,
            label: category.label,
          }
        : {
            colour: colour.other.colour,
            radius,
            shape,
            label: colour.other.label,
          };
    }
  }
}

function pointLegend(
  style: PointStyle,
  catalogue: MessageCatalogue,
): LegendEntry[] {
  const shape = style.shape ?? "circle";
  const { colour } = style;
  switch (colour.kind) {
    case "fixed":
      return [
        {
          label: resolveText(catalogue, colour.label),
          colour: colour.colour,
          shape,
          radius: DEFAULT_MARKER_RADIUS,
        },
      ];
    case "steps":
      return colour.steps.map((step) => ({
        label: resolveText(catalogue, step.label),
        colour: step.colour,
        shape,
        radius:
          style.size?.field === colour.field
            ? radiusFor(style, step.min)
            : DEFAULT_MARKER_RADIUS,
      }));
    case "category":
      return [
        ...colour.categories.map((category) => ({
          label: resolveText(catalogue, category.label),
          colour: category.colour,
          shape: category.shape ?? shape,
          radius: DEFAULT_MARKER_RADIUS,
        })),
        {
          label: resolveText(catalogue, colour.other.label),
          colour: colour.other.colour,
          shape,
          radius: DEFAULT_MARKER_RADIUS,
        },
      ];
  }
}

function heatmapLegend(
  heatmap: HeatmapSpec,
  catalogue: MessageCatalogue,
): LegendEntry[] {
  return heatmap.ramp.map((colour, index) => ({
    label: resolveText(catalogue, heatmap.words[index] ?? ""),
    colour,
    shape: "square" as const,
    radius: DEFAULT_MARKER_RADIUS,
    swatch: "density" as const,
  }));
}

function shapeLegend(
  style: FeedShapeStyle,
  catalogue: MessageCatalogue,
): LegendEntry[] {
  return shapeClasses(style, catalogue).map((item) => ({
    label: item.label,
    colour: item.colour,
    shape: "square" as const,
    radius: DEFAULT_MARKER_RADIUS,
    swatch: style.geometry,
    pattern: item.pattern,
    dash: item.dash,
    width: item.width,
  }));
}

/**
 * A layer's legend. For a feed it lists each colour with its words, its
 * shape and the size it draws; for a tile layer it is the definition's own
 * legend, drawn as squares, or nothing. The words for an interval are written
 * in `catalogue`'s language.
 */
export function legendFor(
  definition: LayerDefinition,
  catalogue: MessageCatalogue,
): Legend {
  if (isFeedLayer(definition)) {
    const { style } = definition;
    return {
      entries: isShapeStyle(style)
        ? shapeLegend(style, catalogue)
        : pointLegend(style, catalogue),
    };
  }
  if (isHeatmapLayer(definition)) {
    return { entries: heatmapLegend(definition.heatmap, catalogue) };
  }
  if (isVectorTileLayer(definition)) {
    return {
      entries: definition.sourceLayers.flatMap((layer) =>
        "heatmap" in layer
          ? heatmapLegend(layer.heatmap, catalogue)
          : shapeLegend(layer.style, catalogue),
      ),
    };
  }
  return {
    entries: (definition.legend ?? []).map((entry) => ({
      label: resolveText(catalogue, entry.label),
      colour: entry.colour,
      shape: "square" as const,
      radius: DEFAULT_MARKER_RADIUS,
    })),
  };
}
