import { formatNumber } from "../format/format";
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

/** Spoken names, as [singular, plural], for announcements and accessible labels. */
export const DISTANCE_UNIT_NAME: Readonly<
  Record<DistanceUnit, readonly [string, string]>
> = {
  m: ["metre", "metres"],
  km: ["kilometre", "kilometres"],
  ft: ["foot", "feet"],
  mi: ["mile", "miles"],
};

const AREA_UNIT_SYMBOL: Readonly<Record<AreaUnit, string>> = {
  m2: "m²",
  ha: "ha",
  km2: "km²",
  ft2: "ft²",
  ac: "ac",
  mi2: "mi²",
};

const AREA_UNIT_NAME: Readonly<Record<AreaUnit, readonly [string, string]>> = {
  m2: ["square metre", "square metres"],
  ha: ["hectare", "hectares"],
  km2: ["square kilometre", "square kilometres"],
  ft2: ["square foot", "square feet"],
  ac: ["acre", "acres"],
  mi2: ["square mile", "square miles"],
};

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
 * "328 ft" or "1.25 mi". Numbers use `en-GB` grouping.
 */
export function formatDistance(metres: number, units: UnitSystem): string {
  const { value, unit } = readDistance(metres, units);
  return `${formatNumber(value)} ${DISTANCE_UNIT_SYMBOL[unit]}`;
}

/**
 * Formats an area with a short unit, for example "850 m²", "1.25 ha",
 * "2.5 km²", "1,076 ft²", "1 ac" or "1.93 mi²".
 */
export function formatArea(squareMetres: number, units: UnitSystem): string {
  const { value, unit } = readArea(squareMetres, units);
  return `${formatNumber(value)} ${AREA_UNIT_SYMBOL[unit]}`;
}

/** Picks the singular name for exactly one and the plural otherwise. */
export function pluralise(
  value: number,
  names: readonly [string, string],
): string {
  return value === 1 ? names[0] : names[1];
}

/**
 * Describes a distance in words for a screen reader, for example
 * "1.25 kilometres" or "1 mile".
 */
export function describeDistance(metres: number, units: UnitSystem): string {
  const { value, unit } = readDistance(metres, units);
  return `${formatNumber(value)} ${pluralise(value, DISTANCE_UNIT_NAME[unit])}`;
}

/**
 * Describes an area in words for a screen reader, for example
 * "1.25 hectares" or "1 square mile".
 */
export function describeArea(squareMetres: number, units: UnitSystem): string {
  const { value, unit } = readArea(squareMetres, units);
  return `${formatNumber(value)} ${pluralise(value, AREA_UNIT_NAME[unit])}`;
}
