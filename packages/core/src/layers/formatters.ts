// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatNumber } from "../format/format";
import type { FieldValue } from "../ports/layers";
import type { MessageCatalogue, MessageKey } from "../ports/messages";
import { createNamedRegistry, type NamedRegistry } from "./registry";

/**
 * What a formatter may know besides the value: the time now, for relative
 * times, and the catalogue whose language its words and numbers are written in.
 */
export interface FormatContext {
  /** Epoch milliseconds. Core never reads the clock itself. */
  readonly now: number;
  /** The active catalogue: its `language` formats numbers and dates, and its keys word a relative time. */
  readonly catalogue: MessageCatalogue;
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

/** The latest instant, either side of 1970, that a JavaScript date can hold. */
const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

const ISO_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Reads a time as epoch milliseconds: a number is taken as milliseconds, and
 * an ISO string is parsed, reading one with a time but no zone as UTC (GDACS
 * writes its dates that way). Returns null for anything else, including a
 * number past the range a date can hold, which no formatter could show.
 */
export function parseTime(value: FieldValue): number | null {
  if (typeof value === "number") {
    return Math.abs(value) <= MAX_DATE_MILLISECONDS ? value : null;
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

const MAX_FRACTION_DIGITS = 1;

/** The spans a relative time is counted in, largest first, each with the keys for "ago" and "in". */
const SPANS: readonly (readonly [number, MessageKey, MessageKey])[] = [
  [86_400_000, "layers.formatter.agoDay", "layers.formatter.inDay"],
  [3_600_000, "layers.formatter.agoHour", "layers.formatter.inHour"],
  [60_000, "layers.formatter.agoMinute", "layers.formatter.inMinute"],
];

function relative(
  value: FieldValue,
  { now, catalogue }: FormatContext,
): string | null {
  const time = parseTime(value);
  if (time === null) {
    return null;
  }
  const difference = now - time;
  const distance = Math.abs(difference);
  for (const [size, ago, within] of SPANS) {
    if (distance >= size) {
      return catalogue.plural(difference >= 0 ? ago : within, {
        count: Math.floor(distance / size),
      });
    }
  }
  return catalogue.t("layers.formatter.justNow", {});
}

function date(value: FieldValue, { catalogue }: FormatContext): string | null {
  const time = parseTime(value);
  if (time === null) {
    return null;
  }
  const { language } = catalogue;
  const day = new Intl.DateTimeFormat(language, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(time);
  const clock = new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(time);
  return catalogue.t("format.utcTime", {
    time: catalogue.t("common.commaJoined", { first: day, second: clock }),
  });
}

function formatFigure(value: number, { catalogue }: FormatContext): string {
  return formatNumber(value, catalogue.language, {
    maximumFractionDigits: MAX_FRACTION_DIGITS,
  });
}

/**
 * The formatters every registry has: `relative` ("3 hours ago"), `number`
 * (grouped, at most one decimal), `km` ("10 km") and `date`
 * ("8 Nov 2026, 14:05 UTC").
 */
export const BUILT_IN_FORMATTERS: Readonly<Record<string, Formatter>> = {
  relative,
  number: (value, context) => {
    const number = toNumber(value);
    return number === null ? null : formatFigure(number, context);
  },
  km: (value, context) => {
    const number = toNumber(value);
    return number === null ? null : `${formatFigure(number, context)} km`;
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
