// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { LayerCatalogue } from "../ports/layers";
import { createFixedCatalogue, readyState } from "./catalogueState";
import type { LayerDefinition } from "./definition";
import { assertValidDefinitions, type ValidationOptions } from "./validate";

/**
 * A {@link LayerCatalogue} over definitions that are known when the app is
 * built. It is ready on the first read, on the server and in the browser, and
 * never changes. Each definition is validated against the decoders and
 * formatters the host registers, so a broken definition fails when the app
 * starts, with every problem named, rather than when someone turns the layer
 * on.
 *
 * @throws An error listing every problem, each prefixed with its layer id.
 *   Use `createRuntimeLayerCatalogue` for definitions that can be wrong
 *   without stopping the app.
 */
export function createStaticLayerCatalogue(
  definitions: readonly LayerDefinition[],
  options: ValidationOptions,
): LayerCatalogue {
  const layers = Object.freeze([
    ...assertValidDefinitions(definitions, options),
  ]);
  return createFixedCatalogue(readyState(layers));
}
