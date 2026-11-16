// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatNumber } from "../format/format";
import type { FieldValue } from "../ports/layers";
import type { MessageCatalogue } from "../ports/messages";
import type {
  FillPattern,
  LineDash,
  PaletteSlot,
  ShapeIntervalColour,
  ShapeMarks,
  ShapeStyle,
} from "./definition";
import { toNumber } from "./numbers";

/** Stroke width in pixels of a polygon's outline when the style names none. */
export const DEFAULT_AREA_WIDTH = 1.5;

/** Stroke width in pixels of a line when the style names none. */
export const DEFAULT_LINE_WIDTH = 2.5;

/** Opacity of a polygon's fill when the style names none. */
export const DEFAULT_FILL_OPACITY = 0.55;

/** How one polygon or line is drawn, worked out from its definition's style. */
export interface ShapeLook {
  readonly colour: PaletteSlot;
  /** The words for the class, such as `10 to 99`, for the legend, list and card. */
  readonly label: string;
  readonly pattern: FillPattern;
  readonly dash: LineDash;
  /** The outline or line width in pixels. */
  readonly width: number;
  readonly fillOpacity: number;
}

const MAX_FRACTION_DIGITS = 2;

function defaults(style: ShapeStyle, marks: ShapeMarks) {
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

function look(
  style: ShapeStyle,
  colour: PaletteSlot,
  label: string,
  marks: ShapeMarks,
): ShapeLook {
  return { colour, label, ...defaults(style, marks) };
}

function intervalLabel(
  colour: ShapeIntervalColour,
  index: number,
  width: number,
  catalogue: MessageCatalogue,
): string {
  const unit = colour.unit ?? "";
  const last = colour.ramp.length - 1;
  const figure = (value: number) =>
    formatNumber(value, catalogue.language, {
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
  style: ShapeStyle,
  colour: ShapeIntervalColour,
  catalogue: MessageCatalogue,
): ShapeLook[] {
  const width = (colour.max - colour.min) / colour.ramp.length;
  return colour.ramp.map((slot, index) =>
    look(style, slot, intervalLabel(colour, index, width, catalogue), {
      pattern: colour.patterns?.[index],
      dash: colour.dashes?.[index],
      width: colour.widths?.[index],
    }),
  );
}

/**
 * Every class of a style in legend order: the categories and then the class
 * for other values, the steps, the equal intervals worked out from the range,
 * or the one fixed class. Defaults are filled in, so a legend, a map and a
 * list read the same values. The words for an interval are written in
 * `catalogue`'s language.
 */
export function shapeClasses(
  style: ShapeStyle,
  catalogue: MessageCatalogue,
): readonly ShapeLook[] {
  const { colour } = style;
  switch (colour.kind) {
    case "fixed":
      return [look(style, colour.colour, colour.label, colour)];
    case "category":
      return [
        ...colour.categories.map((category) =>
          look(style, category.colour, category.label, category),
        ),
        look(style, colour.other.colour, colour.other.label, colour.other),
      ];
    case "steps":
      return colour.steps.map((step) =>
        look(style, step.colour, step.label, step),
      );
    case "intervals":
      return intervalClasses(style, colour, catalogue);
  }
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
  style: ShapeStyle,
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
  style: ShapeStyle,
  fields: Readonly<Record<string, FieldValue>>,
  catalogue: MessageCatalogue,
): ShapeLook {
  return shapeEvaluator(style, catalogue)(fields);
}
