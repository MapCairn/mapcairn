// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LayerDefinition,
  readyLayers,
  SAMPLE_FEED_LAYER,
  SAMPLE_HEATMAP_LAYER,
  SAMPLE_IDENTIFY_LAYER,
  SAMPLE_TILE_LAYER,
} from "@mapcairn/core";
import { describe, expect, it, vi } from "vitest";
import { buildLayers } from "./layers";
import { MountMapError } from "./MountMapError";

const SOURCE = { load: vi.fn(), loadDetail: vi.fn(), identify: vi.fn() };

function problem(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MountMapError);
    expect((error as MountMapError).kind).toBe("invalid-option");
    return (error as MountMapError).message;
  }
  throw new Error("It did not throw.");
}

function reported() {
  const errors: MountMapError[] = [];
  return { errors, report: (error: MountMapError) => errors.push(error) };
}

describe("buildLayers with definitions", () => {
  it("has none when left out", () => {
    const { catalogue, present } = buildLayers(undefined, {
      layerSource: undefined,
      report: () => {},
    });
    expect(present).toBe(false);
    expect(readyLayers(catalogue.getState())).toEqual([]);
  });

  it("holds valid definitions", () => {
    const { catalogue, present } = buildLayers([SAMPLE_TILE_LAYER], {
      layerSource: undefined,
      report: () => {},
    });
    expect(present).toBe(true);
    expect(readyLayers(catalogue.getState()).map(({ id }) => id)).toEqual([
      SAMPLE_TILE_LAYER.id,
    ]);
  });

  it("names every problem of an invalid definition, and the fix", () => {
    const broken = { ...SAMPLE_TILE_LAYER, id: "broken", name: 3 } as never;
    const twice = [SAMPLE_TILE_LAYER, SAMPLE_TILE_LAYER];
    const message = problem(() =>
      buildLayers([broken, ...twice], {
        layerSource: undefined,
        report: () => {},
      }),
    );
    expect(message).toContain("broken: ");
    expect(message).toContain(`${SAMPLE_TILE_LAYER.id}: id: duplicate`);
    expect(message).toContain("Fix each one, or remove it from layers.");
  });

  it("refuses what is neither a list nor a function", () => {
    expect(
      problem(() =>
        buildLayers("layers", { layerSource: undefined, report: () => {} }),
      ),
    ).toBe(
      "layers must be a list of layer definitions, or a function that returns one.",
    );
  });

  it("refuses layers that need a layer source when there is none, naming each", () => {
    const message = problem(() =>
      buildLayers(
        [
          SAMPLE_TILE_LAYER,
          SAMPLE_FEED_LAYER,
          SAMPLE_HEATMAP_LAYER,
          SAMPLE_IDENTIFY_LAYER,
        ],
        { layerSource: undefined, report: () => {} },
      ),
    );
    expect(message).toBe(
      `layers: ${SAMPLE_FEED_LAYER.id}, ${SAMPLE_HEATMAP_LAYER.id}, ${SAMPLE_IDENTIFY_LAYER.id} need services.layerSource to load their features. Pass services.layerSource, or remove them from layers.`,
    );
  });

  it("accepts them with a layer source", () => {
    expect(() =>
      buildLayers([SAMPLE_FEED_LAYER], {
        layerSource: SOURCE,
        report: () => {},
      }),
    ).not.toThrow();
  });
});

describe("buildLayers with a function", () => {
  const options = (layerSource?: typeof SOURCE) => ({
    layerSource,
    ...reported(),
  });

  it("loads the definitions it returns", async () => {
    const { catalogue, present } = buildLayers(
      () => Promise.resolve([SAMPLE_TILE_LAYER]),
      options(),
    );
    expect(present).toBe(true);
    catalogue.subscribe(() => {});
    await vi.waitFor(() =>
      expect(readyLayers(catalogue.getState())).toHaveLength(1),
    );
  });

  it("reports a definition it left out through the callback, and keeps the rest", async () => {
    const seen = options();
    const broken = { ...SAMPLE_TILE_LAYER, id: "broken", name: 3 };
    const { catalogue } = buildLayers(
      () =>
        Promise.resolve([
          SAMPLE_TILE_LAYER,
          broken,
        ] as unknown as LayerDefinition[]),
      seen,
    );
    catalogue.subscribe(() => {});
    await vi.waitFor(() => expect(seen.errors).toHaveLength(1));
    expect(seen.errors[0]?.kind).toBe("invalid-option");
    expect(seen.errors[0]?.message).toMatch(
      /^layers: "broken" was left out because it is not valid: .+ Fix the definition\.$/,
    );
    expect(readyLayers(catalogue.getState()).map(({ id }) => id)).toEqual([
      SAMPLE_TILE_LAYER.id,
    ]);
  });

  it("names a definition that has no id as such", async () => {
    const seen = options();
    const { catalogue } = buildLayers(
      () => Promise.resolve([{ name: "No id" } as unknown as LayerDefinition]),
      seen,
    );
    catalogue.subscribe(() => {});
    await vi.waitFor(() => expect(seen.errors).toHaveLength(1));
    expect(seen.errors[0]?.message).toMatch(
      /^layers: "\(no id\)" was left out/,
    );
  });

  it("leaves out, and reports, a loaded layer that needs a layer source when there is none", async () => {
    const seen = options();
    const { catalogue } = buildLayers(
      () => Promise.resolve([SAMPLE_TILE_LAYER, SAMPLE_FEED_LAYER]),
      seen,
    );
    catalogue.subscribe(() => {});
    await vi.waitFor(() => expect(seen.errors).toHaveLength(1));
    expect(seen.errors[0]?.message).toBe(
      `layers: "${SAMPLE_FEED_LAYER.id}" was left out because it needs services.layerSource to load its features. Pass services.layerSource, or remove it from layers.`,
    );
    await vi.waitFor(() =>
      expect(readyLayers(catalogue.getState()).map(({ id }) => id)).toEqual([
        SAMPLE_TILE_LAYER.id,
      ]),
    );
  });

  it("keeps a loaded layer that needs a layer source when there is one", async () => {
    const seen = options(SOURCE);
    const { catalogue } = buildLayers(
      () => Promise.resolve([SAMPLE_FEED_LAYER]),
      seen,
    );
    catalogue.subscribe(() => {});
    await vi.waitFor(() =>
      expect(readyLayers(catalogue.getState())).toHaveLength(1),
    );
    expect(seen.errors).toEqual([]);
  });

  it("reports a function that fails, and shows the catalogue as failed", async () => {
    const seen = options();
    const { catalogue } = buildLayers(
      () => Promise.reject(new Error("offline")),
      seen,
    );
    catalogue.subscribe(() => {});
    await vi.waitFor(() => expect(seen.errors).toHaveLength(1));
    expect(seen.errors[0]?.kind).toBe("invalid-option");
    expect(seen.errors[0]?.message).toBe(
      "layers: the function could not load the layers (offline). Fix it, or pass the definitions as a list.",
    );
    await vi.waitFor(() => expect(catalogue.getState().status).toBe("failed"));
  });

  it("stops reporting after dispose", async () => {
    const seen = options();
    const { catalogue, dispose } = buildLayers(
      () => Promise.resolve([SAMPLE_FEED_LAYER]),
      seen,
    );
    dispose();
    catalogue.subscribe(() => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.errors).toEqual([]);
  });
});
