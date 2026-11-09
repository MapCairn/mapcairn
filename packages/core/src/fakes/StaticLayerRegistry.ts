import type { LayerRegistry, LayerSummary } from "../ports/layers";

/**
 * A {@link LayerRegistry} over a fixed list.
 *
 * How to script it: pass the layers it should list (none by default, which
 * matches the host in this release). The list is copied and frozen.
 */
export class StaticLayerRegistry implements LayerRegistry {
  readonly #layers: readonly LayerSummary[];

  constructor(layers: readonly LayerSummary[] = []) {
    this.#layers = Object.freeze([...layers]);
  }

  list(): readonly LayerSummary[] {
    return this.#layers;
  }
}
