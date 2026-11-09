import type { LayerRegistry, LayerSummary } from "../ports/layers";

const NO_LAYERS: readonly LayerSummary[] = Object.freeze([]);

/**
 * The {@link LayerRegistry} for a host that supplies no data layers, so the
 * sheet's Data section stays hidden. Frozen and stateless, so one instance
 * can be shared safely; a host with layers supplies its own registry.
 */
export const emptyLayerRegistry: LayerRegistry = Object.freeze({
  list: () => NO_LAYERS,
});
