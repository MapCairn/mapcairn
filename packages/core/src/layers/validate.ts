// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { isIsoDate } from "./controls";
import { MAX_MINUTES_AGO, MINUTES_PER_DAY, slotTime } from "./dateTime";
import type { LayerDefinition } from "./definition";
import { isCategoricalSlot } from "./palette";
import { parseTemplate } from "./template";
import { checkIdentify } from "./validateIdentify";
import {
  checkHeatmapLayer,
  checkQuerySource,
  checkRange,
  checkVectorTiles,
} from "./validateKinds";
import { checkShapeStyle } from "./validateShapes";
import {
  checkCard,
  checkColourSlot,
  checkDecoder,
  checkFields,
  checkTemplate,
  checkUrl,
  ID,
  isHttpsOrigin,
  isHttpsUrl,
  isObject,
  isText,
  type Json,
  list,
  MAX_RADIUS,
  OPTION_VALUE,
  Problems,
  SHAPES,
  type ValidationOptions,
} from "./validateSupport";

export type { ValidationOptions } from "./validateSupport";

function isDateBound(value: unknown): boolean {
  if (isObject(value)) {
    const { daysAgo } = value;
    return (
      typeof daysAgo === "number" && Number.isInteger(daysAgo) && daysAgo >= 0
    );
  }
  return isIsoDate(value);
}

/** The values a segmented or switch control can take, or null for others. */
function controlValues(control: Json): readonly string[] | null {
  if (control.kind === "segmented") {
    return list(control.options).map((option) =>
      isObject(option) ? String(option.value) : "",
    );
  }
  return control.kind === "switch" ? ["true", "false"] : null;
}

const SHAPE_TEXT = `must be one of ${SHAPES.join(", ")}`;

function checkSegmented(problems: Problems, control: Json, path: string): void {
  if (!problems.list(control.options, `${path}.options`)) {
    return;
  }
  control.options.forEach((option, index) => {
    const optionPath = `${path}.options[${index}]`;
    if (!problems.object(option, optionPath)) {
      return;
    }
    if (typeof option.value !== "string" || !OPTION_VALUE.test(option.value)) {
      problems.add(
        `${optionPath}.value`,
        "must be lowercase letters, digits, dots, underscores or hyphens",
      );
    }
    problems.text(option.label, `${optionPath}.label`);
  });
  const values = controlValues(control) ?? [];
  problems.unique(values, (index) => `${path}.options[${index}].value`);
  if (!values.includes(control.default as string)) {
    problems.add(`${path}.default`, "must be one of the options");
  }
}

function checkSwitch(problems: Problems, control: Json, path: string): void {
  if (typeof control.default !== "boolean") {
    problems.add(`${path}.default`, "must be true or false");
  }
}

function checkDate(problems: Problems, control: Json, path: string): void {
  for (const key of ["min", "max", "default"]) {
    if (!isDateBound(control[key])) {
      problems.add(
        `${path}.${key}`,
        "must be a YYYY-MM-DD date or { daysAgo }",
      );
    }
  }
  const { min, max, default: fallback } = control;
  if (isIsoDate(min) && isIsoDate(max) && min > max) {
    problems.add(path, "min is after max");
  }
  const belowMin = isIsoDate(min) && isIsoDate(fallback) && fallback < min;
  const aboveMax = isIsoDate(max) && isIsoDate(fallback) && fallback > max;
  if (belowMin || aboveMax) {
    problems.add(`${path}.default`, "must be between min and max");
  }
}

function isStep(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    MINUTES_PER_DAY % value === 0
  );
}

/** Whether a bound is a slot on the step or a whole number of minutes ago, up to about a hundred years. */
function isTimeBound(value: unknown, step: number): boolean {
  if (isObject(value)) {
    const { minutesAgo } = value;
    return (
      typeof minutesAgo === "number" &&
      Number.isInteger(minutesAgo) &&
      minutesAgo >= 0 &&
      minutesAgo <= MAX_MINUTES_AGO
    );
  }
  const time = slotTime(value);
  return time !== null && (time / 60_000) % step === 0;
}

/** A relative bound's minutes, or null for a fixed one. */
function minutesAgo(bound: unknown): number | null {
  return isObject(bound) && typeof bound.minutesAgo === "number"
    ? bound.minutesAgo
    : null;
}

function checkDateTime(problems: Problems, control: Json, path: string): void {
  const step = control.stepMinutes;
  if (!isStep(step)) {
    problems.add(
      `${path}.stepMinutes`,
      "must be a whole number of minutes that divides a day",
    );
    return;
  }
  for (const key of ["min", "max", "default"]) {
    if (!isTimeBound(control[key], step)) {
      problems.add(
        `${path}.${key}`,
        "must be a YYYY-MM-DDtHHMM slot on the step or { minutesAgo }",
      );
    }
  }
  const [min, max, fallback] = [control.min, control.max, control.default].map(
    slotTime,
  );
  const [minAgo, maxAgo] = [control.min, control.max].map(minutesAgo);
  if (
    (min != null && max != null && min > max) ||
    (minAgo != null && maxAgo != null && minAgo < maxAgo)
  ) {
    problems.add(path, "min is after max");
  }
  if (minAgo != null && max != null) {
    problems.add(path, "min would pass max as time goes on");
  }
  const belowMin = min != null && fallback != null && fallback < min;
  const aboveMax = max != null && fallback != null && fallback > max;
  if (belowMin || aboveMax) {
    problems.add(`${path}.default`, "must be between min and max");
  }
}

function checkOpacity(problems: Problems, control: Json, path: string): void {
  const value = control.default;
  if (typeof value !== "number" || value < 0.1 || value > 1) {
    problems.add(`${path}.default`, "must be from 0.1 to 1");
  }
}

const CONTROL_CHECKS: Readonly<
  Record<string, (problems: Problems, control: Json, path: string) => void>
> = {
  segmented: checkSegmented,
  switch: checkSwitch,
  date: checkDate,
  datetime: checkDateTime,
  opacity: checkOpacity,
  range: checkRange,
};

function checkControl(
  problems: Problems,
  control: unknown,
  path: string,
  controls: readonly Json[],
): void {
  if (!problems.object(control, path)) {
    return;
  }
  if (!isText(control.id) || !ID.test(control.id)) {
    problems.add(`${path}.id`, "must be lowercase letters, digits and hyphens");
  }
  problems.text(control.label, `${path}.label`);
  const check = Object.hasOwn(CONTROL_CHECKS, control.kind as string)
    ? CONTROL_CHECKS[control.kind as string]
    : undefined;
  if (check) {
    check(problems, control, path);
  } else {
    problems.add(
      `${path}.kind`,
      "must be segmented, switch, date, datetime, opacity or range",
    );
  }
  if (control.enabledWhen !== undefined) {
    checkCondition(
      problems,
      control.enabledWhen,
      `${path}.enabledWhen`,
      controls,
    );
  }
}

function checkCondition(
  problems: Problems,
  condition: unknown,
  path: string,
  controls: readonly Json[],
): void {
  if (!problems.object(condition, path)) {
    return;
  }
  const target = controls.find((control) => control.id === condition.control);
  const values = target ? controlValues(target) : null;
  if (
    !values ||
    !Array.isArray(condition.in) ||
    !condition.in.every((value) => values.includes(value as string))
  ) {
    problems.add(
      path,
      "must name a segmented or switch control and values it has",
    );
  }
}

/** Every combination of the given value lists, joined with `|`. */
function combinations(lists: readonly (readonly string[])[]): string[] {
  return lists.reduce<string[]>(
    (keys, values) =>
      keys.flatMap((key) =>
        values.map((value) => (key === "" ? value : `${key}|${value}`)),
      ),
    [""],
  );
}

function checkVariables(
  problems: Problems,
  variables: unknown,
  controls: readonly Json[],
): void {
  if (variables === undefined || !problems.list(variables, "variables", true)) {
    return;
  }
  variables.forEach((variable, index) => {
    const path = `variables[${index}]`;
    if (!problems.object(variable, path)) {
      return;
    }
    if (
      !isText(variable.id) ||
      !ID.test(variable.id) ||
      controls.some((control) => control.id === variable.id)
    ) {
      problems.add(
        `${path}.id`,
        "must be a new lowercase name, not a control id",
      );
    }
    const from = list(variable.from).map((id) =>
      controls.find((control) => control.id === id),
    );
    const lists = from.map((control) =>
      control ? controlValues(control) : null,
    );
    if (from.length === 0 || lists.some((values) => values === null)) {
      problems.add(`${path}.from`, "must name segmented or switch controls");
      return;
    }
    const table = isObject(variable.table) ? variable.table : {};
    for (const key of combinations(lists as string[][])) {
      if (!isText(table[key])) {
        problems.add(`${path}.table`, `no value for ${key}`);
      }
    }
  });
}

/** Whether a card names a field, so the words carry what the colour does. */
function cardNames(card: unknown, field: string): boolean {
  if (!isObject(card)) {
    return false;
  }
  return [card.title, ...list(card.lines)].some(
    (template) =>
      typeof template === "string" &&
      parseTemplate(template).some((placeholder) => placeholder.name === field),
  );
}

/** Checks size stops and returns the field they read, if any. */
function checkSize(
  problems: Problems,
  size: unknown,
  fields: readonly string[],
): unknown {
  if (size === undefined || !problems.object(size, "style.size")) {
    return undefined;
  }
  if (!fields.includes(size.field as string)) {
    problems.add("style.size.field", "is not a field");
  }
  const stops = list(size.stops) as readonly (readonly unknown[])[];
  const isStop = (stop: readonly unknown[], index: number) =>
    Array.isArray(stop) &&
    typeof stop[0] === "number" &&
    typeof stop[1] === "number" &&
    stop[1] > 0 &&
    stop[1] <= MAX_RADIUS &&
    (index === 0 || (stops[index - 1]?.[0] as number) < stop[0]);
  if (stops.length === 0 || !stops.every(isStop)) {
    problems.add(
      "style.size.stops",
      `must be ascending [value, radius] pairs, radius 1 to ${MAX_RADIUS}`,
    );
  }
  const labels = list(size.labels);
  if (labels.length !== stops.length || !labels.every(isText)) {
    problems.add("style.size.labels", "must label every stop");
  }
  return size.field;
}

/** What a colour rule needs to know about the rest of the style and card. */
interface ColourContext {
  readonly fields: readonly string[];
  readonly sizeField: unknown;
  readonly card: unknown;
}

/** Whether a size or words already carry what a colour rule on `field` shows. */
function hasRedundantCue(context: ColourContext, field: unknown): boolean {
  return (
    context.sizeField === field || cardNames(context.card, field as string)
  );
}

function checkSteps(
  problems: Problems,
  colour: Json,
  context: ColourContext,
): void {
  checkStyleField(problems, colour.field, context.fields);
  if (!problems.list(colour.steps, "style.colour.steps")) {
    return;
  }
  const steps = colour.steps.map((step) => (isObject(step) ? step : {}));
  steps.forEach((step, index) => {
    const path = `style.colour.steps[${index}]`;
    checkColourSlot(problems, step.colour, `${path}.colour`, "ordinal");
    problems.text(step.label, `${path}.label`);
  });
  const ascending = steps.every(
    (step, index) =>
      typeof step.min === "number" &&
      (index === 0 || (steps[index - 1]?.min as number) < step.min),
  );
  if (!ascending) {
    problems.add("style.colour.steps", "minimums must be ascending numbers");
  }
  if (!hasRedundantCue(context, colour.field)) {
    problems.add(
      "style.colour",
      "colour must not be the only signal: add size stops on the same field, or name the field on the card",
    );
  }
}

function checkCategories(
  problems: Problems,
  colour: Json,
  context: ColourContext,
): void {
  checkStyleField(problems, colour.field, context.fields);
  if (!problems.list(colour.categories, "style.colour.categories")) {
    return;
  }
  const categories = colour.categories.map((category) =>
    isObject(category) ? category : {},
  );
  categories.forEach((category, index) => {
    const path = `style.colour.categories[${index}]`;
    checkColourSlot(problems, category.colour, `${path}.colour`, "categorical");
    problems.text(category.label, `${path}.label`);
    if (
      category.shape !== undefined &&
      !SHAPES.includes(category.shape as string)
    ) {
      problems.add(`${path}.shape`, SHAPE_TEXT);
    }
  });
  for (const key of ["value", "colour"]) {
    problems.unique(
      categories.map((category) => category[key]),
      (index) => `style.colour.categories[${index}].${key}`,
    );
  }
  const other = isObject(colour.other) ? colour.other : {};
  if (!isCategoricalSlot(other.colour) || !isText(other.label)) {
    problems.add(
      "style.colour.other",
      "must have a label and a categorical colour",
    );
  }
  const shapes = categories.map((category) => category.shape);
  const distinctShapes =
    shapes.every((shape) => shape !== undefined) &&
    new Set(shapes).size === shapes.length;
  if (!distinctShapes && !hasRedundantCue(context, colour.field)) {
    problems.add(
      "style.colour",
      "colour must not be the only signal: give each category its own shape, or name the field on the card",
    );
  }
}

function checkStyle(
  problems: Problems,
  definition: Json,
  fields: readonly string[],
  options: ValidationOptions,
): void {
  const style = definition.style;
  if (!problems.object(style, "style")) {
    return;
  }
  if (style.kind === "shapes") {
    checkShapeStyle(problems, style, fields, options);
    return;
  }
  if (style.shape !== undefined && !SHAPES.includes(style.shape as string)) {
    problems.add("style.shape", SHAPE_TEXT);
  }
  const context: ColourContext = {
    fields,
    sizeField: checkSize(problems, style.size, fields),
    card: definition.card,
  };
  const colour = style.colour;
  if (!problems.object(colour, "style.colour")) {
    return;
  }
  if (colour.kind === "fixed") {
    checkColourSlot(problems, colour.colour, "style.colour.colour");
    problems.text(colour.label, "style.colour.label");
  } else if (colour.kind === "steps") {
    checkSteps(problems, colour, context);
  } else if (colour.kind === "category") {
    checkCategories(problems, colour, context);
  } else {
    problems.add("style.colour.kind", "must be fixed, steps or category");
  }
}

function checkStyleField(
  problems: Problems,
  field: unknown,
  fields: readonly string[],
): void {
  if (!fields.includes(field as string)) {
    problems.add("style.colour.field", "is not a field");
  }
}

function checkSort(
  problems: Problems,
  sort: Json,
  path: string,
  fields: readonly string[],
): void {
  if (!isText(sort.id) || !ID.test(sort.id)) {
    problems.add(`${path}.id`, "must be lowercase letters, digits and hyphens");
  }
  problems.text(sort.label, `${path}.label`);
  if (!fields.includes(sort.field as string)) {
    problems.add(`${path}.field`, "is not a field");
  }
  if (sort.direction !== "asc" && sort.direction !== "desc") {
    problems.add(`${path}.direction`, "must be asc or desc");
  }
}

function checkList(
  problems: Problems,
  spec: unknown,
  fields: readonly string[],
  options: ValidationOptions,
): void {
  if (!problems.object(spec, "list")) {
    return;
  }
  checkTemplate(problems, spec.secondary, "list.secondary", fields, options);
  if (!problems.list(spec.sorts, "list.sorts")) {
    return;
  }
  const sorts = spec.sorts.map((sort) => (isObject(sort) ? sort : {}));
  sorts.forEach((sort, index) => {
    checkSort(problems, sort, `list.sorts[${index}]`, fields);
  });
  problems.unique(
    sorts.map((sort) => sort.id),
    (index) => `list.sorts[${index}].id`,
  );
}

function checkDetail(
  problems: Problems,
  detail: unknown,
  fields: readonly string[],
  options: ValidationOptions,
): void {
  if (detail === undefined || !problems.object(detail, "detail")) {
    return;
  }
  if (!fields.includes(detail.urlField as string)) {
    problems.add("detail.urlField", "is not a field");
  }
  if (problems.list(detail.origins, "detail.origins")) {
    detail.origins.forEach((origin, index) => {
      if (!isHttpsOrigin(origin)) {
        problems.add(
          `detail.origins[${index}]`,
          "must be an https origin with no path",
        );
      }
    });
  }
  checkDecoder(problems, detail.decoder, "detail.decoder", options);
  checkColourSlot(problems, detail.colour, "detail.colour");
  problems.text(detail.label, "detail.label");
  problems.text(detail.dataCost, "detail.dataCost");
}

/** Checks a feed or query source, and returns the decoded field names. */
function checkFeedSource(
  problems: Problems,
  source: Json,
  known: readonly string[],
  options: ValidationOptions,
): string[] {
  if (source.kind === "query") {
    checkQuerySource(problems, source, known);
  } else {
    checkUrl(problems, source.url, "source.url", known);
  }
  checkDecoder(problems, source.decoder, "source.decoder", options);
  const fields = checkFields(problems, source.fields, "source.fields");
  const { cacheSeconds } = source;
  if (
    cacheSeconds !== undefined &&
    (source.kind === "query" ||
      typeof cacheSeconds !== "number" ||
      cacheSeconds < 0 ||
      cacheSeconds > 3600)
  ) {
    problems.add(
      "source.cacheSeconds",
      source.kind === "query"
        ? "is for feeds: a query changes with the view"
        : "must be from 0 to 3600 seconds",
    );
  }
  const filter = source.filter;
  if (
    filter !== undefined &&
    (!isObject(filter) ||
      !fields.includes(filter.field as string) ||
      list(filter.in).length === 0)
  ) {
    problems.add("source.filter", "must name a field and at least one value");
  }
  return fields;
}

function checkFeed(
  problems: Problems,
  definition: Json,
  source: Json,
  known: readonly string[],
  options: ValidationOptions,
): void {
  const fields = checkFeedSource(problems, source, known, options);
  checkStyle(problems, definition, fields, options);
  checkCard(problems, definition.card, "card", fields, options);
  checkList(problems, definition.list, fields, options);
  problems.text(definition.emptyText, "emptyText");
  checkDetail(problems, definition.detail, fields, options);
}

/** Bounds are `[west, south, east, north]` in degrees, a box with area inside the world. */
function checkBounds(problems: Problems, bounds: unknown): void {
  const inRange = (value: unknown, limit: number): value is number =>
    typeof value === "number" && Math.abs(value) <= limit;
  const [west, south, east, north] = Array.isArray(bounds) ? bounds : [];
  const valid =
    Array.isArray(bounds) &&
    bounds.length === 4 &&
    inRange(west, 180) &&
    inRange(east, 180) &&
    inRange(south, 90) &&
    inRange(north, 90) &&
    west < east &&
    south < north;
  if (!valid) {
    problems.add(
      "source.bounds",
      "must be [west, south, east, north] in degrees, with west below east and south below north",
    );
  }
}

function checkTiles(
  problems: Problems,
  definition: Json,
  source: Json,
  known: readonly string[],
): void {
  checkUrl(problems, source.tiles, "source.tiles", known, { engine: true });
  if (source.tileSize !== 256 && source.tileSize !== 512) {
    problems.add("source.tileSize", "must be 256 or 512");
  }
  const { maxzoom } = source;
  if (
    typeof maxzoom !== "number" ||
    !Number.isInteger(maxzoom) ||
    maxzoom < 0 ||
    maxzoom > 24
  ) {
    problems.add("source.maxzoom", "must be a whole number from 0 to 24");
  }
  if (source.bounds !== undefined) {
    checkBounds(problems, source.bounds);
  }
  if (
    definition.legend !== undefined &&
    problems.list(definition.legend, "legend", true)
  ) {
    definition.legend.forEach((entry, index) => {
      const item = isObject(entry) ? entry : {};
      problems.text(item.label, `legend[${index}].label`);
      checkColourSlot(problems, item.colour, `legend[${index}].colour`);
    });
  }
}

/**
 * Checks an untrusted value against the layer definition schema and returns
 * every problem as a `path: message` line, or an empty list. Hand-written
 * rather than a schema library, so core stays dependency-free.
 *
 * Beyond shape, it checks what keeps layers data-driven and safe: every URL
 * is `https` and every template variable has a control, a derived variable
 * or is the engine's own; decoders and formatters are registered; derived
 * tables cover every combination; detail origins are declared; and colour is
 * never the only signal (categories need distinct shapes, sizes on the same
 * field, or the card naming the field).
 */
export function validateLayerDefinition(
  value: unknown,
  options: ValidationOptions,
): string[] {
  const problems = new Problems();
  if (!isObject(value)) {
    problems.add("definition", "must be an object");
    return problems.lines;
  }
  if (!isText(value.id) || !ID.test(value.id)) {
    problems.add(
      "id",
      "must be lowercase letters, digits and hyphens, starting with a letter",
    );
  }
  for (const key of ["name", "description", "group", "dataCost"]) {
    problems.text(value[key], key);
  }
  if (problems.list(value.attribution, "attribution")) {
    value.attribution.forEach((entry, index) => {
      const item = isObject(entry) ? entry : {};
      problems.text(item.text, `attribution[${index}].text`);
      if (item.url !== undefined && !isHttpsUrl(item.url)) {
        problems.add(`attribution[${index}].url`, "must be an https URL");
      }
    });
  }
  if (value.disclaimer !== undefined) {
    problems.text(value.disclaimer, "disclaimer");
  }
  let controls: Json[] = [];
  if (problems.list(value.controls, "controls", true)) {
    controls = value.controls.filter(isObject);
    value.controls.forEach((control, index) => {
      checkControl(problems, control, `controls[${index}]`, controls);
    });
    problems.unique(
      controls.map((control) => control.id),
      (index) => `controls[${index}].id`,
    );
  }
  checkVariables(problems, value.variables, controls);
  const known = [
    ...controls.map((control) => String(control.id)),
    ...list(value.variables).map((variable) =>
      isObject(variable) ? String(variable.id) : "",
    ),
  ];

  const source = value.source;
  if (!problems.object(source, "source")) {
    return problems.lines;
  }
  const isHeatmap = value.heatmap !== undefined;
  const feeds = source.kind === "feed" || source.kind === "query";
  if (isHeatmap) {
    if (feeds) {
      const fields = checkFeedSource(problems, source, known, options);
      checkHeatmapLayer(problems, value, fields, controls);
    } else {
      problems.add("source.kind", "a heatmap needs a feed or query source");
    }
  } else if (feeds) {
    checkFeed(problems, value, source, known, options);
  } else if (source.kind === "tiles") {
    checkTiles(problems, value, source, known);
  } else if (source.kind === "vector-tiles") {
    checkVectorTiles(problems, value, source, known, controls, options);
  } else {
    problems.add("source.kind", "must be feed, query, tiles or vector-tiles");
  }
  checkIdentify(problems, value, source, known, options);
  return problems.lines;
}

/**
 * Validates a set of definitions, including that their ids are unique, and
 * returns it unchanged. A host calls this once when it builds its catalogue.
 *
 * @throws An error listing every problem, each prefixed with its layer id.
 */
export function assertValidDefinitions<T extends readonly LayerDefinition[]>(
  definitions: T,
  options: ValidationOptions,
): T {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const definition of definitions) {
    for (const problem of validateLayerDefinition(definition, options)) {
      lines.push(`${definition.id}: ${problem}`);
    }
    if (seen.has(definition.id)) {
      lines.push(`${definition.id}: id: duplicate`);
    }
    seen.add(definition.id);
  }
  if (lines.length > 0) {
    throw new Error(`Invalid layer definitions:\n${lines.join("\n")}`);
  }
  return definitions;
}
