// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  createMessageStore,
  type MessageCatalogue,
  type MessageStore,
  type MessageStoreState,
  type Services,
} from "@mapcairn/core";
import {
  createContext,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

/** The active catalogue, or null outside {@link ActiveMessagesProvider}. */
export const ActiveMessagesContext = createContext<MessageCatalogue | null>(
  null,
);

/** What {@link useLanguageLoad} returns. */
export interface LanguageLoad {
  /**
   * The tag whose messages could not be loaded, while the interface is still in
   * the language before it, or null when no load has failed.
   */
  readonly failed: string | null;
  /** Whether a load of {@link LanguageLoad.failed} is under way again. */
  readonly retrying: boolean;
  /** Loads the failed language again. It does nothing when none has failed. */
  readonly retry: () => void;
}

/**
 * The state of the language load, or null outside {@link ActiveMessagesProvider}
 * and for a host with no `Services.languages`.
 */
export const LanguageLoadContext = createContext<LanguageLoad | null>(null);

/**
 * Reads a message store. A server render and the hydration of it read the
 * store's initial state, so they match even for a store that has since loaded
 * another language.
 */
export function useMessageStoreState(store: MessageStore): MessageStoreState {
  return useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getInitialState,
  );
}

/**
 * Keeps the catalogue the ui speaks, in one place for the whole tree, so a
 * language loads once however many components read it. It reads `core`'s
 * message store (see `createMessageStore`), which it makes from the services
 * and keeps for as long as it is mounted, handing it the services of each
 * render.
 *
 * @remarks Without `Services.languages` the catalogue is `Services.messages`,
 *   always, and `LanguageLoadContext` is null. With it, `LanguageLoadContext`
 *   says which language failed and offers a retry that asks for it again
 *   whatever the setting is. {@link ServicesProvider} mounts it.
 */
export function ActiveMessagesProvider({
  services,
  children,
}: {
  readonly services: Services;
  readonly children: ReactNode;
}) {
  const { messages, languages, settings, preferences } = services;
  const [store] = useState(() => createMessageStore(services));
  useEffect(() => {
    store.setServices({ messages, languages, settings, preferences });
  }, [store, messages, languages, settings, preferences]);
  const { messages: active, failed, retrying } = useMessageStoreState(store);
  const load = useMemo(
    () => ({ failed, retrying, retry: store.retry }),
    [failed, retrying, store],
  );

  return (
    <ActiveMessagesContext.Provider
      value={languages === undefined ? messages : active}
    >
      <LanguageLoadContext.Provider
        value={languages === undefined ? null : load}
      >
        {children}
      </LanguageLoadContext.Provider>
    </ActiveMessagesContext.Provider>
  );
}
