// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it, vi } from "vitest";
import type { LayerDefinition } from "../layers/definition";
import type { CatalogueState, LayerCatalogue } from "../ports/layers";

/** What the layer catalogue contract needs besides the catalogue itself. */
export interface LayerCatalogueControls {
  /** The layers the catalogue holds once it is ready, in order. May be empty. */
  readonly layers: readonly LayerDefinition[];
  /**
   * Brings the catalogue to its first ready state and resolves once it is
   * there. A catalogue that starts ready resolves at once. The contract
   * never assumes a state changes, because a static catalogue never does.
   */
  settle(): Promise<void>;
}

/** One layer catalogue under test, with its controls. */
export interface LayerCatalogueSubject {
  readonly catalogue: LayerCatalogue;
  readonly controls: LayerCatalogueControls;
}

type ReadyState = Extract<CatalogueState, { status: "ready" }>;

function ready(catalogue: LayerCatalogue): ReadyState {
  const state = catalogue.getState();
  if (state.status !== "ready") {
    throw new Error(`expected a ready catalogue, got ${state.status}`);
  }
  return state;
}

/**
 * Runs the shared behavioural suite for a {@link LayerCatalogue}. Every test
 * calls `create` for a fresh subject. Run it for a catalogue with no layers
 * and for one with several.
 */
export function runLayerCatalogueContract(
  name: string,
  create: () => LayerCatalogueSubject,
): void {
  describe(`LayerCatalogue contract: ${name}`, () => {
    it("returns the same state object until something changes", () => {
      const { catalogue } = create();
      expect(catalogue.getState()).toBe(catalogue.getState());
    });

    it("can be read without a subscription, as the server snapshot is", () => {
      const { catalogue } = create();
      expect(["loading", "failed", "ready"]).toContain(
        catalogue.getState().status,
      );
    });

    it("lists the layers it was built with, in order, once ready", async () => {
      const { catalogue, controls } = create();
      await controls.settle();
      expect(ready(catalogue).layers).toEqual(controls.layers);
    });

    it("lists layers that each have a non-empty id and name", async () => {
      const { catalogue, controls } = create();
      await controls.settle();
      for (const layer of ready(catalogue).layers) {
        expect(layer.id).not.toBe("");
        expect(layer.name).not.toBe("");
      }
    });

    it("lists unique ids", async () => {
      const { catalogue, controls } = create();
      await controls.settle();
      const ids = ready(catalogue).layers.map((layer) => layer.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("is ready with nothing skipped and no refresh under way once settled", async () => {
      const { catalogue, controls } = create();
      await controls.settle();
      expect(ready(catalogue).skipped).toEqual([]);
      expect(ready(catalogue).refresh).toBe("idle");
    });

    it("never rejects a refresh, whether or not one is already under way", async () => {
      const { catalogue, controls } = create();
      await expect(catalogue.refresh()).resolves.toBeUndefined();
      await controls.settle();
      await expect(
        Promise.all([catalogue.refresh(), catalogue.refresh()]),
      ).resolves.toEqual([undefined, undefined]);
    });

    it("is ready with the same layers after a refresh", async () => {
      const { catalogue, controls } = create();
      await controls.settle();
      await catalogue.refresh();
      expect(ready(catalogue).layers).toEqual(controls.layers);
      expect(ready(catalogue).refresh).toBe("idle");
    });

    it("tells a subscriber about each change, each time with a new state", async () => {
      const { catalogue, controls } = create();
      const seen: CatalogueState[] = [catalogue.getState()];
      catalogue.subscribe(() => {
        seen.push(catalogue.getState());
      });
      await controls.settle();
      await catalogue.refresh();
      seen.forEach((state, index) => {
        if (index > 0) {
          expect(state).not.toBe(seen[index - 1]);
        }
      });
    });

    it("stops telling a subscriber once it unsubscribes", async () => {
      const { catalogue } = create();
      const listener = vi.fn();
      const unsubscribe = catalogue.subscribe(listener);
      unsubscribe();
      await catalogue.refresh();
      expect(listener).not.toHaveBeenCalled();
    });
  });
}
