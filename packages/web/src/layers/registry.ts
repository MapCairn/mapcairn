import type { DomainConfig, Layer, LayerGroup } from "@karta/core";
import { createRegistry } from "@karta/core";

/** Empty by default. Hosts can configure layers without changing the map shell. */
const domain: DomainConfig = { layers: [], layerGroups: [] };
const registry = createRegistry(domain);

/** Returns the configured layer catalogue. */
export function getLayers(): readonly Layer[] {
  return registry.getLayers();
}

/** Returns the layer with the given id, or `undefined` if not found. */
export function getLayer(id: string): Layer | undefined {
  const layer = registry.getLayer(id);
  return layer;
}

/** Returns the configured layer groups. */
export function getLayerGroups(): readonly LayerGroup[] {
  return registry.getLayerGroups();
}

/**
 * Returns every layer group's structural fields (`id`, `layerIds`,
 * `selectionMode`). Equivalent to `getLayerGroups()`; kept as a separate
 * name for callers (e.g. group-membership checks) that only need structure.
 */
export function getLayerGroupStructure(): readonly LayerGroup[] {
  return registry.getLayerGroups();
}

/**
 * Returns every layer's structural fields (`id`, `defaultVisible`,
 * `dataSource`, etc.). Equivalent to `getLayers()`; kept as a separate name
 * for callers (e.g. `defaultVisible` id lookups) that only need structure.
 */
export function getLayerStructure(): readonly Layer[] {
  return registry.getLayers();
}
