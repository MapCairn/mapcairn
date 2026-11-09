import {
  type ClipboardPort,
  type DevicePreferencesValue,
  type LayerRegistry,
  type LocationProvider,
  type MapAdapterFactory,
  type ResolvedTheme,
  resolveTheme,
  type SearchProvider,
  type Settings,
  type ThemeChoice,
  type ThemeSource,
  type UrlState,
} from "@karta/core";
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

/** The location provider. Nothing is requested until a user action calls it. */
export function useLocationProvider(): LocationProvider {
  return useServices().location;
}

/** The clipboard port. */
export function useClipboard(): ClipboardPort {
  return useServices().clipboard;
}

/** The shareable URL state port. */
export function useUrlState(): UrlState {
  return useServices().url;
}

/** The theme source. Most components want {@link useTheme} instead. */
export function useThemeSource(): ThemeSource {
  return useServices().theme;
}

/** Device and accessibility preferences (reduced motion, fine pointer), updating live. */
export function usePreferences(): DevicePreferencesValue {
  const { preferences } = useServices();
  const subscribe = useCallback(
    (listener: () => void) => preferences.subscribe(listener),
    [preferences],
  );
  const getSnapshot = useCallback(() => preferences.get(), [preferences]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** The data layer registry: the host's layer definitions, or none. */
export function useLayers(): LayerRegistry {
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
