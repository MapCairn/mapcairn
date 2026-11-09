import { parseTemplate } from "./template";
import {
  checkColourSlot,
  checkTemplate,
  isObject,
  isText,
  type Json,
  list,
  type Problems,
  type ValidationOptions,
} from "./validateSupport";

const PATTERNS = ["solid", "stripes", "dots", "crosshatch"];
const DASHES = ["solid", "dashed", "dotted"];
const MIN_WIDTH = 0.5;
const MAX_WIDTH = 12;
const MIN_CLASSES = 2;
const MAX_CLASSES = 7;
const MAX_LABEL_ZOOM = 24;

function isWidth(value: unknown): boolean {
  return typeof value === "number" && value >= MIN_WIDTH && value <= MAX_WIDTH;
}

function checkWidth(problems: Problems, value: unknown, path: string): void {
  if (value !== undefined && !isWidth(value)) {
    problems.add(path, `must be from ${MIN_WIDTH} to ${MAX_WIDTH} pixels`);
  }
}

function checkDash(problems: Problems, value: unknown, path: string): void {
  if (value !== undefined && !DASHES.includes(value as string)) {
    problems.add(path, `must be one of ${DASHES.join(", ")}`);
  }
}

function checkPattern(
  problems: Problems,
  value: unknown,
  path: string,
  geometry: unknown,
): void {
  if (value === undefined) {
    return;
  }
  if (!PATTERNS.includes(value as string)) {
    problems.add(path, `must be one of ${PATTERNS.join(", ")}`);
  } else if (geometry === "line" && value !== "solid") {
    problems.add(path, "a pattern needs an area style");
  }
}

/** Checks the marks a class may carry. */
function checkMarks(
  problems: Problems,
  marks: Json,
  path: string,
  geometry: unknown,
): void {
  checkPattern(problems, marks.pattern, `${path}.pattern`, geometry);
  checkDash(problems, marks.dash, `${path}.dash`);
  checkWidth(problems, marks.width, `${path}.width`);
}

/**
 * The decoded field names a style may read, or `null` for a vector tile
 * layer, where a style reads tile properties by name and no field map exists.
 */
export type FieldNames = readonly string[] | null;

/** A tile property name. */
export const PROPERTY_NAME = /^[A-Za-z_][A-Za-z0-9_:-]*$/;

function checkField(
  problems: Problems,
  field: unknown,
  fields: FieldNames,
): void {
  const known =
    fields === null
      ? typeof field === "string" && PROPERTY_NAME.test(field)
      : fields.includes(field as string);
  if (!known) {
    problems.add(
      "style.colour.field",
      fields === null ? "must be a tile property name" : "is not a field",
    );
  }
}

/** The marks of each class of a rule, in class order, for the second-signal check. */
interface ClassMarks {
  readonly patterns: readonly unknown[];
  readonly dashes: readonly unknown[];
  readonly widths: readonly unknown[];
}

function marksOf(classes: readonly Json[]): ClassMarks {
  return {
    patterns: classes.map((item) => item.pattern ?? "solid"),
    dashes: classes.map((item) => item.dash ?? "solid"),
    widths: classes.map((item) => item.width ?? null),
  };
}

function allDistinct(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

function checkCategories(
  problems: Problems,
  colour: Json,
  geometry: unknown,
  fields: FieldNames,
): ClassMarks | null {
  checkField(problems, colour.field, fields);
  if (!problems.list(colour.categories, "style.colour.categories")) {
    return null;
  }
  const categories = colour.categories.map((item) =>
    isObject(item) ? item : {},
  );
  categories.forEach((category, index) => {
    const path = `style.colour.categories[${index}]`;
    checkColourSlot(problems, category.colour, `${path}.colour`, "categorical");
    problems.text(category.label, `${path}.label`);
    checkMarks(problems, category, path, geometry);
  });
  for (const key of ["value", "colour"]) {
    problems.unique(
      categories.map((category) => category[key]),
      (index) => `style.colour.categories[${index}].${key}`,
    );
  }
  const other = isObject(colour.other) ? colour.other : {};
  checkColourSlot(
    problems,
    other.colour,
    "style.colour.other.colour",
    "categorical",
  );
  if (!isText(other.label) || !isObject(colour.other)) {
    problems.add(
      "style.colour.other",
      "must have a label and a categorical colour",
    );
  }
  checkMarks(problems, other, "style.colour.other", geometry);
  return marksOf([...categories, other]);
}

function checkSteps(
  problems: Problems,
  colour: Json,
  geometry: unknown,
  fields: FieldNames,
): ClassMarks | null {
  checkField(problems, colour.field, fields);
  if (!problems.list(colour.steps, "style.colour.steps")) {
    return null;
  }
  const steps = colour.steps.map((step) => (isObject(step) ? step : {}));
  steps.forEach((step, index) => {
    const path = `style.colour.steps[${index}]`;
    checkColourSlot(problems, step.colour, `${path}.colour`, "ordinal");
    problems.text(step.label, `${path}.label`);
    checkMarks(problems, step, path, geometry);
  });
  const ascending = steps.every(
    (step, index) =>
      typeof step.min === "number" &&
      (index === 0 || (steps[index - 1]?.min as number) < step.min),
  );
  if (!ascending) {
    problems.add("style.colour.steps", "minimums must be ascending numbers");
  }
  return marksOf(steps);
}

/** Checks one per-class list of marks against the ramp's length. */
function checkMarkList(
  problems: Problems,
  colour: Json,
  key: "patterns" | "dashes" | "widths",
  length: number,
  geometry: unknown,
): void {
  const value = colour[key];
  if (value === undefined) {
    return;
  }
  const path = `style.colour.${key}`;
  if (!Array.isArray(value) || value.length !== length) {
    problems.add(path, "must have one entry for each class of the ramp");
    return;
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (key === "patterns") {
      checkPattern(problems, item, itemPath, geometry);
    } else if (key === "dashes") {
      checkDash(problems, item, itemPath);
    } else if (!isWidth(item)) {
      problems.add(
        itemPath,
        `must be from ${MIN_WIDTH} to ${MAX_WIDTH} pixels`,
      );
    }
  });
}

function checkIntervals(
  problems: Problems,
  colour: Json,
  geometry: unknown,
  fields: FieldNames,
): ClassMarks | null {
  checkField(problems, colour.field, fields);
  const { min, max } = colour;
  if (typeof min !== "number" || typeof max !== "number") {
    problems.add("style.colour", "min and max must be numbers");
  } else if (!(min < max)) {
    problems.add("style.colour", "min must be below max");
  }
  if (colour.unit !== undefined && typeof colour.unit !== "string") {
    problems.add("style.colour.unit", "must be text");
  }
  const ramp = list(colour.ramp);
  if (ramp.length < MIN_CLASSES || ramp.length > MAX_CLASSES) {
    problems.add(
      "style.colour.ramp",
      `must have ${MIN_CLASSES} to ${MAX_CLASSES} classes`,
    );
    return null;
  }
  ramp.forEach((slot, index) => {
    checkColourSlot(problems, slot, `style.colour.ramp[${index}]`, "ordinal");
  });
  for (const key of ["patterns", "dashes", "widths"] as const) {
    checkMarkList(problems, colour, key, ramp.length, geometry);
  }
  return {
    patterns: ramp.map((_, index) => list(colour.patterns)[index] ?? "solid"),
    dashes: ramp.map((_, index) => list(colour.dashes)[index] ?? "solid"),
    widths: ramp.map((_, index) => list(colour.widths)[index] ?? null),
  };
}

/** Whether a label template shows the field the colour rule reads. */
function labelNames(label: unknown, field: unknown): boolean {
  return (
    isObject(label) &&
    typeof label.template === "string" &&
    parseTemplate(label.template).some((item) => item.name === field)
  );
}

/**
 * Checks a polygon or line style: its geometry, widths, dashes and label,
 * and its colour rule. Colour is never the only signal: a rule with several
 * classes needs a pattern, a width or a dash that is different in every
 * class, or a label that names the field the colour reads.
 */
export function checkShapeStyle(
  problems: Problems,
  style: Json,
  fields: FieldNames,
  options: ValidationOptions,
): void {
  const { geometry } = style;
  if (geometry !== "area" && geometry !== "line") {
    problems.add("style.geometry", "must be area or line");
  }
  const { fillOpacity } = style;
  if (
    fillOpacity !== undefined &&
    (typeof fillOpacity !== "number" || fillOpacity < 0.1 || fillOpacity > 1)
  ) {
    problems.add("style.fillOpacity", "must be from 0.1 to 1");
  }
  checkWidth(problems, style.width, "style.width");
  checkDash(problems, style.dash, "style.dash");
  if (
    style.label !== undefined &&
    problems.object(style.label, "style.label")
  ) {
    if (fields === null) {
      // The engine reads one property from each feature in a tile.
      if (
        typeof style.label.template !== "string" ||
        !/^\{[A-Za-z0-9_-]+\}$/.test(style.label.template)
      ) {
        problems.add(
          "style.label.template",
          "must be a single tile property such as {name}",
        );
      }
    } else {
      checkTemplate(
        problems,
        style.label.template,
        "style.label.template",
        fields,
        options,
      );
    }
    const { minzoom } = style.label;
    if (
      minzoom !== undefined &&
      (typeof minzoom !== "number" || minzoom < 0 || minzoom > MAX_LABEL_ZOOM)
    ) {
      problems.add(
        "style.label.minzoom",
        `must be from 0 to ${MAX_LABEL_ZOOM}`,
      );
    }
  }

  const colour = style.colour;
  if (!problems.object(colour, "style.colour")) {
    return;
  }
  let marks: ClassMarks | null = null;
  switch (colour.kind) {
    case "fixed":
      checkColourSlot(problems, colour.colour, "style.colour.colour");
      problems.text(colour.label, "style.colour.label");
      checkMarks(problems, colour, "style.colour", geometry);
      return;
    case "category":
      marks = checkCategories(problems, colour, geometry, fields);
      break;
    case "steps":
      marks = checkSteps(problems, colour, geometry, fields);
      break;
    case "intervals":
      marks = checkIntervals(problems, colour, geometry, fields);
      break;
    default:
      problems.add(
        "style.colour.kind",
        "must be fixed, category, steps or intervals",
      );
      return;
  }
  if (
    marks &&
    !allDistinct(marks.patterns) &&
    !allDistinct(marks.dashes) &&
    !allDistinct(marks.widths) &&
    !labelNames(style.label, colour.field)
  ) {
    problems.add(
      "style.colour",
      "colour must not be the only signal: give every class its own pattern, width or dash, or add a label that names the field",
    );
  }
}
