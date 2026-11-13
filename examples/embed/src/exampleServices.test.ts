// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { CatalogueState, SkippedDefinition } from "@mapcairn/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExampleCatalogue, logSkippedLayers } from "./exampleServices";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the catalogue that loads the mapped sample", () => {
  async function readyState(): Promise<
    Extract<CatalogueState, { status: "ready" }>
  > {
    const onSkipped = vi.fn<(skipped: readonly SkippedDefinition[]) => void>();
    const catalogue = createExampleCatalogue(onSkipped);
    await catalogue.refresh();
    const state = catalogue.getState();
    if (state.status !== "ready") {
      throw new Error(`The catalogue is ${state.status}`);
    }
    return state;
  }

  it("offers the example's own layer and the three layers it could map", async () => {
    const state = await readyState();

    expect(state.layers.map((layer) => layer.id)).toEqual([
      "example-cairns",
      "huts-2024",
      "glens-rainfall",
      "snow-cover",
    ]);
  });

  it("reports the layer it could not map as skipped, with the reason", async () => {
    const state = await readyState();

    expect(state.skipped).toEqual([
      {
        id: "survey-notes",
        problems: [
          "source.fields.title: is required",
          "card.title: {title} is not a field",
        ],
      },
    ]);
  });
});

describe("logSkippedLayers", () => {
  function logged(skipped: readonly SkippedDefinition[]): string[] {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logSkippedLayers(skipped);
    return warn.mock.calls.map(([line]) => String(line));
  }

  it("names the layer and each problem on one line", () => {
    expect(
      logged([
        { id: "survey-notes", problems: ["a: is wrong", "b: is wrong"] },
      ]),
    ).toEqual(["Layer survey-notes was left out: a: is wrong; b: is wrong"]);
  });

  it.each([
    ["no id", undefined],
    ["an id that is empty, as one of only punctuation becomes", ""],
  ])("says there is no id for a layer with %s", (_name, id) => {
    expect(
      logged([{ id, problems: ["definition: must be an object"] }]),
    ).toEqual(["Layer (no id) was left out: definition: must be an object"]);
  });
});
