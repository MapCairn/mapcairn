// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatLocale, formatNumber } from "../format/format";
import { resolveText } from "../messages/resolveText";
import type { FieldValue } from "../ports/layers";
import type { MessageCatalogue } from "../ports/messages";
import type {
  FeedShapeStyle,
  FillPattern,
  LineDash,
  PaletteSlot,
  ShapeIntervalColour,
  ShapeMarks,
} from "./definition";
import { toNumber } from "./numbers";
import { resolveLayerTemplate } from "./template";

/** Stroke width in pixels of a polygon's outline when the style names none. */
export const DEFAULT_AREA_WIDTH = 1.5;

/** Stroke width in pixels of a line when the style names none. */
export const DEFAULT_LINE_WIDTH = 2.5;

/** Opacity of a polygon's fill when the style names none. */
export const DEFAULT_FILL_OPACITY = 0.55;

/** How one polygon or line is drawn, worked out from its definition's style, without its words. */
export interface ShapeAppearance {
  readonly colour: PaletteSlot;
  readonly pattern: FillPattern;
  readonly dash: LineDash;
  /** The outline or line width in pixels. */
  readonly width: number;
  readonly fillOpacity: number;
}

/** How one polygon or line is drawn, and the words for its class. */
export interface ShapeLook extends ShapeAppearance {
  /** The words for the class, such as `10 to 99`, for the legend, list and card. */
  readonly label: string;
}

const MAX_FRACTION_DIGITS = 2;

/** One class of a style: how it is drawn, and its words, which an interval writes in the language it is asked for. */
interface ShapeClass {
  readonly appearance: ShapeAppearance;
  readonly label: (catalogue: MessageCatalogue) => string;
}

function defaults(style: FeedShapeStyle, marks: ShapeMarks) {
  return {
    pattern: marks.pattern ?? "solid",
    dash: marks.dash ?? style.dash ?? "solid",
    width:
      marks.width ??
      style.width ??
      (style.geometry === "area" ? DEFAULT_AREA_WIDTH : DEFAULT_LINE_WIDTH),
    fillOpacity: style.fillOpacity ?? DEFAULT_FILL_OPACITY,
  } as const;
}

function classOf(
  style: FeedShapeStyle,
  colour: PaletteSlot,
  label: string | ShapeClass["label"],
  marks: ShapeMarks,
): ShapeClass {
  return {
    appearance: { colour, ...defaults(style, marks) },
    label:
      typeof label === "string"
        ? (catalogue) => resolveText(catalogue, label)
        : label,
  };
}

function intervalLabel(
  colour: ShapeIntervalColour,
  index: number,
  width: number,
  catalogue: MessageCatalogue,
): string {
  const unit =
    colour.unit === undefined
      ? ""
      : resolveLayerTemplate(colour.unit, catalogue);
  const last = colour.ramp.length - 1;
  const figure = (value: number) =>
    formatNumber(value, formatLocale(catalogue), {
      maximumFractionDigits: MAX_FRACTION_DIGITS,
    });
  const low = figure(colour.min + index * width);
  const high = figure(colour.min + (index + 1) * width);
  if (index === 0) {
    return catalogue.t("layers.interval.upTo", { high, unit });
  }
  return index === last
    ? catalogue.t("layers.interval.andAbove", { low, unit })
    : catalogue.t("layers.interval.range", { low, high, unit });
}

function intervalClasses(
  style: FeedShapeStyle,
  colour: ShapeIntervalColour,
): ShapeClass[] {
  const width = (colour.max - colour.min) / colour.ramp.length;
  return colour.ramp.map((slot, index) =>
    classOf(
      style,
      slot,
      (catalogue) => intervalLabel(colour, index, width, catalogue),
      {
        pattern: colour.patterns?.[index],
        dash: colour.dashes?.[index],
        width: colour.widths?.[index],
      },
    ),
  );
}

function classesOf(style: FeedShapeStyle): readonly ShapeClass[] {
  const { colour } = style;
  switch (colour.kind) {
    case "fixed":
      return [classOf(style, colour.colour, colour.label, colour)];
    case "category":
      return [
        ...colour.categories.map((category) =>
          classOf(style, category.colour, category.label, category),
        ),
        classOf(style, colour.other.colour, colour.other.label, colour.other),
      ];
    case "steps":
      return colour.steps.map((step) =>
        classOf(style, step.colour, step.label, step),
      );
    case "intervals":
      return intervalClasses(style, colour);
  }
}

/**
 * How every class of a style is drawn, in legend order, with defaults filled
 * in. It carries no words, so it needs no language: it is what a map engine
 * draws from.
 */
export function shapeAppearances(
  style: FeedShapeStyle,
): readonly ShapeAppearance[] {
  return classesOf(style).map(({ appearance }) => appearance);
}

/**
 * Every class of a style in legend order: the categories and then the class
 * for other values, the steps, the equal intervals worked out from the range,
 * or the one fixed class. Defaults are filled in, so a legend, a map and a
 * list read the same values. The words for an interval are written in
 * `catalogue`'s language.
 */
export function shapeClasses(
  style: FeedShapeStyle,
  catalogue: MessageCatalogue,
): readonly ShapeLook[] {
  return classesOf(style).map(({ appearance, label }) => ({
    ...appearance,
    label: label(catalogue),
  }));
}

/** Picks a feature's {@link ShapeLook} from its fields. */
export type ShapeEvaluator = (
  fields: Readonly<Record<string, FieldValue>>,
) => ShapeLook;

/**
 * Prepares a style once, so drawing thousands of features does not work out
 * its classes for each one. A value that is missing or unreadable falls in
 * the other class (categories) or the first class (steps and intervals).
 */
export function shapeEvaluator(
  style: FeedShapeStyle,
  catalogue: MessageCatalogue,
): ShapeEvaluator {
  const { colour } = style;
  const classes = shapeClasses(style, catalogue);
  const pick = (index: number) => classes[index] as ShapeLook;
  switch (colour.kind) {
    case "fixed":
      return () => pick(0);
    case "category":
      return (fields) => {
        const index = colour.categories.findIndex(
          (category) => category.value === fields[colour.field],
        );
        return pick(index === -1 ? colour.categories.length : index);
      };
    case "steps":
      return (fields) => {
        const value = toNumber(fields[colour.field]);
        let index = 0;
        if (value !== null) {
          colour.steps.forEach((step, position) => {
            if (step.min <= value) {
              index = position;
            }
          });
        }
        return pick(index);
      };
    case "intervals": {
      const width = (colour.max - colour.min) / colour.ramp.length;
      return (fields) => {
        const value = toNumber(fields[colour.field]);
        const raw =
          value === null ? 0 : Math.floor((value - colour.min) / width);
        return pick(Math.min(Math.max(raw, 0), colour.ramp.length - 1));
      };
    }
  }
}

/** Works out one polygon's or line's look from a style and the feature's fields. */
export function evaluateShapeStyle(
  style: FeedShapeStyle,
  fields: Readonly<Record<string, FieldValue>>,
  catalogue: MessageCatalogue,
): ShapeLook {
  return shapeEvaluator(style, catalogue)(fields);
}
