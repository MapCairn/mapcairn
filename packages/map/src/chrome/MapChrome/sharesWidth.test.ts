// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { sharesWidth } from "./sharesWidth";

describe("sharesWidth", () => {
  const toolbar = { left: 100, width: 200 };

  it("is true for spans that overlap, either way round", () => {
    expect(sharesWidth(toolbar, { left: 250, width: 100 }, 12)).toBe(true);
    expect(sharesWidth({ left: 250, width: 100 }, toolbar, 12)).toBe(true);
    expect(sharesWidth(toolbar, { left: 150, width: 20 }, 12)).toBe(true);
  });

  it("is false for spans further apart than the gap", () => {
    expect(sharesWidth(toolbar, { left: 400, width: 40 }, 12)).toBe(false);
    expect(sharesWidth({ left: 0, width: 40 }, toolbar, 12)).toBe(false);
  });

  it("counts spans closer than the gap as sharing, and spans exactly a gap apart as clear", () => {
    expect(sharesWidth(toolbar, { left: 311, width: 40 }, 12)).toBe(true);
    expect(sharesWidth(toolbar, { left: 312, width: 40 }, 12)).toBe(false);
    expect(sharesWidth({ left: 49, width: 40 }, toolbar, 12)).toBe(true);
    expect(sharesWidth({ left: 48, width: 40 }, toolbar, 12)).toBe(false);
  });
});
