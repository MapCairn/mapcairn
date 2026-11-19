// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type BasemapCatalogue,
  BUILT_IN_BASEMAP_CATALOGUE,
  type ClipboardPort,
  type DefinitionText,
  type DevicePreferencesValue,
  type FeatureQuery,
  type FeatureSelection,
  type FileOpener,
  type FileSaver,
  formatMessage,
  type LanguageCatalogue,
  type LayerCatalogue,
  type LocationProvider,
  type MapAdapterFactory,
  type Message,
  type MessageCatalogue,
  type ResolvedTheme,
  type RoutingProvider,
  resolveText,
  resolveTheme,
  type SearchProvider,
  type Settings,
  type SuggestionProvider,
  type ThemeChoice,
  type ThemeSource,
  type UrlState,
} from "@mapcairn/core";
import {
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  ActiveMessagesContext,
  type LanguageLoad,
  LanguageLoadContext,
} from "./activeMessages";
import { ENGLISH_MESSAGES } from "./englishMessages";
import { useOptionalServices, useServices } from "./ServicesProvider";

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

/**
 * The active message catalogue, for `t`/`plural`/`list` calls that look up
 * copy by key instead of writing it inline. With `Services.languages` it is
 * the language the person's setting, or else the browser's languages, resolve
 * to; the catalogue changes when either does, and keeps the previous one while
 * a lazily loaded language is still arriving. Without it, it is always
 * `Services.messages`.
 */
export function useMessages(): MessageCatalogue {
  const services = useServices();
  return useContext(ActiveMessagesContext) ?? services.messages;
}

/**
 * Reads a definition's text in the active language: a message key is looked
 * up in the catalogue, a plain string is returned as written (see
 * `resolveText`). The function is stable while the catalogue is.
 */
export function useResolveText(): (text: DefinitionText) => string {
  const messages = useMessages();
  return useCallback((text) => resolveText(messages, text), [messages]);
}

/**
 * As {@link useMessages}, but without a {@link ServicesProvider} above it the
 * SDK's English catalogue, so a piece a consumer may render on its own (the
 * skip link, a status message) keeps working. Inside a provider it is the
 * active catalogue.
 */
export function useOptionalMessages(): MessageCatalogue {
  const services = useOptionalServices();
  const active = useContext(ActiveMessagesContext);
  return active ?? services?.messages ?? ENGLISH_MESSAGES;
}

/**
 * The languages the host offers, or `undefined` when it offers none to choose
 * between. The Settings panel shows its language switcher only when there is
 * more than one.
 */
export function useLanguages(): LanguageCatalogue | undefined {
  return useServices().languages;
}

/**
 * Whether the messages for the language the person chose have failed to load,
 * and a way to try again, or `undefined` when the host offers no languages. The
 * interface stays in the language it was in until a load succeeds, so a status
 * built from this reads in that language. {@link LanguageLoad.retry} also works
 * when the setting has not changed, which a failed load otherwise waits for.
 */
export function useLanguageLoad(): LanguageLoad | undefined {
  return useContext(LanguageLoadContext) ?? undefined;
}

/**
 * Formats a core {@link Message} (a key and its parameters) with the active
 * catalogue, for text a component shows or hands on as a string. The function
 * is stable while the catalogue is.
 */
export function useFormatMessage(): (message: Message) => string {
  const messages = useMessages();
  return useCallback(
    (message: Message) => formatMessage(messages, message),
    [messages],
  );
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
 * Whether the browser says the device has a connection, updating live. It is
 * a hint: a device can report online with no route, and `true` where the host
 * gives no signal.
 */
export function useOnline(): boolean {
  return usePreferences().online !== false;
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

/**
 * The data layer catalogue: a store of the host's layer definitions and
 * whether they have loaded. Read it with `useSyncExternalStore` and pass
 * `getState` as the server snapshot, as `useDataLayers` does.
 */
export function useLayers(): LayerCatalogue {
  return useServices().layers;
}

/**
 * The store of selected features, or `undefined` when the host supplies none.
 * Nothing in the ui selects a feature without it. A component that needs the
 * set to follow changes reads it with `useSyncExternalStore`, passing
 * `getState` as the server snapshot.
 */
export function useSelectionStore(): FeatureSelection | undefined {
  return useServices().selection;
}

/**
 * The query for the features inside a shape, or `undefined` when the host
 * supplies none. Selecting by shape needs it, so a host without one offers no
 * such action. Nothing is requested until a user action asks.
 */
export function useFeatureQuery(): FeatureQuery | undefined {
  return useServices().featureQuery;
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
