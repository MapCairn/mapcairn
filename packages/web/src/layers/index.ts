// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFormatterRegistry,
  createMessageCatalogue,
  createStaticLayerCatalogue,
  EN_GB_CATALOGUE,
  type LayerCatalogue,
  type LayerDefinition,
  resolveText,
} from "@mapcairn/core";

/**
 * The decoders the host's definitions may name. The built-in `geojson`
 * covers every layer so far; a feed in another format adds its decoder here
 * by name.
 */
export const LAYER_DECODERS = createDecoderRegistry();

/** The formatters the host's card and list templates may name. */
export const LAYER_FORMATTERS = createFormatterRegistry();

/**
 * Every file in `definitions/` that default-exports a definition, so adding
 * a layer is adding a file: nothing here or elsewhere lists them.
 */
const modules = import.meta.glob<LayerDefinition>("./definitions/*.ts", {
  eager: true,
  import: "default",
});

/** The words the host's catalogue order is judged by, so it is the same in every language. */
const ENGLISH = createMessageCatalogue(
  "en-GB",
  EN_GB_CATALOGUE,
  EN_GB_CATALOGUE,
);

/** A definition's group and name in English, joined so groups sort before names. */
function sortKey(definition: LayerDefinition): string {
  return `${resolveText(ENGLISH, definition.group)}\u0000${resolveText(ENGLISH, definition.name)}`;
}

/** English collation, fixed so the server and the browser order layers alike. */
const ENGLISH_ORDER = new Intl.Collator("en-GB");

/**
 * The host's layers, ordered by group and then by name, as the English words
 * read. The order is fixed at start-up and does not follow the language.
 */
export const LAYER_DEFINITIONS: readonly LayerDefinition[] = Object.values(
  modules,
).sort((a, b) => ENGLISH_ORDER.compare(sortKey(a), sortKey(b)));

/**
 * The catalogue the composition root hands the ui. It validates every
 * definition once, so a broken one stops the app at start-up in development
 * and in tests rather than when someone turns it on.
 */
export function createHostLayerCatalogue(): LayerCatalogue {
  return createStaticLayerCatalogue(LAYER_DEFINITIONS, {
    decoders: LAYER_DECODERS,
    formatters: LAYER_FORMATTERS,
  });
}
