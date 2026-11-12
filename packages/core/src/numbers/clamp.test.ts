// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { clamp } from "./clamp";

describe("clamp", () => {
  it("keeps a value inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("raises a value below the range to its minimum", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it("lowers a value above the range to its maximum", () => {
    expect(clamp(12, 0, 10)).toBe(10);
  });

  it("keeps the ends themselves", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
