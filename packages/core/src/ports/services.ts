import type { ClipboardPort } from "./clipboard";
import type { FileSaver } from "./files";
import type { LayerRegistry, LayerSource } from "./layers";
import type { LocationProvider } from "./location";
import type { MapAdapterFactory } from "./map";
import type { DevicePreferences } from "./preferences";
import type { RoutingProvider } from "./routing";
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
  /** Offers a file the ui built, such as exported shapes, as a download. */
  readonly fileSaver: FileSaver;
  readonly url: UrlState;
  readonly theme: ThemeSource;
  readonly preferences: DevicePreferences;
  readonly layers: LayerRegistry;
  /** Loads any feed layer's features and details, reading everything from its definition. */
  readonly layerSource: LayerSource;
  /**
   * Finds routes and travel-time areas. Optional: Karta ships no provider, so
   * a host that supplies none gets no routing, and the ui must not require it.
   */
  readonly routing?: RoutingProvider;
}
