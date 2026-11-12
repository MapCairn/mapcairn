// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type CatalogueStore,
  createCatalogueStore,
  readyState,
} from "../layers/catalogueState";
import type { LayerDefinition } from "../layers/definition";
import type { CatalogueState, LayerCatalogue } from "../ports/layers";

/**
 * A {@link LayerCatalogue} a test scripts directly.
 *
 * How to script it: pass the layers it should hold (none by default, which
 * matches the host in this release) and it is ready with them. Call
 * `setLayers` to replace them and `setState` to put it in any state, such as
 * `loading` or `failed`; each tells the subscribers once. `refresh` only
 * counts the calls in `refreshes` and changes nothing, so a test decides what
 * a refresh does by calling `setState` itself.
 */
export class FakeLayerCatalogue implements LayerCatalogue {
  readonly #store: CatalogueStore;
  /** How many times `refresh` has been called. */
  refreshes = 0;

  constructor(layers: readonly LayerDefinition[] = []) {
    this.#store = createCatalogueStore(readyState(Object.freeze([...layers])));
  }

  readonly getState = (): CatalogueState => this.#store.getState();

  readonly subscribe = (listener: () => void): (() => void) =>
    this.#store.subscribe(listener);

  readonly refresh = (): Promise<void> => {
    this.refreshes += 1;
    return Promise.resolve();
  };

  /** Replaces the layers, ready with none skipped, and tells the subscribers. */
  setLayers(layers: readonly LayerDefinition[]): void {
    this.#store.setState(readyState(Object.freeze([...layers])));
  }

  /** Puts the catalogue in `state` as it is, and tells the subscribers. */
  setState(state: CatalogueState): void {
    this.#store.setState(state);
  }
}
