import {
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createLayerRegistry,
  type ResolvedTheme,
  type Services,
  THEME_ATTRIBUTE,
  type ThemeSource,
} from "@mapcairn/core";
import { CAIRN_FEATURES, CAIRNS_LAYER } from "./cairnsLayer";

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
 * The services the example runs on: the SDK's fakes, so nothing is requested
 * and no map engine is loaded, with a few scripted answers, one layer of its
 * own and a theme source that reaches the page. It offers the SDK's built-in
 * basemaps as they are: they name no preview image, so the picker shows each
 * one's plain swatch.
 */
export function createExampleServices(): Services {
  const services = createFakeServices({
    theme: new PageThemeSource(),
    layers: createLayerRegistry([CAIRNS_LAYER], {
      decoders: createDecoderRegistry(),
      formatters: createFormatterRegistry(),
    }),
    routing: undefined,
  });
  services.fakes.layerSource.setFeatures(CAIRNS_LAYER.id, CAIRN_FEATURES);
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
