// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import { samePlainData, sameServices } from "./equality";

describe("samePlainData", () => {
  it("is true for the same data built twice, however deep", () => {
    expect(
      samePlainData(
        [{ id: "a", style: { colour: ["x", 1] }, on: null }],
        [{ id: "a", style: { colour: ["x", 1] }, on: null }],
      ),
    ).toBe(true);
  });

  it("is false when a value, a length, a key or a type differs", () => {
    expect(samePlainData([{ id: "a" }], [{ id: "b" }])).toBe(false);
    expect(samePlainData([1], [1, 2])).toBe(false);
    expect(samePlainData({ a: 1 }, { b: 1 })).toBe(false);
    expect(samePlainData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(samePlainData([], {})).toBe(false);
    expect(samePlainData(undefined, [])).toBe(false);
  });

  it("compares a function, a class instance and a date by identity", () => {
    const load = async () => [];
    expect(samePlainData(load, load)).toBe(true);
    expect(samePlainData(load, async () => [])).toBe(false);
    expect(samePlainData(new Date(0), new Date(0))).toBe(false);
  });
});

describe("sameServices", () => {
  const search = { search: async () => [], reverse: async () => null };

  it("is true for the same providers in a new object, and for both left out", () => {
    expect(sameServices({ search }, { search })).toBe(true);
    expect(sameServices(undefined, undefined)).toBe(true);
  });

  it("is false for another provider, another set of names, or one side left out", () => {
    expect(sameServices({ search }, { search: { ...search } })).toBe(false);
    expect(sameServices({ search }, {})).toBe(false);
    expect(sameServices({}, { search })).toBe(false);
    expect(sameServices({ search }, undefined)).toBe(false);
  });
});
