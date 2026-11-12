// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { BasemapCatalogue } from "../basemaps/basemaps";
import type { ClipboardPort } from "./clipboard";
import type { FileOpener, FileSaver } from "./files";
import type { LayerCatalogue, LayerSource } from "./layers";
import type { LocationProvider } from "./location";
import type { MapAdapterFactory } from "./map";
import type { DevicePreferences } from "./preferences";
import type { RoutingProvider } from "./routing";
import type { SearchProvider } from "./search";
import type { SettingsStore } from "./settings";
import type { SuggestionProvider } from "./suggestions";
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
  /**
   * Suggests places while the person types. Optional: a host that supplies
   * none gets no suggestions and keeps submit-only search, and the ui must not
   * require it. Everything typed is sent to the provider, so the host's
   * privacy text must say so.
   */
  readonly suggestions?: SuggestionProvider;
  readonly location: LocationProvider;
  readonly settings: SettingsStore;
  readonly clipboard: ClipboardPort;
  /** Offers a file the ui built, such as exported shapes, as a download. */
  readonly fileSaver: FileSaver;
  /**
   * Asks the person for a file, such as shapes to import, and reads it in the
   * browser. Optional: a host that supplies none gets no import, and the ui
   * must not require it.
   */
  readonly fileOpener?: FileOpener;
  readonly url: UrlState;
  readonly theme: ThemeSource;
  readonly preferences: DevicePreferences;
  readonly layers: LayerCatalogue;
  /** Loads any feed layer's features and details, reading everything from its definition. */
  readonly layerSource: LayerSource;
  /**
   * Finds routes and travel-time areas. Optional: MapCairn ships no provider, so
   * a host that supplies none gets no routing, and the ui must not require it.
   */
  readonly routing?: RoutingProvider;
  /**
   * The basemaps the host offers, with their default. Optional: without it
   * the ui offers the built-in basemaps. A host adds a provider whose terms
   * it, and not the SDK, accepts by building a catalogue that includes it.
   */
  readonly basemaps?: BasemapCatalogue;
}
