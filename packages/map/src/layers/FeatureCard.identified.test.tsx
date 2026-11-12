// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createFormatterRegistry,
  FakeLayerCatalogue,
  type IdentifiableLayerDefinition,
  type LayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { FeatureCard } from "./FeatureCard";
import { FeatureChoices } from "./FeatureChoices";
import {
  type DataLayerState,
  type DataLayers,
  useDataLayers,
} from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const TAP = { latlng: { lat: -33.9, lng: 18.4 }, zoom: 10 };
const formatters = createFormatterRegistry();

const FLOOD: IdentifiableLayerDefinition = {
  ...SAMPLE_IDENTIFY_LAYER,
  disclaimer: "Modelled, not surveyed.",
  identify: {
    ...SAMPLE_IDENTIFY_LAYER.identify,
    fields: {
      ...SAMPLE_IDENTIFY_LAYER.identify.fields,
      more: "properties.more",
    },
    card: {
      ...SAMPLE_IDENTIFY_LAYER.identify.card,
      link: { field: "more", label: "More about this" },
    },
  },
};

function setup(definitions: readonly LayerDefinition[]) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const handle: { current: DataLayers | null } = { current: null };
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    handle.current = layers;
    if (layers.selected) {
      return (
        <FeatureCard
          layers={layers}
          selected={layers.selected}
          formatters={formatters}
          headingLevel={4}
          onShowOnMap={() => {}}
        />
      );
    }
    return layers.choices ? (
      <FeatureChoices
        layers={layers}
        choices={layers.choices}
        formatters={formatters}
        headingLevel={4}
      />
    ) : null;
  }
  render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <Harness />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  const layers = () => handle.current as DataLayers;
  return {
    source: services.fakes.layerSource,
    layers,
    /** Turns the layers on and taps. */
    tap: async (...ids: string[]) => {
      act(() => {
        for (const id of ids) {
          layers().setEnabled(id, true);
        }
      });
      await act(async () => {
        await layers().identifyAt(TAP);
      });
    },
  };
}

describe("a card for an identified feature", () => {
  it("shows the title and lines from the layer's identify card, and the layer's name", async () => {
    const view = setup([FLOOD]);
    view.source.setIdentified(FLOOD.id, [
      samplePoint("a", { title: "Gauge 4", depth: 1.5 }),
    ]);
    await view.tap(FLOOD.id);
    const card = screen.getByTestId("feature-card");
    expect(
      within(card).getByRole("heading", { name: "Gauge 4" }),
    ).toBeInTheDocument();
    expect(within(card).getByText("Sample flood depth")).toBeInTheDocument();
    expect(within(card).getByText("1.5 m deep")).toBeInTheDocument();
    expect(within(card).getByText("Modelled, not surveyed.")).toBeVisible();
  });

  it("leaves out the glyph and the class line, which come from a style it has not got", async () => {
    const view = setup([FLOOD]);
    view.source.setIdentified(FLOOD.id, [samplePoint("a")]);
    await view.tap(FLOOD.id);
    expect(screen.getByTestId("feature-card")).toBeInTheDocument();
    expect(screen.queryByTestId("feature-card-class")).toBeNull();
  });

  it("offers a provider link only when it is https, and no affected area", async () => {
    const view = setup([FLOOD]);
    view.source.setIdentified(FLOOD.id, [
      samplePoint("a", { more: "https://example.test/gauge-4" }),
    ]);
    await view.tap(FLOOD.id);
    expect(screen.getByTestId("feature-card-link")).toHaveAttribute(
      "href",
      "https://example.test/gauge-4",
    );
    expect(screen.queryByTestId("feature-card-detail")).toBeNull();
    expect(screen.getByTestId("feature-card-show")).toBeInTheDocument();
  });

  it("closes with Close card", async () => {
    const view = setup([FLOOD]);
    view.source.setIdentified(FLOOD.id, [samplePoint("a")]);
    await view.tap(FLOOD.id);
    fireEvent.click(screen.getByTestId("feature-card-close"));
    expect(screen.queryByTestId("feature-card")).toBeNull();
  });

  it("renders nothing for a layer whose features have no card", () => {
    const { container } = render(
      <FeatureCard
        layers={{} as DataLayers}
        selected={{
          layer: { definition: SAMPLE_TILE_LAYER } as DataLayerState,
          feature: samplePoint("a"),
        }}
        formatters={formatters}
        headingLevel={4}
        onShowOnMap={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("still shows a feed feature's glyph and class line", async () => {
    const view = setup([SAMPLE_FEED_LAYER]);
    view.source.setFeatures(SAMPLE_FEED_LAYER.id, [samplePoint("f")]);
    act(() => view.layers().setEnabled(SAMPLE_FEED_LAYER.id, true));
    await act(async () => {});
    act(() => view.layers().select(SAMPLE_FEED_LAYER.id, "f"));
    expect(screen.getByTestId("feature-card-class")).toBeInTheDocument();
  });
});

describe("a list with identified features", () => {
  const OTHER: IdentifiableLayerDefinition = {
    ...SAMPLE_IDENTIFY_LAYER,
    id: "other",
    name: "Other layer",
  };

  it("names each row from its card and its layer, with no glyph, and opens its card with a way back", async () => {
    const view = setup([FLOOD, OTHER]);
    view.source.setIdentified(FLOOD.id, [
      samplePoint("a", { title: "Gauge 4" }),
    ]);
    view.source.setIdentified("other", [
      samplePoint("b", { title: "Gauge 5" }),
    ]);
    await view.tap(FLOOD.id, "other");
    const rows = screen.getAllByTestId("feature-choices-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Gauge 4");
    expect(rows[0]).toHaveTextContent("Sample flood depth");
    expect(rows[1]).toHaveTextContent("Gauge 5");
    expect(rows[1]).toHaveTextContent("Other layer");
    for (const row of rows) {
      expect(row.querySelector("svg")).toBeNull();
    }
    fireEvent.click(rows[1] as HTMLElement);
    expect(screen.getByTestId("feature-card-heading")).toHaveTextContent(
      "Gauge 5",
    );
    fireEvent.click(screen.getByTestId("feature-card-back"));
    expect(screen.getAllByTestId("feature-choices-row")).toHaveLength(2);
  });
});
