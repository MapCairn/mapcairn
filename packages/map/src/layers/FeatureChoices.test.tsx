// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createFormatterRegistry,
  defaultControlValues,
  FakeMessageCatalogue,
  SAMPLE_ALERT_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServicesProvider } from "../services";
import { FeatureChoices } from "./FeatureChoices";
import type { DataLayers, SelectedFeature } from "./useDataLayers";

function choice(name: string): SelectedFeature {
  const definition = { ...SAMPLE_ALERT_LAYER, name };
  return {
    layer: {
      definition,
      enabled: true,
      controls: defaultControlValues(definition, 0),
      status: { kind: "on" },
      features: [],
      sortId: "",
      sorted: [],
    },
    feature: samplePoint("a", { title: "Brand", level: "Green" }),
  };
}

describe("FeatureChoices definition text", () => {
  it("names each feature's layer from a key, and shows a plain name as written", () => {
    const layers = { now: () => 0, select: vi.fn() } as unknown as DataLayers;
    render(
      <ServicesProvider
        services={createFakeServices({
          messages: new FakeMessageCatalogue({
            overrides: { "layer.fire-alerts.name": "Brandwaarskuwings" },
          }),
        })}
      >
        <FeatureChoices
          layers={layers}
          choices={[choice("layer.fire-alerts.name"), choice("Plain layer")]}
          formatters={createFormatterRegistry()}
          headingLevel={4}
        />
      </ServicesProvider>,
    );
    const rows = screen.getAllByTestId("feature-choices-row");
    expect(rows[0]).toHaveTextContent("Brandwaarskuwings");
    expect(rows[1]).toHaveTextContent("Plain layer");
  });
});
