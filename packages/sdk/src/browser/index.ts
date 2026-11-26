// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors

/**
 * A map for a page with no React and no build step: `mountMap(element)` draws
 * a map and returns a handle. The module brings everything it needs, so the
 * page serves only the files of this subpath, from its own origin.
 * @packageDocumentation
 */

export type {
  BasemapAttributionEntry,
  BasemapDefinition,
  BasemapSource,
  Bounds,
  DefinitionText,
  HostText,
  LatLng,
  LayerErrorKind,
  LocateOptions,
  LocationErrorKind,
  LocationFix,
  LocationProvider,
  LocationWatchHandlers,
  MapEngineErrorReason,
  Message,
  MessageCatalogue,
  MessageKey,
  MessageParams,
  SearchErrorKind,
  SearchOptions,
  SearchProvider,
  SearchResult,
  SuggestionProvider,
  SuggestOptions,
  ThemeChoice,
  ViewState,
} from "@mapcairn/core";
export {
  LayerError,
  LocationError,
  MapEngineError,
  PortAbortError,
  SearchError,
} from "@mapcairn/core";

import "@mapcairn/theme/tokens.css";
import "@mapcairn/map/styles.css";
import "@mapcairn/adapter-maplibre/styles.css";

export { MountMapError, type MountMapErrorKind } from "./MountMapError";
export { mountMap } from "./mountMap";
export type {
  MapEvents,
  MapHandle,
  MapUpdate,
  MountMapOptions,
  MountServices,
  SetViewOptions,
} from "./types";
