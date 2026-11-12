// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerCatalogue } from "../ports/layers";
import type { LayerDefinition } from "./definition";
import { assertValidDefinitions, type ValidationOptions } from "./validate";

/**
 * A {@link LayerCatalogue} over a host's definitions. Each definition is
 * validated against the decoders and formatters the host registers, so a
 * broken definition fails when the app starts, with every problem named,
 * rather than when someone turns the layer on.
 */
export function createStaticLayerCatalogue(
  definitions: readonly LayerDefinition[],
  options: ValidationOptions,
): LayerCatalogue {
  const layers = Object.freeze([
    ...assertValidDefinitions(definitions, options),
  ]);
  return Object.freeze({ list: () => layers });
}
