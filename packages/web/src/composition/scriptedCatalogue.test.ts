// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  FakeLayerCatalogue,
  type LayerCatalogue,
  readyLayers,
  SAMPLE_FEED_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServices } from "./createServices";

/** A definition the host's registries accept. */
const TILES = { ...SAMPLE_TILE_LAYER, id: "scripted-tiles" };

/** The layers a catalogue offers now. */
const listed = (layers: LayerCatalogue) => readyLayers(layers.getState());

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  Reflect.deleteProperty(window, "__MAPCAIRN_TEST_CATALOGUE__");
  Reflect.deleteProperty(window, "__mapcairnCatalogue");
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Builds the services with a script on the window, and starts the catalogue loading. */
function withScript(script: unknown) {
  window.__MAPCAIRN_TEST_CATALOGUE__ = script;
  const { layers } = createServices();
  layers.subscribe(() => undefined);
  return layers;
}

describe("the scripted catalogue in the test seam", () => {
  it("replaces the host's catalogue with a runtime catalogue that is loading, then ready with the scripted list", async () => {
    window.__MAPCAIRN_TEST_CATALOGUE__ = { steps: [[TILES]] };
    const { layers } = createServices();
    expect(layers.getState()).toEqual({ status: "loading" });
    layers.subscribe(() => undefined);
    await vi.waitFor(() => expect(layers.getState().status).toBe("ready"));
    expect(layers.getState()).toMatchObject({
      status: "ready",
      layers: [expect.objectContaining({ id: "scripted-tiles" })],
      skipped: [],
    });
  });

  it("answers each load with the next step, and the last step again after that", async () => {
    const layers = withScript({ steps: ["fail", [TILES], []] });
    await vi.waitFor(() => expect(layers.getState().status).toBe("failed"));
    await layers.refresh();
    expect(layers.getState()).toMatchObject({ status: "ready" });
    expect(listed(layers)).toHaveLength(1);
    await layers.refresh();
    expect(listed(layers)).toHaveLength(0);
    await layers.refresh();
    expect(listed(layers)).toHaveLength(0);
  });

  it("goes through the real validation, so a bad entry is skipped and counted", async () => {
    const layers = withScript({ steps: [[TILES, { id: "broken" }]] });
    await vi.waitFor(() => expect(layers.getState().status).toBe("ready"));
    expect(layers.getState()).toMatchObject({
      status: "ready",
      layers: [expect.objectContaining({ id: "scripted-tiles" })],
      skipped: [expect.objectContaining({ id: "broken" })],
    });
  });

  it("fails as invalid when the step is not a list, and as network when it rejects", async () => {
    const layers = withScript({ steps: ["invalid", "fail"] });
    await vi.waitFor(() =>
      expect(layers.getState()).toEqual({
        status: "failed",
        reason: "invalid",
      }),
    );
    await layers.refresh();
    expect(layers.getState()).toEqual({ status: "failed", reason: "network" });
  });

  it("holds each answer back for the scripted delay", async () => {
    vi.useFakeTimers();
    const layers = withScript({ steps: [[TILES]], delayMs: 5000 });
    await vi.advanceTimersByTimeAsync(4999);
    expect(layers.getState().status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1);
    expect(layers.getState().status).toBe("ready");
  });

  it("makes the catalogue reachable on the window, so a test can ask it to refresh", async () => {
    const layers = withScript({ steps: [[TILES], []] });
    expect(window.__mapcairnCatalogue).toBe(layers);
    await vi.waitFor(() => expect(layers.getState().status).toBe("ready"));
    await window.__mapcairnCatalogue?.refresh();
    expect(listed(layers)).toHaveLength(0);
  });

  it("says in the console that it replaced the catalogue", () => {
    window.__MAPCAIRN_TEST_CATALOGUE__ = { steps: [[]] };
    createServices();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining("MAPCAIRN_TEST_SEAM_MARKER"),
    );
  });

  it("gives way to a catalogue the test supplies as a service", () => {
    const supplied = new FakeLayerCatalogue([SAMPLE_FEED_LAYER]);
    window.__MAPCAIRN_TEST_SERVICES__ = { layers: supplied };
    window.__MAPCAIRN_TEST_CATALOGUE__ = { steps: [[TILES]] };
    expect(createServices().layers).toBe(supplied);
    Reflect.deleteProperty(window, "__MAPCAIRN_TEST_SERVICES__");
  });

  it("ignores a script that is not plain data it can use", () => {
    for (const script of [
      null,
      "steps",
      [],
      {},
      { steps: [] },
      { steps: "fail" },
      { steps: [42] },
      { steps: ["unknown"] },
      { steps: [[]], delayMs: -1 },
      { steps: [[]], delayMs: "slow" },
    ]) {
      window.__MAPCAIRN_TEST_CATALOGUE__ = script;
      const { layers } = createServices();
      expect(layers.getState(), JSON.stringify(script)).toMatchObject({
        status: "ready",
      });
      expect(window.__mapcairnCatalogue).toBeUndefined();
    }
  });

  it("is ignored in a production build", () => {
    vi.stubEnv("MODE", "production");
    window.__MAPCAIRN_TEST_CATALOGUE__ = { steps: [[SAMPLE_TILE_LAYER]] };
    const { layers } = createServices();
    expect(layers.getState().status).toBe("ready");
    expect(window.__mapcairnCatalogue).toBeUndefined();
  });
});
