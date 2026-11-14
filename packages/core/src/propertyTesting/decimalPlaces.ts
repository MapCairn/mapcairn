// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * How many places after the decimal point a number needs, counted from the
 * digits `String` gives, with an exponent such as `7.8e-7` taken into account
 * (it needs eight places). Counting the text of a number would miscount those.
 */
export function decimalPlaces(value: number): number {
  const [mantissa = "", exponent = "0"] = String(value).split("e");
  const fraction = mantissa.split(".")[1] ?? "";
  return Math.max(0, fraction.length - Number(exponent));
}

/** The numbers of a geometry's coordinates, in order. */
export function coordinateNumbers(geometry: unknown): number[] {
  const { coordinates } = geometry as { coordinates?: unknown[] };
  return (coordinates ?? []).flat(Number.POSITIVE_INFINITY) as number[];
}

/** The most places any number in a geometry's coordinates needs. */
export function decimalsOf(geometry: unknown): number {
  return Math.max(...coordinateNumbers(geometry).map(decimalPlaces));
}
