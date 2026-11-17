// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  type LanguageCatalogue,
  type MessageCatalogue,
  resolveLanguage,
  type Services,
} from "@mapcairn/core";
import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
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

/**
 * The load in flight, or the last one to finish, for one language, with the
 * inputs it was made under. A failed one is tried again only once the setting
 * or the browser's languages have changed, so a failure never loops.
 */
interface LanguageRequest {
  readonly tag: string;
  readonly messages: MessageCatalogue;
  readonly languages: LanguageCatalogue;
  readonly choice: string | null;
  readonly browserLanguages: readonly string[];
  readonly failed: boolean;
}

/** Whether two language lists hold the same tags in the same order. */
function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/** Whether `request` already answers for `next`, so no load is needed. */
function answers(
  request: LanguageRequest | undefined,
  next: Omit<LanguageRequest, "failed">,
): boolean {
  if (
    request === undefined ||
    request.tag !== next.tag ||
    request.messages !== next.messages ||
    request.languages !== next.languages
  ) {
    return false;
  }
  return (
    !request.failed ||
    (request.choice === next.choice &&
      sameTags(request.browserLanguages, next.browserLanguages))
  );
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
 *   another language was asked for is dropped. One that fails keeps the
 *   previous catalogue and warns, and the language is requested again the
 *   next time the setting or the browser's languages resolve, even to the
 *   same tag; a load that is in flight or has succeeded is not repeated.
 *   {@link ServicesProvider} mounts it.
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
  const requested = useRef<LanguageRequest>(undefined);

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
      requested.current = undefined;
      setActive(messages);
      return;
    }
    const inputs = { tag, messages, languages, choice, browserLanguages };
    if (answers(requested.current, inputs)) {
      return;
    }
    const request = { ...inputs, failed: false };
    requested.current = request;
    const succeed = (catalogue: MessageCatalogue) => {
      if (requested.current === request) {
        setActive(catalogue);
      }
    };
    const fail = (error: unknown) => {
      if (requested.current === request) {
        requested.current = { ...request, failed: true };
      }
      console.warn(`Could not load the "${tag}" language.`, error);
    };
    try {
      const loaded = languages.load(tag);
      if (isPending(loaded)) {
        loaded.then(succeed, fail);
      } else {
        succeed(loaded);
      }
    } catch (error) {
      fail(error);
    }
  }, [languages, messages, tag, choice, browserLanguages]);

  return (
    <ActiveMessagesContext.Provider
      value={languages === undefined ? messages : active}
    >
      {children}
    </ActiveMessagesContext.Provider>
  );
}
