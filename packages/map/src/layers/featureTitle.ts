// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type FormatContext,
  type FormatterRegistry,
  formatTemplate,
  isFeedLayer,
  type LayerDefinition,
  type LayerFeature,
} from "@mapcairn/core";

/**
 * The title of a feature's card, from its layer's card template, or the
 * layer's name when the layer has no card or the template fills to nothing.
 */
export function featureTitle(
  definition: LayerDefinition,
  feature: LayerFeature,
  formatters: FormatterRegistry,
  context: FormatContext,
): string {
  if (!isFeedLayer(definition)) {
    return definition.name;
  }
  return (
    formatTemplate(
      definition.card.title,
      feature.fields,
      formatters,
      context,
    ) ?? definition.name
  );
}
