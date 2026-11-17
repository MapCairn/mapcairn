// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  type IdentifiableLayerDefinition,
  type LayerDefinition,
  SAMPLE_FEED_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
  tileUrl,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection } from "./LayersSection";
import {
  type DataLayers,
  MAX_IDENTIFY_LAYERS,
  useDataLayers,
} from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);

const HINT = "Tap the map to see details for this layer.";
const CAP = `Only the first ${MAX_IDENTIFY_LAYERS} layers are asked on one tap.`;

/** Identifiable layers beyond the sample one, each with its own id and name. */
function identifiable(count: number): IdentifiableLayerDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    ...SAMPLE_IDENTIFY_LAYER,
    id: `identify-${index}`,
    name: `Identify ${index}`,
  }));
}

function setup(definitions: readonly LayerDefinition[]) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  const handle: { current: DataLayers | null } = { current: null };
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    handle.current = layers;
    return <LayersSection layers={layers} />;
  }
  const view = render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <Harness />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return { ...view, layers: () => handle.current as DataLayers };
}

/** Reports that none of an identifiable layer's tiles loaded, as the map does. */
function reportNoImagery(
  layers: DataLayers,
  definition: IdentifiableLayerDefinition,
) {
  const state = layers.layers.find(
    (entry) => entry.definition.id === definition.id,
  );
  act(() =>
    layers.reportTilesUnavailable(
      definition.id,
      tileUrl(definition, state?.controls ?? {}, NOW),
    ),
  );
}

const item = (id: string) => screen.getByTestId(`layer-${id}`);
const turnOn = (id: string, name: string) =>
  fireEvent.click(within(item(id)).getByRole("switch", { name }));

describe("LayersSection identify lines", () => {
  it("says an identifiable layer can be tapped only while it is on", () => {
    setup([SAMPLE_IDENTIFY_LAYER]);
    expect(screen.queryByText(HINT)).toBeNull();
    turnOn(SAMPLE_IDENTIFY_LAYER.id, "Sample flood depth");
    expect(
      within(item(SAMPLE_IDENTIFY_LAYER.id)).getByText(HINT),
    ).toBeVisible();
    turnOn(SAMPLE_IDENTIFY_LAYER.id, "Sample flood depth");
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("says nothing for a tile layer with no identify block, or a feed layer", () => {
    setup([SAMPLE_TILE_LAYER, SAMPLE_FEED_LAYER]);
    turnOn(SAMPLE_TILE_LAYER.id, SAMPLE_TILE_LAYER.name as string);
    turnOn(SAMPLE_FEED_LAYER.id, SAMPLE_FEED_LAYER.name as string);
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("names the cap only when more layers are identifiable and on than one tap asks", () => {
    const layers = identifiable(MAX_IDENTIFY_LAYERS + 1);
    setup(layers);
    for (const layer of layers.slice(0, MAX_IDENTIFY_LAYERS)) {
      turnOn(layer.id, layer.name as string);
    }
    expect(screen.queryByText(CAP)).toBeNull();
    const last = layers.at(-1) as IdentifiableLayerDefinition;
    turnOn(last.id, last.name as string);
    expect(screen.getByText(CAP)).toBeVisible();
    turnOn(last.id, last.name as string);
    expect(screen.queryByText(CAP)).toBeNull();
  });

  it("drops the line for a layer with no imagery, which a tap does not ask, and brings it back with the imagery", () => {
    const { layers } = setup([SAMPLE_IDENTIFY_LAYER]);
    turnOn(SAMPLE_IDENTIFY_LAYER.id, "Sample flood depth");
    expect(screen.getByText(HINT)).toBeVisible();
    reportNoImagery(layers(), SAMPLE_IDENTIFY_LAYER);
    expect(screen.queryByText(HINT)).toBeNull();
    act(() =>
      layers().reportTilesRecovered(
        SAMPLE_IDENTIFY_LAYER.id,
        tileUrl(
          SAMPLE_IDENTIFY_LAYER,
          layers().layers.find(
            (entry) => entry.definition.id === SAMPLE_IDENTIFY_LAYER.id,
          )?.controls ?? {},
          NOW,
        ),
      ),
    );
    expect(screen.getByText(HINT)).toBeVisible();
  });

  it("does not count a layer with no imagery towards the cap", () => {
    const definitions = identifiable(MAX_IDENTIFY_LAYERS + 1);
    const { layers } = setup(definitions);
    for (const layer of definitions) {
      turnOn(layer.id, layer.name as string);
    }
    expect(screen.getByText(CAP)).toBeVisible();
    reportNoImagery(layers(), definitions[0] as IdentifiableLayerDefinition);
    expect(screen.queryByText(CAP)).toBeNull();
  });

  it("does not count a layer that is off, or one that cannot be tapped, towards the cap", () => {
    const layers = identifiable(MAX_IDENTIFY_LAYERS);
    setup([...layers, SAMPLE_TILE_LAYER]);
    for (const layer of layers) {
      turnOn(layer.id, layer.name as string);
    }
    turnOn(SAMPLE_TILE_LAYER.id, SAMPLE_TILE_LAYER.name as string);
    expect(screen.queryByText(CAP)).toBeNull();
  });
});
