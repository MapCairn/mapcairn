// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import type { LayerDefinition } from "../layers/definition";
import type { LayerCatalogue } from "../ports/layers";

/** What the layer contract needs besides the registry itself. */
export interface LayerCatalogueControls {
  /** The layers the registry was built to list, in order. May be empty. */
  readonly layers: readonly LayerDefinition[];
}

/** One layer registry under test, with its controls. */
export interface LayerCatalogueSubject {
  readonly registry: LayerCatalogue;
  readonly controls: LayerCatalogueControls;
}

/**
 * Runs the shared behavioural suite for a {@link LayerCatalogue}. Every test
 * calls `create` for a fresh subject. Run it for an empty registry and for
 * one with several layers.
 */
export function runLayerCatalogueContract(
  name: string,
  create: () => LayerCatalogueSubject,
): void {
  describe(`LayerCatalogue contract: ${name}`, () => {
    it("lists the layers it was built with, in order", () => {
      const { registry, controls } = create();
      expect(registry.list()).toEqual(controls.layers);
    });

    it("lists layers that each have a non-empty id and name", () => {
      const { registry } = create();
      for (const layer of registry.list()) {
        expect(layer.id).not.toBe("");
        expect(layer.name).not.toBe("");
      }
    });

    it("lists unique ids", () => {
      const { registry } = create();
      const ids = registry.list().map((layer) => layer.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("lists the same layers every time", () => {
      const { registry } = create();
      expect(registry.list()).toEqual(registry.list());
    });
  });
}
