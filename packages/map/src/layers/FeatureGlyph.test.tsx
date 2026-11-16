// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeMessageCatalogue,
  type LegendEntry,
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_LINE_LAYER,
} from "@mapcairn/core";
import { tokenValues } from "@mapcairn/theme";
import { render as renderBare } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { FeatureGlyph, featureClass, LegendGlyph } from "./FeatureGlyph";

const catalogue = new FakeMessageCatalogue();

function withServices({ children }: { children: ReactNode }) {
  return (
    <ServicesProvider services={createFakeServices()}>
      {children}
    </ServicesProvider>
  );
}

function render(ui: ReactElement) {
  return renderBare(ui, { wrapper: withServices });
}

describe("featureClass", () => {
  it("gives the words for a point's colour", () => {
    expect(featureClass(SAMPLE_ALERT_LAYER, { level: "Red" }, catalogue)).toBe(
      "Red alert",
    );
  });

  it("gives the words for a polygon's or line's class", () => {
    expect(featureClass(SAMPLE_AREA_LAYER, { density: 150 }, catalogue)).toBe(
      "100 to 200 per km²",
    );
    expect(featureClass(SAMPLE_LINE_LAYER, { kind: "side" }, catalogue)).toBe(
      "Side route",
    );
  });
});

describe("FeatureGlyph", () => {
  it("draws a point as its marker", () => {
    const { container } = render(
      <FeatureGlyph
        definition={SAMPLE_ALERT_LAYER}
        fields={{ level: "Red" }}
      />,
    );
    expect(container.querySelector("svg g[fill]")).not.toBeNull();
    expect(container.querySelector("[data-part='fill']")).toBeNull();
  });

  it("draws an area with its fill and pattern, and a line with its stroke", () => {
    const area = render(
      <FeatureGlyph definition={SAMPLE_AREA_LAYER} fields={{ density: 250 }} />,
    ).container;
    expect(area.querySelector("svg")).toHaveAttribute(
      "data-pattern",
      "crosshatch",
    );
    const line = render(
      <FeatureGlyph definition={SAMPLE_LINE_LAYER} fields={{ kind: "side" }} />,
    ).container;
    expect(line.querySelector("[data-part='line']")).toHaveAttribute(
      "stroke",
      tokenValues.dataPalette.blue,
    );
    expect(line.querySelector("[data-part='line']")).toHaveAttribute(
      "stroke-dasharray",
      "4 3",
    );
  });
});

describe("LegendGlyph", () => {
  const base: LegendEntry = {
    label: "Entry",
    colour: "blue",
    shape: "diamond",
    radius: 6,
  };

  it("draws a marker entry as a marker, and area or line entries as swatches", () => {
    expect(
      render(<LegendGlyph entry={base} />).container.querySelector("svg g"),
    ).not.toBeNull();
    const area = render(
      <LegendGlyph entry={{ ...base, swatch: "area", pattern: "dots" }} />,
    ).container;
    expect(area.querySelector("svg")).toHaveAttribute("data-pattern", "dots");
    const line = render(
      <LegendGlyph entry={{ ...base, swatch: "line", width: 4 }} />,
    ).container;
    expect(line.querySelector("[data-part='line']")).toHaveAttribute(
      "stroke-width",
      "4",
    );
  });
});
