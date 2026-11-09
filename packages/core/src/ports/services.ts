import type { ClipboardPort } from "./clipboard";
import type { LayerRegistry } from "./layers";
import type { LocationProvider } from "./location";
import type { MapAdapterFactory } from "./map";
import type { SearchProvider } from "./search";
import type { SettingsStore } from "./settings";
import type { ThemeSource } from "./theme";
import type { UrlState } from "./url";

/**
 * Everything the ui may use from outside itself. The composition root builds
 * one of these from real adapters (or fakes, in tests) and provides it through
 * React context. Components never import an adapter or a browser global.
 */
export interface Services {
  readonly createMapAdapter: MapAdapterFactory;
  readonly search: SearchProvider;
  readonly location: LocationProvider;
  readonly settings: SettingsStore;
  readonly clipboard: ClipboardPort;
  readonly url: UrlState;
  readonly theme: ThemeSource;
  readonly layers: LayerRegistry;
}
