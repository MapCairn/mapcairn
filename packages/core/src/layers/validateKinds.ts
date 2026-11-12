// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { checkShapeStyle, PROPERTY_NAME } from "./validateShapes";
import {
  checkColourSlot,
  checkUrl,
  isObject,
  type Json,
  list,
  Problems,
  type ValidationOptions,
} from "./validateSupport";

const MAX_ZOOM = 24;
const MAX_QUERY_FEATURES = 5000;
const RADIUS: readonly [number, number] = [4, 80];
const INTENSITY: readonly [number, number] = [0.1, 5];
const MIN_RAMP = 3;
const MAX_RAMP = 5;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Checks a `range` control: ordered bounds, a positive step and a default inside them. */
export function checkRange(
  problems: Problems,
  control: Json,
  path: string,
): void {
  const { min, max, step, default: fallback } = control;
  if (!isNumber(min)) {
    problems.add(`${path}.min`, "must be a number");
  }
  if (!isNumber(max)) {
    problems.add(`${path}.max`, "must be a number");
  }
  if (isNumber(min) && isNumber(max) && min >= max) {
    problems.add(path, "min must be below max");
  }
  if (!isNumber(step) || step <= 0) {
    problems.add(`${path}.step`, "must be a positive number");
  }
  if (
    !isNumber(fallback) ||
    (isNumber(min) && fallback < min) ||
    (isNumber(max) && fallback > max)
  ) {
    problems.add(`${path}.default`, "must be a number between min and max");
  }
  if (control.unit !== undefined && typeof control.unit !== "string") {
    problems.add(`${path}.unit`, "must be text");
  }
}

/** Checks the parts of a query source beyond what it shares with a feed. */
export function checkQuerySource(
  problems: Problems,
  source: Json,
  known: readonly string[],
): void {
  checkUrl(problems, source.url, "source.url", known, { query: true });
  const { maxFeatures, minzoom } = source;
  if (
    !Number.isInteger(maxFeatures) ||
    (maxFeatures as number) < 1 ||
    (maxFeatures as number) > MAX_QUERY_FEATURES
  ) {
    problems.add(
      "source.maxFeatures",
      `must be a whole number from 1 to ${MAX_QUERY_FEATURES}`,
    );
  }
  if (
    minzoom !== undefined &&
    (!isNumber(minzoom) || minzoom < 0 || minzoom > MAX_ZOOM)
  ) {
    problems.add("source.minzoom", `must be from 0 to ${MAX_ZOOM}`);
  }
}

function checkHeatmapValue(
  problems: Problems,
  value: unknown,
  path: string,
  [low, high]: readonly [number, number],
  controls: readonly Json[],
): void {
  if (isObject(value)) {
    const control = controls.find((item) => item.id === value.control);
    const ok =
      control?.kind === "range" &&
      isNumber(control.min) &&
      isNumber(control.max) &&
      control.min >= low &&
      control.max <= high;
    if (!ok) {
      problems.add(
        path,
        `must name a range control that stays between ${low} and ${high}`,
      );
    }
  } else if (!isNumber(value) || value < low || value > high) {
    problems.add(path, `must be a number from ${low} to ${high}`);
  }
}

/**
 * Checks a heatmap spec. `fields` are the decoded fields a feed's weight may
 * read, or `null` for a vector tile layer, whose weight is a tile property.
 */
export function checkHeatmapSpec(
  problems: Problems,
  spec: unknown,
  path: string,
  fields: readonly string[] | null,
  controls: readonly Json[],
): void {
  if (!problems.object(spec, path)) {
    return;
  }
  const { weightField } = spec;
  if (weightField !== undefined) {
    const ok =
      fields === null
        ? typeof weightField === "string" && PROPERTY_NAME.test(weightField)
        : fields.includes(weightField as string);
    if (!ok) {
      problems.add(
        `${path}.weightField`,
        fields === null ? "must be a tile property name" : "is not a field",
      );
    }
  }
  checkHeatmapValue(problems, spec.radius, `${path}.radius`, RADIUS, controls);
  checkHeatmapValue(
    problems,
    spec.intensity,
    `${path}.intensity`,
    INTENSITY,
    controls,
  );
  const ramp = list(spec.ramp);
  if (ramp.length < MIN_RAMP || ramp.length > MAX_RAMP) {
    problems.add(
      `${path}.ramp`,
      `must have ${MIN_RAMP} to ${MAX_RAMP} colours`,
    );
  }
  ramp.forEach((slot, index) => {
    checkColourSlot(problems, slot, `${path}.ramp[${index}]`, "ordinal");
  });
  const words = list(spec.words);
  if (words.length !== ramp.length) {
    problems.add(
      `${path}.words`,
      "must have one word for each step of the ramp",
    );
  } else {
    words.forEach((word, index) => {
      problems.text(word, `${path}.words[${index}]`);
    });
  }
}

function checkWindow(problems: Problems, item: Json, prefix: string): void {
  for (const key of ["minzoom", "maxzoom"]) {
    const value = item[key];
    if (
      value !== undefined &&
      (!isNumber(value) || value < 0 || value > MAX_ZOOM)
    ) {
      problems.add(`${prefix}${key}`, `must be from 0 to ${MAX_ZOOM}`);
    }
  }
  if (
    isNumber(item.minzoom) &&
    isNumber(item.maxzoom) &&
    item.minzoom > item.maxzoom
  ) {
    problems.add(`${prefix}minzoom`, "is above maxzoom");
  }
}

/** Checks a heatmap layer: its feed or query source is checked by the caller. */
export function checkHeatmapLayer(
  problems: Problems,
  definition: Json,
  fields: readonly string[],
  controls: readonly Json[],
): void {
  checkHeatmapSpec(problems, definition.heatmap, "heatmap", fields, controls);
  problems.text(definition.emptyText, "emptyText");
}

/** Checks a vector tile layer: its source, zoom windows and source layers. */
export function checkVectorTiles(
  problems: Problems,
  definition: Json,
  source: Json,
  known: readonly string[],
  controls: readonly Json[],
  options: ValidationOptions,
): void {
  checkUrl(problems, source.tiles, "source.tiles", known, { engine: true });
  const { minzoom, maxzoom } = source;
  if (
    !Number.isInteger(maxzoom) ||
    (maxzoom as number) < 0 ||
    (maxzoom as number) > MAX_ZOOM
  ) {
    problems.add(
      "source.maxzoom",
      `must be a whole number from 0 to ${MAX_ZOOM}`,
    );
  }
  if (
    minzoom !== undefined &&
    (!Number.isInteger(minzoom) ||
      (minzoom as number) < 0 ||
      (isNumber(maxzoom) && (minzoom as number) > maxzoom))
  ) {
    problems.add("source.minzoom", "must be a whole number from 0 to maxzoom");
  }
  checkWindow(problems, definition, "");
  if (!problems.list(definition.sourceLayers, "sourceLayers")) {
    return;
  }
  definition.sourceLayers.forEach((entry, index) => {
    const path = `sourceLayers[${index}]`;
    if (!problems.object(entry, path)) {
      return;
    }
    problems.text(entry.sourceLayer, `${path}.sourceLayer`);
    checkWindow(problems, entry, `${path}.`);
    const hasStyle = entry.style !== undefined;
    const hasHeatmap = entry.heatmap !== undefined;
    if (hasStyle === hasHeatmap) {
      problems.add(path, "must have either a style or a heatmap");
      return;
    }
    const inner = new Problems();
    if (hasStyle && isObject(entry.style)) {
      checkShapeStyle(inner, entry.style, null, options);
    } else if (hasStyle) {
      inner.add("style", "must be an object");
    } else {
      checkHeatmapSpec(inner, entry.heatmap, "heatmap", null, controls);
    }
    for (const line of inner.lines) {
      problems.lines.push(`${path}.${line}`);
    }
  });
}
