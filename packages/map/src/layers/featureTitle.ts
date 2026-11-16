// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  cardOf,
  type FormatContext,
  type FormatterRegistry,
  formatTemplate,
  hasCard,
  type LayerDefinition,
  type LayerFeature,
  resolveText,
} from "@mapcairn/core";

/**
 * The title of a feature's card, from its layer's card template (a feed's own
 * or a tile layer's `identify` card), or the layer's name (read in the context's language) when the layer has
 * no card or the template fills to nothing.
 */
export function featureTitle(
  definition: LayerDefinition,
  feature: LayerFeature,
  formatters: FormatterRegistry,
  context: FormatContext,
): string {
  if (!hasCard(definition)) {
    return resolveText(context.catalogue, definition.name);
  }
  return (
    formatTemplate(
      cardOf(definition).title,
      feature.fields,
      formatters,
      context,
    ) ?? resolveText(context.catalogue, definition.name)
  );
}
