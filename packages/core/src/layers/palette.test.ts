// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  CATEGORICAL_SLOTS,
  isCategoricalSlot,
  isOrdinalSlot,
  isPaletteSlot,
  ORDINAL_SLOTS,
  PALETTE_SLOTS,
} from "./palette";

describe("palette slots", () => {
  it("names the Okabe-Ito categorical colours, without black", () => {
    expect(CATEGORICAL_SLOTS).toEqual([
      "orange",
      "sky-blue",
      "bluish-green",
      "yellow",
      "blue",
      "vermillion",
      "reddish-purple",
    ]);
  });

  it("names five ordered steps", () => {
    expect(ORDINAL_SLOTS).toEqual([
      "ordinal-1",
      "ordinal-2",
      "ordinal-3",
      "ordinal-4",
      "ordinal-5",
    ]);
  });

  it("lists every slot once", () => {
    expect(PALETTE_SLOTS).toEqual([...CATEGORICAL_SLOTS, ...ORDINAL_SLOTS]);
    expect(new Set(PALETTE_SLOTS).size).toBe(PALETTE_SLOTS.length);
  });

  it("recognises slots by kind", () => {
    expect(isPaletteSlot("orange")).toBe(true);
    expect(isPaletteSlot("pink")).toBe(false);
    expect(isPaletteSlot(3)).toBe(false);
    expect(isCategoricalSlot("blue")).toBe(true);
    expect(isCategoricalSlot("ordinal-1")).toBe(false);
    expect(isOrdinalSlot("ordinal-1")).toBe(true);
    expect(isOrdinalSlot("blue")).toBe(false);
  });
});
