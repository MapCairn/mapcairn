// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A release as the changelog names it. */
export interface ReleaseFacts {
  /** The version, such as `0.1.0`. */
  readonly version: string;
  /** The day it was released, as `YYYY-MM-DD`. */
  readonly date: string;
}

/** The months in British English, January first. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** A calendar date written `YYYY-MM-DD`. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether a year, month (1 to 12) and day name a day the calendar has. */
function isCalendarDay(year: number, month: number, day: number): boolean {
  const moment = new Date(Date.UTC(year, month - 1, day));
  return (
    moment.getUTCFullYear() === year &&
    moment.getUTCMonth() === month - 1 &&
    moment.getUTCDate() === day
  );
}

/**
 * A `YYYY-MM-DD` date as British English writes it ("21 November 2026"),
 * from its digits alone, so the time zone of the build cannot move the day.
 * A day the calendar does not have, such as 31 February, is refused.
 */
export function formatReleaseDate(date: string): string {
  const [, yearText, monthText, dayText] = date.match(ISO_DATE) ?? [];
  const [year, month, day] = [yearText, monthText, dayText].map(Number);
  const name = MONTHS[(month ?? 0) - 1];
  if (
    name === undefined ||
    year === undefined ||
    day === undefined ||
    !isCalendarDay(year, month ?? 0, day)
  ) {
    throw new Error(`"${date}" is not a date written YYYY-MM-DD.`);
  }
  return `${day} ${name} ${year}`;
}
