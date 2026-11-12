import type { ControlValues } from "../ports/layers";
import {
  defaultSlot,
  describeDay,
  describeSlotStart,
  isSlotValue,
  resolveSlot,
  slotInstant,
} from "./dateTime";
import type {
  DateBound,
  DateControlDefinition,
  LayerControlDefinition,
  LayerDefinition,
} from "./definition";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_OPACITY = 0.1;

/** Whether a string is a real `YYYY-MM-DD` calendar day. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) {
    return false;
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

/** Turns a date bound into `YYYY-MM-DD`, counting relative days back from `now` in UTC. */
export function resolveDateBound(bound: DateBound, now: number): string {
  if (typeof bound === "string") {
    return bound;
  }
  return new Date(now - bound.daysAgo * DAY_MS).toISOString().slice(0, 10);
}

function defaultValue(control: LayerControlDefinition, now: number): string {
  switch (control.kind) {
    case "date":
      return resolveDateBound(control.default, now);
    case "datetime":
      return defaultSlot(control, now);
    default:
      return String(control.default);
  }
}

function resolveDate(
  control: DateControlDefinition,
  value: string,
  now: number,
): string | undefined {
  if (!isIsoDate(value)) {
    return undefined;
  }
  const min = resolveDateBound(control.min, now);
  const max = resolveDateBound(control.max, now);
  if (value < min) {
    return min;
  }
  return value > max ? max : value;
}

/** A value for `control`, or undefined when `value` is not one it accepts. */
function resolveValue(
  control: LayerControlDefinition,
  value: string,
  now: number,
): string | undefined {
  switch (control.kind) {
    case "segmented":
      return control.options.some((option) => option.value === value)
        ? value
        : undefined;
    case "switch":
      return value === "true" || value === "false" ? value : undefined;
    case "date":
      return resolveDate(control, value, now);
    case "datetime":
      return resolveSlot(control, value, now);
    case "range": {
      const number = Number(value);
      return value.trim() !== "" &&
        Number.isFinite(number) &&
        number >= control.min &&
        number <= control.max
        ? value
        : undefined;
    }
    case "opacity": {
      const opacity = Number(value);
      return value.trim() !== "" && opacity >= MIN_OPACITY && opacity <= 1
        ? value
        : undefined;
    }
  }
}

/**
 * The date or time a layer is set to, in words for a status line or an
 * announcement: the first date control's day ("11 November 2026") or the
 * first date and time control's UTC slot ("13:00 UTC on 11 November 2026").
 * Null when the layer has neither, or its value is not a real day or slot.
 */
export function describeChosenTime(
  definition: LayerDefinition,
  values: ControlValues,
): string | null {
  for (const control of definition.controls) {
    const value = values[control.id];
    if (control.kind === "date" && isIsoDate(value)) {
      return describeDay(value);
    }
    if (control.kind === "datetime" && isSlotValue(value)) {
      return describeSlotStart(value);
    }
  }
  return null;
}

/** Every control's default value, as strings, by control id. */
export function defaultControlValues(
  definition: LayerDefinition,
  now: number,
): ControlValues {
  return Object.fromEntries(
    definition.controls.map((control) => [
      control.id,
      defaultValue(control, now),
    ]),
  );
}

/**
 * A full set of control values from partial, untrusted ones (a permalink, a
 * change in the ui): values a control accepts are kept, a date outside its
 * bounds is moved to the nearest bound (a date and time also
 * rounded down to its step), anything else becomes the default,
 * and values for controls the layer lacks are dropped.
 */
export function resolveControlValues(
  definition: LayerDefinition,
  values: Readonly<Record<string, string>> | undefined,
  now: number,
): ControlValues {
  return Object.fromEntries(
    definition.controls.map((control) => {
      const given = values?.[control.id];
      const resolved =
        given === undefined ? undefined : resolveValue(control, given, now);
      return [control.id, resolved ?? defaultValue(control, now)];
    }),
  );
}

/** Whether a control can be used with the other controls' current values. */
export function isControlEnabled(
  control: LayerControlDefinition,
  values: ControlValues,
): boolean {
  const condition = control.enabledWhen;
  if (!condition) {
    return true;
  }
  const value = values[condition.control];
  return value !== undefined && condition.in.includes(value);
}

/**
 * The values a URL template can use, from values already resolved with
 * {@link resolveControlValues}: every control value (a date and time
 * as its ISO instant, the form a provider names it by) plus each derived
 * variable, looked up in its table. A disabled control counts as its default
 * in a lookup, so a hidden choice never changes the request. A combination
 * missing from a table leaves its variable out, which validation prevents.
 */
export function templateValues(
  definition: LayerDefinition,
  values: ControlValues,
): Readonly<Record<string, string>> {
  const effective = Object.fromEntries(
    definition.controls.map((control) => [
      control.id,
      isControlEnabled(control, values)
        ? values[control.id]
        : String(control.default),
    ]),
  );
  const result: Record<string, string> = { ...values };
  for (const control of definition.controls) {
    const value = values[control.id];
    if (control.kind === "datetime" && value !== undefined) {
      result[control.id] = slotInstant(value);
    }
  }
  for (const variable of definition.variables ?? []) {
    const key = variable.from.map((id) => effective[id]).join("|");
    const value = variable.table[key];
    if (value !== undefined) {
      result[variable.id] = value;
    }
  }
  return result;
}
