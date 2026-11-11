import {
  BASEMAPS,
  type BasemapDefinition,
  createBasemapCatalogue,
  createDecoderRegistry,
  createFakeServices,
  createFormatterRegistry,
  createLayerRegistry,
  DEFAULT_BASEMAP_ID,
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
 * The built-in basemaps without their preview images. The SDK's thumbnails
 * are paths on the reference host, which this app does not serve, so the
 * picker shows each basemap's plain swatch instead.
 */
function basemapsWithoutThumbnails(): BasemapDefinition[] {
  return BASEMAPS.map(({ thumbnail: _thumbnail, ...basemap }) => basemap);
}

/**
 * The services the example runs on: the SDK's fakes, so nothing is requested
 * and no map engine is loaded, with a few scripted answers, one layer of its
 * own and a theme source that reaches the page.
 */
export function createExampleServices(): Services {
  const services = createFakeServices({
    theme: new PageThemeSource(),
    layers: createLayerRegistry([CAIRNS_LAYER], {
      decoders: createDecoderRegistry(),
      formatters: createFormatterRegistry(),
    }),
    basemaps: createBasemapCatalogue(
      basemapsWithoutThumbnails(),
      DEFAULT_BASEMAP_ID,
    ),
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
