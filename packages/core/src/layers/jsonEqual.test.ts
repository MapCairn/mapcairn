// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PROPERTY_PARAMETERS } from "../propertyTesting/propertyParameters";
import { jsonEqual, MAX_JSON_DEPTH } from "./jsonEqual";

describe("jsonEqual", () => {
  it("compares primitives by value", () => {
    expect(jsonEqual(1, 1)).toBe(true);
    expect(jsonEqual("a", "a")).toBe(true);
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual(1, 2)).toBe(false);
    expect(jsonEqual(1, "1")).toBe(false);
    expect(jsonEqual(null, undefined)).toBe(false);
  });

  it("compares arrays by length, order and items", () => {
    expect(jsonEqual([1, [2]], [1, [2]])).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual([1], [1, 2])).toBe(false);
  });

  it("compares objects by keys and values, whatever the key order", () => {
    expect(jsonEqual({ a: 1, b: { c: [1] } }, { b: { c: [1] }, a: 1 })).toBe(
      true,
    );
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    expect(jsonEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it("does not take an array for an object", () => {
    expect(jsonEqual([], {})).toBe(false);
    expect(jsonEqual({ 0: 1 }, [1])).toBe(false);
  });

  it("does not take an inherited key for an own one", () => {
    const ownProto = () => JSON.parse('{"__proto__": {}}');
    expect(jsonEqual(ownProto(), { z: 1 })).toBe(false);
    expect(jsonEqual({ z: 1 }, ownProto())).toBe(false);
    expect(jsonEqual(JSON.parse('{"constructor": {}}'), { z: 1 })).toBe(false);
    expect(jsonEqual(ownProto(), ownProto())).toBe(true);
  });

  it("treats a value nested deeper than it will follow as changed, without overflowing the stack", () => {
    const deep = (levels: number) =>
      JSON.parse(`${'{"a":'.repeat(levels)}1${"}".repeat(levels)}`);
    expect(jsonEqual(deep(MAX_JSON_DEPTH - 1), deep(MAX_JSON_DEPTH - 1))).toBe(
      true,
    );
    expect(jsonEqual(deep(MAX_JSON_DEPTH + 1), deep(MAX_JSON_DEPTH + 1))).toBe(
      false,
    );
    expect(jsonEqual(deep(200_000), deep(200_000))).toBe(false);
  });

  it("agrees with a copy of any JSON value, and with itself", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        expect(jsonEqual(value, JSON.parse(JSON.stringify(value)))).toBe(true);
      }),
      PROPERTY_PARAMETERS,
    );
  });
});
