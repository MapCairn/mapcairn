// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatNumber } from "../format/format";
import { message } from "../messages/formatMessage";
import type { Message, MessageKey } from "../ports/messages";
import type { UnitSystem } from "../ports/settings";
import {
  metresToFeet,
  metresToKilometres,
  metresToMiles,
  squareMetresToAcres,
  squareMetresToHectares,
  squareMetresToSquareFeet,
  squareMetresToSquareKilometres,
  squareMetresToSquareMiles,
} from "./conversions";

/** The units a distance can be shown in. */
export type DistanceUnit = "m" | "km" | "ft" | "mi";

/** The units an area can be shown in. */
export type AreaUnit = "m2" | "ha" | "km2" | "ft2" | "ac" | "mi2";

/** A rounded measurement and the unit it is in. */
export interface MeasurementReading<Unit extends string> {
  readonly value: number;
  readonly unit: Unit;
}

/** Short labels shown in the interface. */
export const DISTANCE_UNIT_SYMBOL: Readonly<Record<DistanceUnit, string>> = {
  m: "m",
  km: "km",
  ft: "ft",
  mi: "mi",
};

/** The message key that names a distance unit in words, with the count it takes. */
const DISTANCE_UNIT_KEY = {
  m: "units.metre",
  km: "units.kilometre",
  ft: "units.foot",
  mi: "units.mile",
} as const satisfies Readonly<Record<DistanceUnit, MessageKey>>;

const AREA_UNIT_SYMBOL: Readonly<Record<AreaUnit, string>> = {
  m2: "m²",
  ha: "ha",
  km2: "km²",
  ft2: "ft²",
  ac: "ac",
  mi2: "mi²",
};

const AREA_UNIT_KEY = {
  m2: "units.squareMetre",
  ha: "units.hectare",
  km2: "units.squareKilometre",
  ft2: "units.squareFoot",
  ac: "units.acre",
  mi2: "units.squareMile",
} as const satisfies Readonly<Record<AreaUnit, MessageKey>>;

const FEET_PER_TENTH_OF_A_MILE = 528;
const SQUARE_FEET_PER_TENTH_OF_AN_ACRE = 4356;
const ACRES_PER_SQUARE_MILE = 640;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Two decimals under 10, one under 100, none above, so figures stay short. */
function roundForDisplay(value: number): number {
  if (value < 10) {
    return roundTo(value, 2);
  }
  if (value < 100) {
    return roundTo(value, 1);
  }
  return Math.round(value);
}

/**
 * Picks the unit and rounds a distance for display. Metric uses metres under
 * 1 km and kilometres above; imperial uses feet under 0.1 mi and miles above.
 * The unit is chosen from the rounded figure, so 999.6 m reads "1 km", not
 * "1,000 m".
 */
export function readDistance(
  metres: number,
  units: UnitSystem,
): MeasurementReading<DistanceUnit> {
  if (units === "metric") {
    const wholeMetres = Math.round(metres);
    return wholeMetres < 1000
      ? { value: wholeMetres, unit: "m" }
      : { value: roundForDisplay(metresToKilometres(metres)), unit: "km" };
  }
  const wholeFeet = Math.round(metresToFeet(metres));
  return wholeFeet < FEET_PER_TENTH_OF_A_MILE
    ? { value: wholeFeet, unit: "ft" }
    : { value: roundForDisplay(metresToMiles(metres)), unit: "mi" };
}

/**
 * Picks the unit and rounds an area for display. Metric uses m² under 1 ha,
 * hectares under 1 km² and km² above; imperial uses ft² under 0.1 ac, acres
 * under 1 mi² and mi² above.
 */
export function readArea(
  squareMetres: number,
  units: UnitSystem,
): MeasurementReading<AreaUnit> {
  if (units === "metric") {
    const wholeSquareMetres = Math.round(squareMetres);
    if (wholeSquareMetres < 10_000) {
      return { value: wholeSquareMetres, unit: "m2" };
    }
    if (squareMetres < 1_000_000) {
      return {
        value: roundForDisplay(squareMetresToHectares(squareMetres)),
        unit: "ha",
      };
    }
    return {
      value: roundForDisplay(squareMetresToSquareKilometres(squareMetres)),
      unit: "km2",
    };
  }
  const wholeSquareFeet = Math.round(squareMetresToSquareFeet(squareMetres));
  if (wholeSquareFeet < SQUARE_FEET_PER_TENTH_OF_AN_ACRE) {
    return { value: wholeSquareFeet, unit: "ft2" };
  }
  const acres = squareMetresToAcres(squareMetres);
  if (acres < ACRES_PER_SQUARE_MILE) {
    return { value: roundForDisplay(acres), unit: "ac" };
  }
  return {
    value: roundForDisplay(squareMetresToSquareMiles(squareMetres)),
    unit: "mi2",
  };
}

/**
 * Formats a distance with a short unit, for example "850 m", "1.25 km",
 * "328 ft" or "1.25 mi". The number is grouped and its digits chosen for `locale` (`formatLocale(catalogue)`); the unit
 * symbols are the same in every language.
 */
export function formatDistance(
  metres: number,
  units: UnitSystem,
  locale: string,
): string {
  const { value, unit } = readDistance(metres, units);
  return `${formatNumber(value, locale)} ${DISTANCE_UNIT_SYMBOL[unit]}`;
}

/**
 * Formats an area with a short unit, for example "850 m²", "1.25 ha",
 * "2.5 km²", "1,076 ft²", "1 ac" or "1.93 mi²". The number is grouped and its
 * digits chosen for `locale` (`formatLocale(catalogue)`).
 */
export function formatArea(
  squareMetres: number,
  units: UnitSystem,
  locale: string,
): string {
  const { value, unit } = readArea(squareMetres, units);
  return `${formatNumber(value, locale)} ${AREA_UNIT_SYMBOL[unit]}`;
}

/** A distance in a given unit as words, "1.25 kilometres": the unit's plural key with the count. */
export function describeDistanceReading(
  value: number,
  unit: DistanceUnit,
): Message<(typeof DISTANCE_UNIT_KEY)[DistanceUnit]> {
  return message(DISTANCE_UNIT_KEY[unit], { count: value });
}

/**
 * Describes a distance in words for a screen reader, for example
 * "1.25 kilometres" or "1 mile", as a message to format with the active
 * catalogue.
 */
export function describeDistance(
  metres: number,
  units: UnitSystem,
): Message<(typeof DISTANCE_UNIT_KEY)[DistanceUnit]> {
  const { value, unit } = readDistance(metres, units);
  return describeDistanceReading(value, unit);
}

/**
 * Describes an area in words for a screen reader, for example
 * "1.25 hectares" or "1 square mile", as a message to format with the active
 * catalogue.
 */
export function describeArea(
  squareMetres: number,
  units: UnitSystem,
): Message<(typeof AREA_UNIT_KEY)[AreaUnit]> {
  const { value, unit } = readArea(squareMetres, units);
  return message(AREA_UNIT_KEY[unit], { count: value });
}
