// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeMessageCatalogue,
  SAMPLE_ALERT_LAYER,
  SAMPLE_AREA_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_TILE_LAYER,
  type ShapeStyle,
  type VectorShapeLayer,
} from "@mapcairn/core";
import { render as renderBare, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { LayerKey } from "./LayerKey";

describe("public vector shape types", () => {
  it("accepts ShapeStyle while rejecting keyed vector labels", () => {
    const shapeStyle: ShapeStyle = SAMPLE_AREA_LAYER.style;
    const vectorShapeLayer: VectorShapeLayer = {
      sourceLayer: "water",
      style: shapeStyle,
    };
    const keyedVectorStyle: VectorShapeLayer["style"] = {
      ...shapeStyle,
      label: {
        // @ts-expect-error Vector-tile labels accept only raw property templates.
        template: { key: "vector.name", text: "{name}" },
      },
    };

    expect(vectorShapeLayer.style).toBe(shapeStyle);
    expect(keyedVectorStyle.label).toBeDefined();
  });
});

function withServices(
  { children }: { children: ReactNode },
  messages = new FakeMessageCatalogue(),
) {
  return (
    <ServicesProvider services={createFakeServices({ messages })}>
      {children}
    </ServicesProvider>
  );
}

function render(ui: ReactElement, messages?: FakeMessageCatalogue) {
  return renderBare(ui, {
    wrapper: ({ children }) => withServices({ children }, messages),
  });
}

describe("LayerKey", () => {
  it("is a list named by the caller, with a row of words for each entry", () => {
    render(
      <LayerKey
        definition={SAMPLE_ALERT_LAYER}
        label="Key for Sample alerts"
        testId="key-alerts"
      />,
    );
    const key = screen.getByRole("list", { name: "Key for Sample alerts" });
    expect(key).toBe(screen.getByTestId("key-alerts"));
    const rows = within(key).getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.textContent?.trim()).not.toBe("");
      expect(row.querySelector("svg")).not.toBeNull();
    }
  });

  it("names a heatmap's steps in words", () => {
    render(
      <LayerKey definition={SAMPLE_HEATMAP_LAYER} label="Key" testId="k" />,
    );
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(
      SAMPLE_HEATMAP_LAYER.heatmap.words,
    );
  });

  it("arranges the rows side by side by default and one to a line when stacked", () => {
    const { rerender } = render(
      <LayerKey definition={SAMPLE_ALERT_LAYER} label="Key" testId="k" />,
    );
    const wrapped = screen.getByRole("list").className;
    const wrappedRow = screen.getAllByRole("listitem")[0]?.className;
    rerender(
      <LayerKey
        definition={SAMPLE_ALERT_LAYER}
        label="Key"
        testId="k"
        layout="stacked"
      />,
    );
    expect(screen.getByRole("list").className).not.toBe(wrapped);
    expect(screen.getAllByRole("listitem")[0]?.className).not.toBe(wrappedRow);
  });

  it("keeps a long translated interval unit in both legend layouts", () => {
    const sourceColour = SAMPLE_AREA_LAYER.style.colour;
    if (sourceColour.kind !== "intervals") {
      throw new Error("The sample area layer must use intervals.");
    }
    const definition = {
      ...SAMPLE_AREA_LAYER,
      style: {
        ...SAMPLE_AREA_LAYER.style,
        colour: {
          ...sourceColour,
          unit: { key: "sample.area.unit", text: " per km²" },
        },
      },
    };
    const unit = ` ${"translatedunit".repeat(12)}`;
    const messages = new FakeMessageCatalogue({
      layerTemplates: { "sample.area.unit": unit },
    });
    const { rerender } = render(
      <LayerKey definition={definition} label="Key" testId="k" />,
      messages,
    );

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(unit);
    rerender(
      <LayerKey
        definition={definition}
        label="Key"
        testId="k"
        layout="stacked"
      />,
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(unit);
  });

  it("renders nothing for a layer whose definition has no key", () => {
    const { container } = render(
      <LayerKey definition={SAMPLE_TILE_LAYER} label="Key" testId="k" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
