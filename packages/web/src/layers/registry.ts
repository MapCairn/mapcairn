import type { DomainConfig, Layer, LayerGroup } from "@karta/core";
import { createRegistry } from "@karta/core";

/** Empty by default. Hosts can configure layers without changing the map shell. */
const domain: DomainConfig = { layers: [], layerGroups: [] };
const registry = createRegistry(domain);

/** Returns the configured layer catalogue. */
export function getLayers(): readonly Layer[] {
  return registry.getLayers();
}

/** Returns the layer with the given id, localized to the current locale, or `undefined` if not found. */
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
 * `selectionMode`) without applying the translation overlay. `title`/
 * `description` come back in English regardless of locale; prefer
 * `getLayerGroups()` for anything user-facing; this exists for callers
 * (e.g. group-membership checks) that only need structure, so they don't
 * pay for translation work whose result they'd never read.
 */
export function getLayerGroupStructure(): readonly LayerGroup[] {
  return registry.getLayerGroups();
}

/**
 * Returns every layer's structural fields (`id`, `defaultVisible`,
 * `dataSource`, etc.) without applying the translation overlay. `label`/
 * `description`/choropleth bucket labels come back in English regardless of
 * locale; prefer `getLayers()` for anything user-facing; this exists for
 * callers (e.g. `defaultVisible` id lookups) that only need structure, so
 * they don't pay for translation work whose result they'd never read.
 */
export function getLayerStructure(): readonly Layer[] {
  return registry.getLayers();
}
