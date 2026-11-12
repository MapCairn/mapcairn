// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerDefinition } from "../layers/definition";
import type { LayerCatalogue } from "../ports/layers";

/**
 * A {@link LayerCatalogue} over a fixed list.
 *
 * How to script it: pass the layers it should list (none by default, which
 * matches the host in this release). The list is copied and frozen.
 */
export class FakeLayerCatalogue implements LayerCatalogue {
  readonly #layers: readonly LayerDefinition[];

  constructor(layers: readonly LayerDefinition[] = []) {
    this.#layers = Object.freeze([...layers]);
  }

  list(): readonly LayerDefinition[] {
    return this.#layers;
  }
}
