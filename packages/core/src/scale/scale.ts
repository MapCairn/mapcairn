// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { formatNumber } from "../format/format";
import type { UnitSystem } from "../ports/settings";
import {
  feetToMetres,
  kilometresToMetres,
  metresToFeet,
  metresToKilometres,
  metresToMiles,
  milesToMetres,
} from "../units/conversions";
import {
  DISTANCE_UNIT_NAME,
  DISTANCE_UNIT_SYMBOL,
  type DistanceUnit,
  pluralise,
} from "../units/measurement";

/** What the scale bar needs to know. */
export interface ScaleBarInput {
  /** Ground resolution at the map centre, in metres per pixel. */
  readonly metresPerPixel: number;
  /** The widest the bar may be, in CSS pixels. */
  readonly maxWidthPx: number;
  readonly units: UnitSystem;
}

/** A scale bar ready to draw and to read aloud. */
export interface ScaleBar {
  /** Bar width in CSS pixels. Never more than `maxWidthPx`. */
  readonly widthPx: number;
  /** The distance the bar stands for, in `unit`. */
  readonly value: number;
  readonly unit: DistanceUnit;
  /** Short visible text, for example "200 m". */
  readonly label: string;
  /** Spoken text, for example "Scale: 200 metres". */
  readonly accessibleLabel: string;
}

const NICE_MANTISSAS = [5, 2, 1] as const;

/** The largest 1, 2 or 5 times a power of ten that is no more than `max`. */
function niceStep(max: number): number {
  // The exponent only repeats if Math.log10 rounds up across a power of ten.
  for (let exponent = Math.floor(Math.log10(max)); ; exponent -= 1) {
    for (const mantissa of NICE_MANTISSAS) {
      const step = mantissa * 10 ** exponent;
      if (step <= max) {
        return step;
      }
    }
  }
}

function toMetres(value: number, unit: DistanceUnit): number {
  switch (unit) {
    case "km":
      return kilometresToMetres(value);
    case "ft":
      return feetToMetres(value);
    case "mi":
      return milesToMetres(value);
    default:
      return value;
  }
}

function buildScaleBar(
  value: number,
  unit: DistanceUnit,
  widthPx: number,
): ScaleBar {
  const number = formatNumber(value);
  return {
    widthPx,
    value,
    unit,
    label: `${number} ${DISTANCE_UNIT_SYMBOL[unit]}`,
    accessibleLabel: `Scale: ${number} ${pluralise(value, DISTANCE_UNIT_NAME[unit])}`,
  };
}

/**
 * Chooses a round-number scale bar that fits in `maxWidthPx`.
 *
 * Steps are 1, 2 or 5 times a power of ten. Metric switches from metres to
 * kilometres at 1,000 m and imperial from feet to miles at one mile. When the
 * input cannot produce a bar (zero, negative or non-finite resolution or
 * width) it returns a zero-width bar instead of throwing.
 */
export function computeScaleBar(input: ScaleBarInput): ScaleBar {
  const { metresPerPixel, maxWidthPx, units } = input;
  const maxMetres = metresPerPixel * maxWidthPx;
  if (!Number.isFinite(maxMetres) || maxMetres <= 0) {
    return buildScaleBar(0, units === "metric" ? "m" : "ft", 0);
  }

  let unit: DistanceUnit;
  let maxInUnit: number;
  if (units === "metric") {
    const useKilometres = maxMetres >= 1000;
    unit = useKilometres ? "km" : "m";
    maxInUnit = useKilometres ? metresToKilometres(maxMetres) : maxMetres;
  } else {
    const useMiles = maxMetres >= milesToMetres(1);
    unit = useMiles ? "mi" : "ft";
    maxInUnit = useMiles ? metresToMiles(maxMetres) : metresToFeet(maxMetres);
  }

  const value = niceStep(maxInUnit);
  const widthPx = Math.min(maxWidthPx, toMetres(value, unit) / metresPerPixel);
  return buildScaleBar(value, unit, widthPx);
}
