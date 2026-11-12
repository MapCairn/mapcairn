// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
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

/**
 * Formats a travel time with short units, for example "18 min", "1 h 5 min"
 * or "2 d 3 h". The time is rounded to the minute, and a day or more drops the
 * minutes. Under half a minute, and for a time that is negative or not finite,
 * it reads "Under 1 min".
 */
export function formatDuration(seconds: number): string {
  const parts = splitDuration(seconds);
  if (parts === null) {
    return "Under 1 min";
  }
  const { days, hours, minutes } = parts;
  const text: string[] = [];
  if (days > 0) {
    text.push(`${days} d`);
    if (hours > 0) {
      text.push(`${hours} h`);
    }
    return text.join(" ");
  }
  if (hours > 0) {
    text.push(`${hours} h`);
  }
  if (minutes > 0) {
    text.push(`${minutes} min`);
  }
  return text.join(" ");
}

function unit(value: number, name: string): string {
  return `${value} ${name}${value === 1 ? "" : "s"}`;
}

/**
 * Describes a travel time in words for a screen reader, for example "18
 * minutes", "1 hour 5 minutes" or "2 days". Rounds as {@link formatDuration}
 * does, and says "under a minute" where that reads "Under 1 min".
 */
export function describeDuration(seconds: number): string {
  const parts = splitDuration(seconds);
  if (parts === null) {
    return "under a minute";
  }
  const { days, hours, minutes } = parts;
  const text: string[] = [];
  if (days > 0) {
    text.push(unit(days, "day"));
    if (hours > 0) {
      text.push(unit(hours, "hour"));
    }
    return text.join(" ");
  }
  if (hours > 0) {
    text.push(unit(hours, "hour"));
  }
  if (minutes > 0) {
    text.push(unit(minutes, "minute"));
  }
  return text.join(" ");
}
