// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type MessageCatalogue,
  resolveLanguage,
  type Services,
} from "@mapcairn/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

/** The active catalogue, or null outside {@link ActiveMessagesProvider}. */
export const ActiveMessagesContext = createContext<MessageCatalogue | null>(
  null,
);

/** Subscribes to a store whose server snapshot is its client one, as the other hooks do. */
function useStoreValue<T>(
  subscribe: (listener: () => void) => () => void,
  get: () => T,
): T {
  return useSyncExternalStore(subscribe, get, get);
}

/** Whether a load returned a promise rather than a ready catalogue. */
function isPending(
  loaded: MessageCatalogue | Promise<MessageCatalogue>,
): loaded is Promise<MessageCatalogue> {
  return loaded instanceof Promise;
}

/**
 * Keeps the catalogue the ui speaks, in one place for the whole tree, so a
 * language loads once however many components read it.
 *
 * @remarks Without `Services.languages` the catalogue is `Services.messages`,
 *   always. With it, the language is resolved from the person's setting and
 *   the browser's languages and then loaded. The first render, and every
 *   render until a load finishes, uses `Services.messages` or the last
 *   catalogue that loaded, so the first client render matches the server's
 *   and a slow load never blanks the text. A load that finishes after
 *   another language was asked for is dropped, and one that fails keeps the
 *   previous catalogue and warns. {@link ServicesProvider} mounts it.
 */
export function ActiveMessagesProvider({
  services,
  children,
}: {
  readonly services: Services;
  readonly children: ReactNode;
}) {
  const { messages, languages, settings, preferences } = services;
  const subscribeSettings = useCallback(
    (listener: () => void) => settings.subscribe(listener),
    [settings],
  );
  const subscribePreferences = useCallback(
    (listener: () => void) => preferences.subscribe(listener),
    [preferences],
  );
  const choice = useStoreValue(subscribeSettings, () =>
    settings.get(),
  ).language;
  const browserLanguages = useStoreValue(subscribePreferences, () =>
    preferences.get(),
  ).languages;
  const [active, setActive] = useState<MessageCatalogue>(messages);

  const tag =
    languages === undefined
      ? undefined
      : resolveLanguage(
          choice,
          languages.languages.map((language) => language.tag),
          browserLanguages,
          languages.defaultLanguage,
        );

  useEffect(() => {
    if (languages === undefined || tag === undefined) {
      return;
    }
    if (tag === messages.language) {
      setActive(messages);
      return;
    }
    let superseded = false;
    const fail = (error: unknown) => {
      console.warn(`Could not load the "${tag}" language.`, error);
    };
    try {
      const loaded = languages.load(tag);
      if (isPending(loaded)) {
        loaded.then((catalogue) => {
          if (!superseded) {
            setActive(catalogue);
          }
        }, fail);
      } else {
        setActive(loaded);
      }
    } catch (error) {
      fail(error);
    }
    return () => {
      superseded = true;
    };
  }, [languages, messages, tag]);

  return (
    <ActiveMessagesContext.Provider
      value={languages === undefined ? messages : active}
    >
      {children}
    </ActiveMessagesContext.Provider>
  );
}
