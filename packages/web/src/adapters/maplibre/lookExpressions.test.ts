import type { MapLookRule, MapShapeLook } from "@karta/core";
import { describe, expect, it } from "vitest";
import { propertyLook, ruleLook } from "./lookExpressions";

const LOOK: MapShapeLook = {
  colour: "#0072b2",
  fillOpacity: 0.5,
  pattern: "solid",
  dash: "solid",
  width: 1,
};

const OTHER: MapShapeLook = {
  colour: "#e69f00",
  fillOpacity: 0.8,
  pattern: "dots",
  dash: "dashed",
  width: 3,
};

describe("propertyLook", () => {
  it("reads each attribute from the feature's own properties", () => {
    expect(propertyLook()).toEqual({
      colour: ["get", "colour"],
      fillOpacity: ["get", "fillOpacity"],
      width: ["get", "width"],
      pattern: ["get", "pattern"],
      dash: ["get", "dash"],
    });
  });
});

describe("ruleLook", () => {
  it("turns a fixed rule into literals and says which pattern and dash are fixed", () => {
    expect(ruleLook({ kind: "fixed", look: OTHER })).toEqual({
      colour: "#e69f00",
      fillOpacity: 0.8,
      width: 3,
      pattern: "dots",
      dash: "dashed",
      fixedPattern: "dots",
      fixedDash: "dashed",
    });
  });

  it("matches string categories, one output per case and the fallback last", () => {
    const rule: MapLookRule = {
      kind: "category",
      field: "kind",
      cases: [
        { value: "park", look: LOOK },
        { value: "water", look: OTHER },
      ],
      fallback: { ...LOOK, width: 9 },
    };
    const look = ruleLook(rule);
    expect(look?.width).toEqual([
      "match",
      ["get", "kind"],
      "park",
      1,
      "water",
      3,
      9,
    ]);
    expect(look?.fixedDash).toBeUndefined();
  });

  it("matches whole-number categories", () => {
    const look = ruleLook({
      kind: "category",
      field: "level",
      cases: [
        { value: 1, look: LOOK },
        { value: 2, look: OTHER },
      ],
      fallback: LOOK,
    });
    expect(look?.dash).toEqual([
      "match",
      ["get", "level"],
      1,
      "solid",
      2,
      "dashed",
      "solid",
    ]);
  });

  it("falls back to a case expression when the engine could not match the values", () => {
    const look = ruleLook({
      kind: "category",
      field: "level",
      cases: [
        { value: 1.5, look: OTHER },
        { value: "high", look: LOOK },
      ],
      fallback: LOOK,
    });
    expect(look?.width).toEqual([
      "case",
      ["==", ["get", "level"], 1.5],
      3,
      ["==", ["get", "level"], "high"],
      1,
      1,
    ]);
  });

  it("keeps the first of a repeated category value", () => {
    const look = ruleLook({
      kind: "category",
      field: "kind",
      cases: [
        { value: "park", look: LOOK },
        { value: "park", look: OTHER },
      ],
      fallback: OTHER,
    });
    expect(look?.width).toEqual(["match", ["get", "kind"], "park", 1, 3]);
  });

  it("uses the fallback alone when there are no cases", () => {
    const look = ruleLook({
      kind: "category",
      field: "kind",
      cases: [],
      fallback: OTHER,
    });
    expect(look?.colour).toBe("#e69f00");
  });

  it("steps over the number, the first look below the second minimum and for a missing value", () => {
    const look = ruleLook({
      kind: "steps",
      field: "density",
      steps: [
        { min: 10, look: LOOK },
        { min: 50, look: OTHER },
        { min: 100, look: { ...OTHER, width: 6 } },
      ],
    });
    expect(look?.width).toEqual([
      "step",
      ["to-number", ["get", "density"], 10],
      1,
      50,
      3,
      100,
      6,
    ]);
    expect(look?.colour).toEqual([
      "step",
      ["to-number", ["get", "density"], 10],
      "#0072b2",
      50,
      "#e69f00",
      100,
      "#e69f00",
    ]);
  });

  it("drops steps that do not rise, which the engine would reject", () => {
    const look = ruleLook({
      kind: "steps",
      field: "density",
      steps: [
        { min: 0, look: LOOK },
        { min: 5, look: OTHER },
        { min: 5, look: LOOK },
        { min: 2, look: LOOK },
      ],
    });
    expect(look?.width).toEqual([
      "step",
      ["to-number", ["get", "density"], 0],
      1,
      5,
      3,
    ]);
  });

  it("has no look for a step rule without steps", () => {
    expect(ruleLook({ kind: "steps", field: "density", steps: [] })).toBe(
      undefined,
    );
  });
});
