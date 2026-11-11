import type { DateTimeBound, DateTimeControlDefinition } from "./definition";

/**
 * Pure helpers for the date and time control. A slot is written
 * `YYYY-MM-DDtHHMM` in UTC: link-safe, so it travels in a permalink, and
 * sortable as text. Every time here is UTC; the caller passes `now`.
 */

const MINUTE_MS = 60_000;
/** Minutes in a day: a control's step must divide it. */
export const MINUTES_PER_DAY = 1440;
const SLOT = /^(\d{4}-\d{2}-\d{2})t(\d{2})(\d{2})$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const DAY_TEXT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** The start of a slot already known to be well formed, in milliseconds since the epoch. */
function startOf(value: string): number {
  return Date.parse(
    `${value.slice(0, 10)}T${value.slice(11, 13)}:${value.slice(13, 15)}:00Z`,
  );
}

/** A slot's start in milliseconds since the epoch, or null when it is not a real UTC day and time. */
export function slotTime(value: unknown): number | null {
  if (typeof value !== "string" || !SLOT.test(value)) {
    return null;
  }
  const time = startOf(value);
  return !Number.isNaN(time) && slotValue(time) === value ? time : null;
}

/** Whether a value is a real UTC day and time written `YYYY-MM-DDtHHMM`. */
export function isSlotValue(value: unknown): value is string {
  return slotTime(value) !== null;
}

/** Writes a time as a slot, `YYYY-MM-DDtHHMM` in UTC, dropping seconds. */
export function slotValue(time: number): string {
  const iso = new Date(time).toISOString();
  return `${iso.slice(0, 10)}t${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/** The ISO instant a provider names a slot by, such as `2026-11-11T14:30:00Z`. */
export function slotInstant(value: string): string {
  return `${new Date(startOf(value)).toISOString().slice(0, 19)}Z`;
}

/** Rounds a time down to the start of its slot. */
function floorToStep(time: number, stepMinutes: number): number {
  const step = stepMinutes * MINUTE_MS;
  return Math.floor(time / step) * step;
}

function boundTime(
  bound: DateTimeBound,
  stepMinutes: number,
  now: number,
): number {
  const time =
    typeof bound === "string"
      ? startOf(bound)
      : now - bound.minutesAgo * MINUTE_MS;
  return floorToStep(time, stepMinutes);
}

/** The first and newest slots a control offers at `now`. */
export function dateTimeRange(
  control: DateTimeControlDefinition,
  now: number,
): { readonly min: string; readonly max: string } {
  return {
    min: slotValue(boundTime(control.min, control.stepMinutes, now)),
    max: slotValue(boundTime(control.max, control.stepMinutes, now)),
  };
}

/** The control's default slot at `now`. */
export function defaultSlot(
  control: DateTimeControlDefinition,
  now: number,
): string {
  return slotValue(boundTime(control.default, control.stepMinutes, now));
}

/**
 * A slot the control offers for an untrusted value: rounded down to the step
 * and moved inside the bounds, or undefined when it is not a slot at all.
 */
export function resolveSlot(
  control: DateTimeControlDefinition,
  value: string,
  now: number,
): string | undefined {
  const time = slotTime(value);
  if (time === null) {
    return undefined;
  }
  const min = boundTime(control.min, control.stepMinutes, now);
  const max = boundTime(control.max, control.stepMinutes, now);
  const slot = floorToStep(time, control.stepMinutes);
  return slotValue(Math.min(Math.max(slot, min), max));
}

/** One slot a day offers, with its start time as the label, such as `14:30`. */
export interface DaySlot {
  readonly value: string;
  readonly label: string;
}

function timeLabel(value: string): string {
  return `${value.slice(11, 13)}:${value.slice(13, 15)}`;
}

/**
 * The slots the control offers on one UTC day (`YYYY-MM-DD`), earliest first:
 * the whole day, cut at the first and newest slots, and none outside them.
 */
export function slotsOnDay(
  control: DateTimeControlDefinition,
  day: string,
  now: number,
): readonly DaySlot[] {
  const start = ISO_DAY.test(day) ? slotTime(`${day}t0000`) : null;
  if (start === null) {
    return [];
  }
  const min = boundTime(control.min, control.stepMinutes, now);
  const max = boundTime(control.max, control.stepMinutes, now);
  const slots: DaySlot[] = [];
  const count = MINUTES_PER_DAY / control.stepMinutes;
  for (let index = 0; index < count; index += 1) {
    const time = start + index * control.stepMinutes * MINUTE_MS;
    if (time >= min && time <= max) {
      const value = slotValue(time);
      slots.push({ value, label: timeLabel(value) });
    }
  }
  return slots;
}

/** Words for when a slot starts, with its time zone, such as "14:30 UTC on 11 November 2026". */
export function describeSlotStart(value: string): string {
  return `${timeLabel(value)} UTC on ${DAY_TEXT.format(startOf(value))}`;
}

/** Words for the slot shown, with its time zone, such as "14:30 to 15:00 UTC on 11 November 2026". */
export function describeSlot(value: string, stepMinutes: number): string {
  const end = slotValue(startOf(value) + stepMinutes * MINUTE_MS);
  return `${timeLabel(value)} to ${timeLabel(end)} UTC on ${DAY_TEXT.format(startOf(value))}`;
}
