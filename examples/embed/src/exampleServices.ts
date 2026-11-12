// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createRuntimeLayerCatalogue,
  type ResolvedTheme,
  type RuntimeLayerCatalogue,
  type Services,
  type SkippedDefinition,
  THEME_ATTRIBUTE,
  type ThemeSource,
} from "@mapcairn/core";
import { CAIRN_FEATURES, CAIRNS_LAYER } from "./cairnsLayer";
import { mapServerLayers } from "./mapServerLayers";
import {
  SAMPLE_SERVER_FEATURES,
  SAMPLE_SERVER_LAYERS,
} from "./sampleServerLayers";

/**
 * A {@link ThemeSource} that writes the resolved theme onto the page, so the
 * theme chosen in Settings takes effect. It reports a light system theme:
 * following the system's preference needs `matchMedia`, which belongs in a
 * host's own adapter.
 */
export class PageThemeSource implements ThemeSource {
  getSystemTheme(): ResolvedTheme {
    return "light";
  }

  subscribe(): () => void {
    return () => undefined;
  }

  apply(theme: ResolvedTheme): void {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  }
}

/**
 * Says, in the console, which layer was left out and why: one line for each,
 * with the path of every problem. A host would send these to its own log. The
 * Layers section shows a person only that some layers could not be shown.
 */
export function logSkippedLayers(skipped: readonly SkippedDefinition[]): void {
  for (const { id, problems } of skipped) {
    console.warn(
      `Layer ${id ?? "(no id)"} was left out: ${problems.join("; ")}`,
    );
  }
}

/**
 * The example's layers, supplied as a host with a server of its own would
 * supply them: a runtime catalogue whose `load` returns one layer written
 * by hand and the layers `mapServerLayers` makes from what the sample server
 * says about them. `load` never requests anything. The catalogue validates
 * each definition alone, so the layer the mapper cannot map is skipped and
 * `onSkipped` is told why.
 */
export function createExampleCatalogue(
  onSkipped: (skipped: readonly SkippedDefinition[]) => void,
): RuntimeLayerCatalogue {
  return createRuntimeLayerCatalogue({
    load: () =>
      Promise.resolve([CAIRNS_LAYER, ...mapServerLayers(SAMPLE_SERVER_LAYERS)]),
    options: {
      decoders: createDecoderRegistry(),
      formatters: createFormatterRegistry(),
    },
    onSkipped,
  });
}

/**
 * The services the example runs on: the SDK's fakes, so nothing is requested
 * and no map engine is loaded, with a few scripted answers, the layers of
 * {@link createExampleCatalogue} and a theme source that reaches the page. Its
 * store of selected features is the `MemoryFeatureSelection` that
 * `createFakeServices` builds; the reference site supplies none. It offers the
 * SDK's built-in basemaps as they are: they name no preview image, so the
 * picker shows each one's plain swatch.
 */
export function createExampleServices(): Services {
  const services = createFakeServices({
    theme: new PageThemeSource(),
    layers: createExampleCatalogue(logSkippedLayers),
    routing: undefined,
  });
  services.fakes.layerSource.setFeatures(CAIRNS_LAYER.id, CAIRN_FEATURES);
  for (const [id, features] of Object.entries(SAMPLE_SERVER_FEATURES)) {
    services.fakes.layerSource.setFeatures(id, features);
  }
  services.fakes.search.setDefaultResults([
    {
      id: "example-cairn",
      label: "Example cairn",
      secondaryLabel: "A scripted search result",
      centre: { lat: 57.05, lng: -3.65 },
    },
  ]);
  return services;
}
