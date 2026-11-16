// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { joinMessages, message } from "../messages/formatMessage";
import type { Message } from "../ports/messages";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

/** A travel time split into whole days, hours and minutes, rounded to the minute. */
interface DurationParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

function splitDuration(seconds: number): DurationParts | null {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const total = Math.round(seconds / 60);
  if (total < 1) {
    return null;
  }
  return {
    days: Math.floor(total / MINUTES_PER_DAY),
    hours: Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: total % MINUTES_PER_HOUR,
  };
}

/** A unit of a travel time written short, for example "18 min": the message to format. */
function shortUnit(key: ShortUnitKey, count: number): Message {
  return message(key, { count });
}

type ShortUnitKey =
  | "duration.short.day"
  | "duration.short.hour"
  | "duration.short.minute";

/**
 * Formats a travel time with short units, for example "18 min", "1 h 5 min"
 * or "2 d 3 h", as a message to format with the active catalogue. The time is
 * rounded to the minute, and a day or more drops the minutes. Under half a
 * minute, and for a time that is negative or not finite, it reads "Under 1
 * min".
 */
export function formatDuration(seconds: number): Message {
  const parts = splitDuration(seconds);
  if (parts === null) {
    return message("duration.short.underMinute", {});
  }
  const { days, hours, minutes } = parts;
  const units: Message[] = [];
  if (days > 0) {
    units.push(shortUnit("duration.short.day", days));
    if (hours > 0) {
      units.push(shortUnit("duration.short.hour", hours));
    }
  } else {
    if (hours > 0) {
      units.push(shortUnit("duration.short.hour", hours));
    }
    if (minutes > 0) {
      units.push(shortUnit("duration.short.minute", minutes));
    }
  }
  return joinMessages(units) as Message;
}

/** The biggest unit of a time: days, else hours, else minutes. */
function leadingUnit({ days, hours, minutes }: DurationParts): Message {
  if (days > 0) {
    return message("duration.day", { count: days });
  }
  if (hours > 0) {
    return message("duration.hour", { count: hours });
  }
  return message("duration.minute", { count: minutes });
}

/** The unit after the biggest, kept only when it is not zero: a day drops the minutes. */
function trailingUnit({ days, hours, minutes }: DurationParts): Message | null {
  if (days > 0) {
    return hours > 0 ? message("duration.hour", { count: hours }) : null;
  }
  if (hours > 0 && minutes > 0) {
    return message("duration.minute", { count: minutes });
  }
  return null;
}

/**
 * Describes a travel time in words for a screen reader, for example "18
 * minutes", "1 hour 5 minutes" or "2 days", as a message to format with the
 * active catalogue. Rounds as {@link formatDuration} does, and says "under a
 * minute" where that reads "Under 1 min".
 */
export function describeDuration(seconds: number): Message {
  const parts = splitDuration(seconds);
  if (parts === null) {
    return message("duration.underMinute", {});
  }
  const lead = leadingUnit(parts);
  const trail = trailingUnit(parts);
  return trail === null
    ? lead
    : message("common.followedBy", { first: lead, second: trail });
}
