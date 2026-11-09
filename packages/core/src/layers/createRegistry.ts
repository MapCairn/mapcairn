import type { DomainConfig, Layer, LayerGroup } from "../types/layer";

/** The read-only accessor interface returned by `createRegistry`. */
export interface DomainRegistry {
  /** Returns all layers in the domain. */
  getLayers(): readonly Layer[];
  /** Returns the layer with the given id, or `undefined` if not found. */
  getLayer(id: string): Layer | undefined;
  /** Returns all layer groups in the domain. */
  getLayerGroups(): readonly LayerGroup[];
}

/**
 * Creates a read-only registry for a domain configuration.
 * @param domain - The domain whose layers and groups to expose. Both may be empty.
 * @returns Read-only layer and group accessors.
 * @example
 * const registry = createRegistry({ layers: [], layerGroups: [] });
 */
export function createRegistry(domain: DomainConfig): DomainRegistry {
  const layersById = new Map(domain.layers.map((layer) => [layer.id, layer]));
  return {
    getLayers: (): readonly Layer[] => domain.layers,
    getLayer: (id: string): Layer | undefined => layersById.get(id),
    getLayerGroups: (): readonly LayerGroup[] => domain.layerGroups,
  };
}
