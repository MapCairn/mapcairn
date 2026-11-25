// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createFakeServices,
  FakeLayerCatalogue,
  FakeMapAdapter,
  type LayerDefinition,
  MAX_SAVED_FEATURES,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
  samplePoint,
} from "@mapcairn/core";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { testMapContext } from "../chrome/MapChrome/chromeTestHarness";
import { MapContext } from "../host";
import { ServicesProvider } from "../services";
import { LiveRegionProvider } from "../ui/LiveRegion";
import { LayersSection } from "./LayersSection";
import { useDataLayers } from "./useDataLayers";

const NOW = Date.UTC(2026, 10, 9, 12);
const ALLOWED: LayerDefinition = { ...SAMPLE_FEED_LAYER, saveFeatures: true };

function setup(definitions: readonly LayerDefinition[]) {
  const services = createFakeServices({
    layers: new FakeLayerCatalogue(definitions),
  });
  function Harness() {
    const layers = useDataLayers({ now: () => NOW });
    return <LayersSection layers={layers} onShowOnMap={() => {}} />;
  }
  render(
    <ServicesProvider services={services}>
      <LiveRegionProvider>
        <MapContext.Provider
          value={testMapContext({ adapter: new FakeMapAdapter() })}
        >
          <Harness />
        </MapContext.Provider>
      </LiveRegionProvider>
    </ServicesProvider>,
  );
  return {
    source: services.fakes.layerSource,
    saver: services.fakes.fileSaver,
  };
}

async function turnOn(name = "Sample points") {
  fireEvent.click(screen.getByRole("switch", { name }));
  await screen.findByTestId("layer-status-sample-points");
}

const saveGroup = () => screen.queryByRole("group", { name: /^Save the/ });

describe("saving a layer's features", () => {
  it("offers nothing for a layer whose definition does not allow it", async () => {
    const { source } = setup([SAMPLE_FEED_LAYER]);
    source.setFeatures("sample-points", [samplePoint("a")]);
    await turnOn();
    await screen.findByTestId("layer-list-sample-points");
    expect(saveGroup()).toBeNull();
    expect(screen.queryByRole("button", { name: /Save as/ })).toBeNull();
  });

  it("offers nothing for a tile layer even when the field is forced on", async () => {
    setup([{ ...SAMPLE_TILE_LAYER, saveFeatures: true } as LayerDefinition]);
    fireEvent.click(screen.getByRole("switch", { name: "Sample imagery" }));
    expect(saveGroup()).toBeNull();
  });

  it("offers nothing while there are no features to save", async () => {
    setup([ALLOWED]);
    await turnOn();
    expect(saveGroup()).toBeNull();
  });

  it("offers GeoJSON and CSV, with the cap stated, once features are loaded", async () => {
    const { source } = setup([ALLOWED]);
    source.setFeatures("sample-points", [samplePoint("a")]);
    await turnOn();
    const group = await screen.findByRole("group", {
      name: "Save the features of Sample points",
    });
    expect(
      within(group).getByRole("button", { name: "Save as GeoJSON" }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole("button", { name: "Save as CSV" }),
    ).toBeInTheDocument();
    expect(group).toHaveTextContent(
      `up to ${MAX_SAVED_FEATURES.toLocaleString("en-GB")}`,
    );
  });

  it("saves the features held as GeoJSON, with the credit and the date, and says so", async () => {
    const { source, saver } = setup([ALLOWED]);
    source.setFeatures("sample-points", [samplePoint("a"), samplePoint("b")]);
    await turnOn();
    const requests = source.requests.length;
    fireEvent.click(
      await screen.findByRole("button", { name: "Save as GeoJSON" }),
    );
    await waitFor(() => expect(saver.saved).toHaveLength(1));
    const file = saver.saved[0];
    expect(file?.filename).toBe("sample-points-2026-11-09.geojson");
    expect(file?.mimeType).toBe("application/geo+json");
    const parsed = JSON.parse(file?.content ?? "");
    expect(parsed.features.map((f: { id: string }) => f.id)).toEqual([
      "a",
      "b",
    ]);
    expect(parsed.attribution).toEqual([
      "Sample provider (https://sample.test/)",
    ]);
    expect(parsed.saved).toBe("2026-11-09");
    expect(source.requests).toHaveLength(requests);
    const said =
      "Saved 2 features of Sample points as sample-points-2026-11-09.geojson.";
    await waitFor(() =>
      expect(screen.getByTestId("live-region-polite")).toHaveTextContent(said),
    );
    expect(
      screen.getByTestId("layer-save-status-sample-points"),
    ).toHaveTextContent(said);
  });

  it("saves CSV with a formula-safe cell", async () => {
    const { source, saver } = setup([ALLOWED]);
    source.setFeatures("sample-points", [
      samplePoint("a", { title: "=HYPERLINK(1)" }),
    ]);
    await turnOn();
    fireEvent.click(await screen.findByRole("button", { name: "Save as CSV" }));
    await waitFor(() => expect(saver.saved).toHaveLength(1));
    const file = saver.saved[0];
    expect(file?.filename).toBe("sample-points-2026-11-09.csv");
    expect(file?.mimeType).toBe("text/csv;charset=utf-8");
    expect(file?.content).toContain("'=HYPERLINK(1)");
  });

  it("cuts a larger layer to the cap and says how many were left out", async () => {
    const { source, saver } = setup([ALLOWED]);
    const many = Array.from({ length: MAX_SAVED_FEATURES + 2 }, (_, i) =>
      samplePoint(`p${i}`),
    );
    source.setFeatures("sample-points", many);
    await turnOn();
    fireEvent.click(await screen.findByRole("button", { name: "Save as CSV" }));
    await waitFor(() => expect(saver.saved).toHaveLength(1));
    expect(saver.saved[0]?.content.split("\r\n")).toHaveLength(
      MAX_SAVED_FEATURES + 1,
    );
    await waitFor(() =>
      expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
        `Saved the first 5,000 of 5,002 features of Sample points`,
      ),
    );
  });

  it("says so, assertively, when the file could not be saved", async () => {
    const { source, saver } = setup([ALLOWED]);
    saver.failWith("failed");
    source.setFeatures("sample-points", [samplePoint("a")]);
    await turnOn();
    fireEvent.click(
      await screen.findByRole("button", { name: "Save as GeoJSON" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("live-region-assertive")).toHaveTextContent(
        "The file could not be saved.",
      ),
    );
  });
});
