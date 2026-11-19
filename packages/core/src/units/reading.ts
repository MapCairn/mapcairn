// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue, MessageKey } from "../ports/messages";
import type { AreaUnit, DistanceUnit } from "./measurement";

/** The message key that holds the short symbol of a distance unit. */
export const DISTANCE_SYMBOL_KEY = {
  m: "units.symbol.metre",
  km: "units.symbol.kilometre",
  ft: "units.symbol.foot",
  mi: "units.symbol.mile",
} as const satisfies Readonly<Record<DistanceUnit, MessageKey>>;

/** The message key that holds the short symbol of an area unit. */
export const AREA_SYMBOL_KEY = {
  m2: "units.symbol.squareMetre",
  ha: "units.symbol.hectare",
  km2: "units.symbol.squareKilometre",
  ft2: "units.symbol.squareFoot",
  ac: "units.symbol.acre",
  mi2: "units.symbol.squareMile",
} as const satisfies Readonly<Record<AreaUnit, MessageKey>>;

/**
 * A figure and a unit symbol written as `catalogue` writes a reading: the
 * `units.reading` pattern around the figure (grouped, with the digits of the
 * catalogue's language) and the symbol under `symbolKey`.
 */
export function writeReading(
  catalogue: MessageCatalogue,
  value: number,
  symbolKey: MessageKey,
): string {
  return catalogue.t("units.reading", {
    number: value,
    symbol: catalogue.t(symbolKey, {}),
  });
}

/**
 * A distance figure in a known unit, written with the short symbol as
 * {@link formatDistance} does. For a caller that has already chosen the unit,
 * such as the scale bar.
 */
export function writeDistanceReading(
  catalogue: MessageCatalogue,
  value: number,
  unit: DistanceUnit,
): string {
  return writeReading(catalogue, value, DISTANCE_SYMBOL_KEY[unit]);
}
