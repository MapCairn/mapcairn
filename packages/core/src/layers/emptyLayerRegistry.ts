// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerRegistry } from "../ports/layers";
import type { LayerDefinition } from "./definition";

const NO_LAYERS: readonly LayerDefinition[] = Object.freeze([]);

/**
 * The {@link LayerRegistry} for a host that supplies no data layers, so the
 * sheet's Layers section stays hidden. Frozen and stateless, so one instance
 * can be shared safely; a host with layers supplies its own registry.
 */
export const emptyLayerRegistry: LayerRegistry = Object.freeze({
  list: () => NO_LAYERS,
});
