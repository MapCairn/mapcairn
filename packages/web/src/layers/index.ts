import {
  createDecoderRegistry,
  createFormatterRegistry,
  createLayerRegistry,
  type LayerDefinition,
  type LayerRegistry,
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

/** The host's layers, ordered by group and then by name. */
export const LAYER_DEFINITIONS: readonly LayerDefinition[] = Object.values(
  modules,
).sort((a, b) =>
  `${a.group}\u0000${a.name}`.localeCompare(`${b.group}\u0000${b.name}`),
);

/**
 * The registry the composition root hands the ui. It validates every
 * definition once, so a broken one stops the app at start-up in development
 * and in tests rather than when someone turns it on.
 */
export function createHostLayerRegistry(): LayerRegistry {
  return createLayerRegistry(LAYER_DEFINITIONS, {
    decoders: LAYER_DECODERS,
    formatters: LAYER_FORMATTERS,
  });
}
