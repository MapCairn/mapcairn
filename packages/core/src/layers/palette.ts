// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
/**
 * The names of the data palette's colours. Definitions name a colour by slot
 * and never write a value; `@mapcairn/theme` holds the values
 * (`dataPalette` in `tokenValues.ts`).
 *
 * Categorical slots are the Okabe-Ito colours. Black is left out because it
 * vanishes on a dark basemap. Ordinal slots are an ordered ramp, light to
 * dark, for values with a natural order such as magnitude. Colour is never
 * the only signal: validation requires a shape, a size or words beside it.
 */
export const CATEGORICAL_SLOTS = [
  "orange",
  "sky-blue",
  "bluish-green",
  "yellow",
  "blue",
  "vermillion",
  "reddish-purple",
] as const;

/** The ordered ramp, lowest first. */
export const ORDINAL_SLOTS = [
  "ordinal-1",
  "ordinal-2",
  "ordinal-3",
  "ordinal-4",
  "ordinal-5",
] as const;

/** One categorical colour. */
export type CategoricalSlot = (typeof CATEGORICAL_SLOTS)[number];

/** One step of the ordered ramp. */
export type OrdinalSlot = (typeof ORDINAL_SLOTS)[number];

/** Every colour a definition may name. */
export const PALETTE_SLOTS: readonly (CategoricalSlot | OrdinalSlot)[] = [
  ...CATEGORICAL_SLOTS,
  ...ORDINAL_SLOTS,
];

/** Whether a value names a categorical colour. */
export function isCategoricalSlot(value: unknown): value is CategoricalSlot {
  return (CATEGORICAL_SLOTS as readonly unknown[]).includes(value);
}

/** Whether a value names a step of the ordered ramp. */
export function isOrdinalSlot(value: unknown): value is OrdinalSlot {
  return (ORDINAL_SLOTS as readonly unknown[]).includes(value);
}

/** Whether a value names any palette colour. */
export function isPaletteSlot(
  value: unknown,
): value is CategoricalSlot | OrdinalSlot {
  return isCategoricalSlot(value) || isOrdinalSlot(value);
}
