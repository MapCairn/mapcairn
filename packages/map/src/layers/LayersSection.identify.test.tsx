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
} from "@mapcairn/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection } from "./LayersSection";
import { MAX_IDENTIFY_LAYERS, useDataLayers } from "./useDataLayers";

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
  function Harness() {
    const layers = useDataLayers();
    return <LayersSection layers={layers} />;
  }
  return render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <Harness />
      </LiveRegionProvider>
    </ServicesProvider>,
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
