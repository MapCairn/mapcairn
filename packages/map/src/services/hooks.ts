// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  BUILT_IN_BASEMAP_CATALOGUE,
  type ClipboardPort,
  type DevicePreferencesValue,
  type FileOpener,
  type FileSaver,
  type LayerCatalogue,
  type LocationProvider,
  type MapAdapterFactory,
  type ResolvedTheme,
  type RoutingProvider,
  resolveTheme,
  type SearchProvider,
  type Settings,
  type SuggestionProvider,
  type ThemeChoice,
  type ThemeSource,
  type UrlState,
} from "@mapcairn/core";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useServices } from "./ServicesProvider";

/** The map adapter factory, used by the map host to pick an engine for a basemap. */
export function useMapAdapterFactory(): MapAdapterFactory {
  return useServices().createMapAdapter;
}

/** The place search provider. Debounce and cancellation live in `useSearch`, not here. */
export function useSearchProvider(): SearchProvider {
  return useServices().search;
}

/**
 * The suggestion provider, or `undefined` when the host supplies none. The
 * search pill suggests places as the person types only when it exists, so a
 * host without one keeps submit-only search. Nothing is requested until the
 * person has typed.
 */
export function useSuggestionProvider(): SuggestionProvider | undefined {
  return useServices().suggestions;
}

/**
 * The routing provider, or `undefined` when the host supplies none. The
 * Directions tool needs it, so a host without one gets no such tool. Nothing
 * is requested until a user action asks for a route or area.
 */
export function useRoutingProvider(): RoutingProvider | undefined {
  return useServices().routing;
}

/** The location provider. Nothing is requested until a user action calls it. */
export function useLocationProvider(): LocationProvider {
  return useServices().location;
}

/** The clipboard port. */
export function useClipboard(): ClipboardPort {
  return useServices().clipboard;
}

/** The file saver, which offers a file the ui built as a download. */
export function useFileSaver(): FileSaver {
  return useServices().fileSaver;
}

/**
 * The file opener, which asks the person for a file and reads it in the
 * browser, or `undefined` when the host supplies none. Shape import needs it,
 * so a host without one gets no Import control.
 */
export function useFileOpener(): FileOpener | undefined {
  return useServices().fileOpener;
}

/** The shareable URL state port. */
export function useUrlState(): UrlState {
  return useServices().url;
}

/** The theme source. Most components want {@link useTheme} instead. */
export function useThemeSource(): ThemeSource {
  return useServices().theme;
}

/** Device and accessibility preferences (reduced motion, fine pointer, save data), updating live. */
export function usePreferences(): DevicePreferencesValue {
  const { preferences } = useServices();
  const subscribe = useCallback(
    (listener: () => void) => preferences.subscribe(listener),
    [preferences],
  );
  const getSnapshot = useCallback(() => preferences.get(), [preferences]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Whether Save data mode is on: the person's own choice from Settings when
 * they made one, otherwise the device's signal (a data saver or a very slow
 * connection, where the browser reports one). Re-renders when either changes.
 */
export function useSaveData(): boolean {
  const { settings } = useSettings();
  const { saveData } = usePreferences();
  return settings.saveData ?? saveData;
}

/**
 * The basemaps on offer: the host's catalogue, or the built-in basemaps when
 * it supplies none.
 */
export function useBasemaps(): BasemapCatalogue {
  return useServices().basemaps ?? BUILT_IN_BASEMAP_CATALOGUE;
}

/** The data layer catalogue: the host's layer definitions, or none. */
export function useLayers(): LayerCatalogue {
  return useServices().layers;
}

/** What {@link useSettings} returns. */
export interface UseSettings {
  readonly settings: Settings;
  /** Merges a patch into the stored settings. */
  readonly update: (patch: Partial<Settings>) => void;
  /** False when storage is blocked, so changes will not be remembered. */
  readonly persistent: boolean;
}

/** Subscribes to the settings store. Re-renders only when a setting changes. */
export function useSettings(): UseSettings {
  const { settings: store } = useServices();
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const getSnapshot = useCallback(() => store.get(), [store]);
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const update = useCallback(
    (patch: Partial<Settings>) => {
      store.set(patch);
    },
    [store],
  );
  return { settings, update, persistent: store.persistent };
}

/** What {@link useTheme} returns. */
export interface UseTheme {
  /** What the user chose: system, light or dark. */
  readonly choice: ThemeChoice;
  /** What is actually shown. */
  readonly resolved: ResolvedTheme;
  readonly setChoice: (choice: ThemeChoice) => void;
}

/**
 * Combines the stored theme choice with the system preference, follows system
 * changes live without a reload, and reflects the result onto the document
 * through the theme source.
 */
export function useTheme(): UseTheme {
  const source = useThemeSource();
  const { settings, update } = useSettings();
  const subscribeSystem = useCallback(
    (listener: () => void) => source.subscribe(listener),
    [source],
  );
  const getSystem = useCallback(() => source.getSystemTheme(), [source]);
  const system = useSyncExternalStore(subscribeSystem, getSystem, getSystem);
  const resolved = resolveTheme(settings.theme, system);

  useEffect(() => {
    source.apply(resolved);
  }, [source, resolved]);

  const setChoice = useCallback(
    (choice: ThemeChoice) => {
      update({ theme: choice });
    },
    [update],
  );

  return { choice: settings.theme, resolved, setChoice };
}
