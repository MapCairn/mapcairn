import type { FieldValue } from "../ports/layers";
import { createNamedRegistry, type NamedRegistry } from "./registry";

/** What a formatter may know besides the value: the time now, for relative times. */
export interface FormatContext {
  /** Epoch milliseconds. Core never reads the clock itself. */
  readonly now: number;
}

/**
 * Turns one decoded field into text for a card or list, or returns null when
 * it cannot read the value, so the template leaves it out.
 */
export type Formatter = (
  value: FieldValue,
  context: FormatContext,
) => string | null;

/** Formatters by name, as card and list templates use them (`{time|relative}`). */
export type FormatterRegistry = NamedRegistry<Formatter>;

const ISO_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Reads a time as epoch milliseconds: a number is taken as milliseconds, and
 * an ISO string is parsed, reading one with a time but no zone as UTC (GDACS
 * writes its dates that way). Returns null for anything else.
 */
export function parseTime(value: FieldValue): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = ISO_WITHOUT_ZONE.test(value) ? `${value}Z` : value;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : time;
}

function toNumber(value: FieldValue): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const SPANS: readonly [number, string][] = [
  [86_400_000, "day"],
  [3_600_000, "hour"],
  [60_000, "minute"],
];

function relative(value: FieldValue, { now }: FormatContext): string | null {
  const time = parseTime(value);
  if (time === null) {
    return null;
  }
  const difference = now - time;
  const distance = Math.abs(difference);
  for (const [size, unit] of SPANS) {
    if (distance >= size) {
      const count = Math.floor(distance / size);
      const span = `${count} ${unit}${count === 1 ? "" : "s"}`;
      return difference >= 0 ? `${span} ago` : `in ${span}`;
    }
  }
  return "just now";
}

function date(value: FieldValue): string | null {
  const time = parseTime(value);
  if (time === null) {
    return null;
  }
  const parts = Object.fromEntries(
    DATE.formatToParts(time).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} UTC`;
}

/**
 * The formatters every registry has: `relative` ("3 hours ago"), `number`
 * (grouped, at most one decimal), `km` ("10 km") and `date`
 * ("8 Nov 2026, 14:05 UTC").
 */
export const BUILT_IN_FORMATTERS: Readonly<Record<string, Formatter>> = {
  relative,
  number: (value) => {
    const number = toNumber(value);
    return number === null ? null : NUMBER.format(number);
  },
  km: (value) => {
    const number = toNumber(value);
    return number === null ? null : `${NUMBER.format(number)} km`;
  },
  date,
};

/** A registry of the built-in formatters plus any `extra` ones, by name. */
export function createFormatterRegistry(
  extra: Readonly<Record<string, Formatter>> = {},
): FormatterRegistry {
  return createNamedRegistry(
    Object.entries({ ...BUILT_IN_FORMATTERS, ...extra }),
  );
}
