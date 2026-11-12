// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerCatalogue } from "../ports/layers";
import { createFixedCatalogue, readyState } from "./catalogueState";

/**
 * The {@link LayerCatalogue} for a host that supplies no data layers, so the
 * sheet's Layers section stays hidden. Ready with no layers, frozen and
 * never changing, so one instance can be shared safely; a host with layers
 * supplies its own catalogue.
 */
export const emptyLayerCatalogue: LayerCatalogue = createFixedCatalogue(
  readyState(Object.freeze([])),
);
