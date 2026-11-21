// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/** A release as the changelog names it. */
export interface ReleaseFacts {
  /** The version, such as `0.1.0` or `0.2.0-rc.1`. */
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

/** The highest day number of any month. */
const LAST_DAY = 31;

/**
 * A `YYYY-MM-DD` date as British English writes it ("21 November 2026"),
 * from its digits alone, so the time zone of the build cannot move the day.
 */
export function formatReleaseDate(date: string): string {
  const [, year, month, day] = date.match(ISO_DATE) ?? [];
  const name = MONTHS[Number(month) - 1];
  const dayNumber = Number(day);
  if (
    year === undefined ||
    name === undefined ||
    dayNumber < 1 ||
    dayNumber > LAST_DAY
  ) {
    throw new Error(`"${date}" is not a date written YYYY-MM-DD.`);
  }
  return `${dayNumber} ${name} ${year}`;
}
