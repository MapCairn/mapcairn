import { describe, expect, it } from "vitest";
import {
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_LINE_LAYER,
  SAMPLE_TILE_LAYER,
  SAMPLE_VECTOR_LAYER,
} from "../fakes/layerFixtures";
import type { PointStyle } from "./definition";
import { DEFAULT_MARKER_RADIUS, evaluatePointStyle, legendFor } from "./style";

describe("evaluatePointStyle", () => {
  const steps = SAMPLE_FEED_LAYER.style;

  it("picks the step and size stop at or below the value", () => {
    expect(evaluatePointStyle(steps, { value: 4 })).toEqual({
      colour: "ordinal-3",
      radius: 7,
      shape: "circle",
      label: "3 to 5",
    });
    expect(evaluatePointStyle(steps, { value: 6.1 }).colour).toBe("ordinal-5");
  });

  it("uses the first step and stop below every minimum, or with no value", () => {
    expect(evaluatePointStyle(steps, { value: -1 })).toMatchObject({
      colour: "ordinal-1",
      radius: 4,
    });
    expect(evaluatePointStyle(steps, { value: null })).toMatchObject({
      colour: "ordinal-1",
      radius: 4,
    });
  });

  it("reads numbers written as text", () => {
    expect(evaluatePointStyle(steps, { value: "5.5" }).colour).toBe(
      "ordinal-5",
    );
  });

  it("picks a category's colour, shape and label", () => {
    expect(
      evaluatePointStyle(SAMPLE_ALERT_LAYER.style, { level: "Orange" }),
    ).toEqual({
      colour: "orange",
      radius: DEFAULT_MARKER_RADIUS,
      shape: "square",
      label: "Orange alert",
    });
  });

  it("uses the other colour, and the style's shape, for an unnamed category", () => {
    expect(
      evaluatePointStyle(SAMPLE_ALERT_LAYER.style, { level: "Purple" }),
    ).toEqual({
      colour: "sky-blue",
      radius: DEFAULT_MARKER_RADIUS,
      shape: "circle",
      label: "Other",
    });
  });

  it("draws a fixed colour with the style's shape", () => {
    const style: PointStyle = {
      colour: { kind: "fixed", colour: "blue", label: "Event" },
      shape: "diamond",
    };
    expect(evaluatePointStyle(style, {})).toEqual({
      colour: "blue",
      radius: DEFAULT_MARKER_RADIUS,
      shape: "diamond",
      label: "Event",
    });
  });
});

describe("legendFor", () => {
  it("lists steps with words and the size each stop draws", () => {
    expect(legendFor(SAMPLE_FEED_LAYER)).toEqual({
      entries: [
        { label: "Below 3", colour: "ordinal-1", shape: "circle", radius: 4 },
        { label: "3 to 5", colour: "ordinal-3", shape: "circle", radius: 7 },
        {
          label: "5 and above",
          colour: "ordinal-5",
          shape: "circle",
          radius: 11,
        },
      ],
    });
  });

  it("lists categories with their shapes, and the other entry last", () => {
    expect(legendFor(SAMPLE_ALERT_LAYER).entries).toEqual([
      {
        label: "Green alert",
        colour: "bluish-green",
        shape: "circle",
        radius: 6,
      },
      { label: "Orange alert", colour: "orange", shape: "square", radius: 6 },
      {
        label: "Red alert",
        colour: "vermillion",
        shape: "triangle",
        radius: 6,
      },
      { label: "Other", colour: "sky-blue", shape: "circle", radius: 6 },
    ]);
  });

  it("lists a fixed colour as one entry", () => {
    expect(
      legendFor({
        ...SAMPLE_ALERT_LAYER,
        style: { colour: { kind: "fixed", colour: "blue", label: "Event" } },
      }).entries,
    ).toEqual([{ label: "Event", colour: "blue", shape: "circle", radius: 6 }]);
  });

  it("lists an area style's classes with their words, patterns and widths", () => {
    expect(legendFor(SAMPLE_AREA_LAYER).entries).toEqual([
      {
        label: "Up to 100 per km²",
        colour: "ordinal-1",
        shape: "square",
        radius: 6,
        swatch: "area",
        pattern: "solid",
        dash: "solid",
        width: 1.5,
      },
      {
        label: "100 to 200 per km²",
        colour: "ordinal-3",
        shape: "square",
        radius: 6,
        swatch: "area",
        pattern: "dots",
        dash: "solid",
        width: 1.5,
      },
      {
        label: "200 per km² and above",
        colour: "ordinal-5",
        shape: "square",
        radius: 6,
        swatch: "area",
        pattern: "crosshatch",
        dash: "solid",
        width: 1.5,
      },
    ]);
  });

  it("lists a line style's classes as line swatches with their dashes", () => {
    const entries = legendFor(SAMPLE_LINE_LAYER).entries;
    expect(entries.map((entry) => entry.swatch)).toEqual([
      "line",
      "line",
      "line",
    ]);
    expect(
      entries.map((entry) => [entry.label, entry.width, entry.dash]),
    ).toEqual([
      ["Main route", 5, "solid"],
      ["Side route", 3, "dashed"],
      ["Other route", 2.5, "dotted"],
    ]);
  });

  it("names each step of a heatmap's ramp with its density word", () => {
    expect(legendFor(SAMPLE_HEATMAP_LAYER).entries).toEqual([
      {
        label: "Sparse",
        colour: "ordinal-1",
        shape: "square",
        radius: 6,
        swatch: "density",
      },
      {
        label: "Moderate",
        colour: "ordinal-3",
        shape: "square",
        radius: 6,
        swatch: "density",
      },
      {
        label: "Dense",
        colour: "ordinal-5",
        shape: "square",
        radius: 6,
        swatch: "density",
      },
    ]);
  });

  it("lists every source layer of a vector tile layer in order: areas, roads, then density", () => {
    const labels = legendFor(SAMPLE_VECTOR_LAYER).entries.map(
      (entry) => entry.label,
    );
    expect(labels).toEqual([
      "Park",
      "Water",
      "Other area",
      "Minor road",
      "Major road",
      "Few events",
      "Some events",
      "Many events",
    ]);
    const swatches = legendFor(SAMPLE_VECTOR_LAYER).entries.map(
      (entry) => entry.swatch,
    );
    expect(swatches).toEqual([
      "area",
      "area",
      "area",
      "line",
      "line",
      "density",
      "density",
      "density",
    ]);
  });

  it("uses the tile layer's own legend, or none", () => {
    expect(legendFor(SAMPLE_TILE_LAYER).entries).toEqual([]);
    expect(
      legendFor({
        ...SAMPLE_TILE_LAYER,
        legend: [{ label: "Hazard", colour: "blue" }],
      }).entries,
    ).toEqual([
      { label: "Hazard", colour: "blue", shape: "square", radius: 6 },
    ]);
  });
});
