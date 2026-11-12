// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { ShapeStyle } from "./definition";
import {
  DEFAULT_AREA_WIDTH,
  DEFAULT_FILL_OPACITY,
  DEFAULT_LINE_WIDTH,
  evaluateShapeStyle,
  shapeClasses,
} from "./shapeStyle";

const categories: ShapeStyle = {
  kind: "shapes",
  geometry: "area",
  colour: {
    kind: "category",
    field: "type",
    categories: [
      { value: "park", label: "Park", colour: "bluish-green", pattern: "dots" },
      {
        value: "water",
        label: "Water",
        colour: "sky-blue",
        pattern: "stripes",
        dash: "dashed",
        width: 3,
      },
    ],
    other: { label: "Other", colour: "orange" },
  },
};

const steps: ShapeStyle = {
  kind: "shapes",
  geometry: "area",
  fillOpacity: 0.7,
  width: 2,
  colour: {
    kind: "steps",
    field: "density",
    steps: [
      { min: 0, label: "Under 10", colour: "ordinal-1" },
      { min: 10, label: "10 to 99", colour: "ordinal-3", pattern: "dots" },
      { min: 100, label: "100 and above", colour: "ordinal-5" },
    ],
  },
};

const intervals: ShapeStyle = {
  kind: "shapes",
  geometry: "area",
  colour: {
    kind: "intervals",
    field: "density",
    min: 0,
    max: 300,
    ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
    unit: " per km²",
    patterns: ["solid", "dots", "crosshatch"],
  },
};

const lines: ShapeStyle = {
  kind: "shapes",
  geometry: "line",
  dash: "dotted",
  colour: {
    kind: "fixed",
    colour: "vermillion",
    label: "Route",
    width: 4,
  },
};

describe("evaluateShapeStyle", () => {
  it("picks a category's colour, pattern, dash, width and words", () => {
    expect(evaluateShapeStyle(categories, { type: "water" })).toEqual({
      colour: "sky-blue",
      label: "Water",
      pattern: "stripes",
      dash: "dashed",
      width: 3,
      fillOpacity: DEFAULT_FILL_OPACITY,
    });
  });

  it("gives a category the style's defaults for what it leaves out", () => {
    expect(evaluateShapeStyle(categories, { type: "park" })).toEqual({
      colour: "bluish-green",
      label: "Park",
      pattern: "dots",
      dash: "solid",
      width: DEFAULT_AREA_WIDTH,
      fillOpacity: DEFAULT_FILL_OPACITY,
    });
  });

  it("uses the other class for a value no category names, or no value", () => {
    expect(evaluateShapeStyle(categories, { type: "road" })).toMatchObject({
      colour: "orange",
      label: "Other",
      pattern: "solid",
    });
    expect(evaluateShapeStyle(categories, { type: null })).toMatchObject({
      label: "Other",
    });
  });

  it("picks the step at or below the value, and the first below every minimum", () => {
    expect(evaluateShapeStyle(steps, { density: 10 })).toMatchObject({
      colour: "ordinal-3",
      label: "10 to 99",
      pattern: "dots",
      width: 2,
      fillOpacity: 0.7,
    });
    expect(evaluateShapeStyle(steps, { density: 5000 }).label).toBe(
      "100 and above",
    );
    expect(evaluateShapeStyle(steps, { density: -4 }).label).toBe("Under 10");
    expect(evaluateShapeStyle(steps, { density: null }).label).toBe("Under 10");
    expect(evaluateShapeStyle(steps, { density: "12" }).label).toBe("10 to 99");
  });

  it("divides an interval style into equal classes", () => {
    expect(evaluateShapeStyle(intervals, { density: 0 }).label).toBe(
      "Up to 100 per km²",
    );
    expect(evaluateShapeStyle(intervals, { density: 99.9 }).label).toBe(
      "Up to 100 per km²",
    );
    expect(evaluateShapeStyle(intervals, { density: 100 })).toMatchObject({
      colour: "ordinal-3",
      label: "100 to 200 per km²",
      pattern: "dots",
    });
    expect(evaluateShapeStyle(intervals, { density: 250 })).toMatchObject({
      colour: "ordinal-5",
      label: "200 per km² and above",
      pattern: "crosshatch",
    });
  });

  it("puts values outside an interval style's range in its first and last class", () => {
    expect(evaluateShapeStyle(intervals, { density: -50 }).colour).toBe(
      "ordinal-1",
    );
    expect(evaluateShapeStyle(intervals, { density: 9999 }).colour).toBe(
      "ordinal-5",
    );
  });

  it("reads a fixed style, with a line's own default width", () => {
    expect(evaluateShapeStyle(lines, {})).toEqual({
      colour: "vermillion",
      label: "Route",
      pattern: "solid",
      dash: "dotted",
      width: 4,
      fillOpacity: DEFAULT_FILL_OPACITY,
    });
    expect(
      evaluateShapeStyle(
        { ...lines, colour: { kind: "fixed", colour: "blue", label: "L" } },
        {},
      ).width,
    ).toBe(DEFAULT_LINE_WIDTH);
  });
});

describe("shapeClasses", () => {
  it("lists categories in order, then the other class", () => {
    expect(shapeClasses(categories).map((item) => item.label)).toEqual([
      "Park",
      "Water",
      "Other",
    ]);
  });

  it("lists steps in order", () => {
    expect(shapeClasses(steps).map((item) => item.colour)).toEqual([
      "ordinal-1",
      "ordinal-3",
      "ordinal-5",
    ]);
  });

  it("lists interval classes with their words, in order", () => {
    expect(shapeClasses(intervals)).toEqual([
      {
        colour: "ordinal-1",
        label: "Up to 100 per km²",
        pattern: "solid",
        dash: "solid",
        width: DEFAULT_AREA_WIDTH,
        fillOpacity: DEFAULT_FILL_OPACITY,
      },
      {
        colour: "ordinal-3",
        label: "100 to 200 per km²",
        pattern: "dots",
        dash: "solid",
        width: DEFAULT_AREA_WIDTH,
        fillOpacity: DEFAULT_FILL_OPACITY,
      },
      {
        colour: "ordinal-5",
        label: "200 per km² and above",
        pattern: "crosshatch",
        dash: "solid",
        width: DEFAULT_AREA_WIDTH,
        fillOpacity: DEFAULT_FILL_OPACITY,
      },
    ]);
  });

  it("applies interval dashes and widths per class", () => {
    const styled: ShapeStyle = {
      ...intervals,
      colour: {
        kind: "intervals",
        field: "density",
        min: 0,
        max: 20,
        ramp: ["ordinal-1", "ordinal-5"],
        dashes: ["solid", "dashed"],
        widths: [1, 5],
      },
    };
    expect(
      shapeClasses(styled).map(({ dash, width }) => ({ dash, width })),
    ).toEqual([
      { dash: "solid", width: 1 },
      { dash: "dashed", width: 5 },
    ]);
  });

  it("lists a fixed style as one class", () => {
    expect(shapeClasses(lines)).toHaveLength(1);
  });

  it("rounds interval bounds for the legend without noise", () => {
    const thirds: ShapeStyle = {
      ...intervals,
      colour: {
        kind: "intervals",
        field: "v",
        min: 0,
        max: 1,
        ramp: ["ordinal-1", "ordinal-3", "ordinal-5"],
      },
    };
    expect(shapeClasses(thirds).map((item) => item.label)).toEqual([
      "Up to 0.33",
      "0.33 to 0.67",
      "0.67 and above",
    ]);
  });
});
