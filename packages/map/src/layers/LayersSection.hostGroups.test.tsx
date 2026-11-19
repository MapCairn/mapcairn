// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  createLanguageCatalogue,
  FakeLayerCatalogue,
  FakeMessageCatalogue,
  type LayerDefinition,
  SAMPLE_ALERT_LAYER,
  SAMPLE_FEED_LAYER,
} from "@mapcairn/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection } from "./LayersSection";
import { useDataLayers } from "./useDataLayers";

const ENGLISH = new FakeMessageCatalogue();
const AFRIKAANS = new FakeMessageCatalogue({
  language: "af",
  definitionTexts: {
    "host.group.rivers": "Water",
    "host.group.lakes": "Water",
    "host.group.single": "Waterlae",
  },
});

function Section() {
  return <LayersSection layers={useDataLayers()} />;
}

function setup(definitions: readonly LayerDefinition[]) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
    messages: ENGLISH,
    languages: createLanguageCatalogue(
      [
        { tag: "en-GB", label: "English" },
        { tag: "af", label: "Afrikaans" },
      ],
      "en-GB",
      (tag) => (tag === "af" ? AFRIKAANS : ENGLISH),
    ),
  });
  services.fakes.settings.set({ language: "en-GB" });
  render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <Section />
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return services;
}

const layer = (id: string, key: string, text: string): LayerDefinition => ({
  ...SAMPLE_FEED_LAYER,
  id,
  name: id,
  group: { key, text },
});

const headings = () =>
  screen
    .getAllByRole("heading", { level: 4 })
    .map((heading) => heading.textContent);

describe("LayersSection group identity", () => {
  it("merges groups whose keys translate to the same heading", async () => {
    const services = setup([
      layer("one", "host.group.rivers", "Rivers"),
      layer("two", "host.group.lakes", "Lakes"),
    ]);
    expect(headings()).toEqual(["Rivers", "Lakes"]);
    await act(async () => services.fakes.settings.set({ language: "af" }));
    expect(headings()).toEqual(["Water"]);
    expect(
      within(screen.getByTestId("layer-one")).getByRole("switch"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("layer-two")).getByRole("switch"),
    ).toBeInTheDocument();
  });

  it("keeps the Undo row of a turned-off group when the language changes", async () => {
    const services = setup([
      layer("one", "host.group.single", "Lakes"),
      layer("two", "host.group.single", "Lakes"),
      { ...SAMPLE_ALERT_LAYER, id: "other" },
    ]);
    fireEvent.click(
      within(screen.getByTestId("layer-one")).getByRole("switch"),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Turn off 1 in Lakes" }),
    );
    expect(
      screen.getByRole("button", { name: "Undo turning off 1 in Lakes" }),
    ).toBeInTheDocument();
    await act(async () => services.fakes.settings.set({ language: "af" }));
    expect(
      screen.getByRole("button", {
        name: "Undo turning off 1 in Waterlae",
      }),
    ).toBeInTheDocument();
  });
});
