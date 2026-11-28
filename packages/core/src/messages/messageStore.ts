// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { MessageCatalogue } from "../ports/messages";
import type { Services } from "../ports/services";
import type { LanguageCatalogue } from "./languageCatalogue";
import { resolveLanguage } from "./resolveLanguage";

/** The services a {@link MessageStore} reads. A whole `Services` will do. */
export type MessageStoreServices = Pick<
  Services,
  "messages" | "languages" | "settings" | "preferences"
>;

/** What a {@link MessageStore} holds. */
export interface MessageStoreState {
  /** The catalogue the interface speaks. */
  readonly messages: MessageCatalogue;
  /**
   * The tag whose messages could not be loaded, while `messages` is still the
   * language before it, or null when no load has failed.
   */
  readonly failed: string | null;
  /** Whether a load of {@link MessageStoreState.failed} is under way again. */
  readonly retrying: boolean;
}

/**
 * The messages an interface speaks, as a store for any framework or none. No
 * method uses `this`, so each can be passed on as it is, as in React's
 * `useSyncExternalStore(store.subscribe, store.getState, store.getInitialState)`.
 */
export interface MessageStore {
  /** The current state. The same object is returned until something changes. */
  getState(): MessageStoreState;
  /**
   * The state before any load: `Services.messages` and no failure. It is what
   * a server renders, so pass it as the server snapshot: a store that has
   * since loaded another language still hydrates a server's markup without a
   * mismatch.
   */
  getInitialState(): MessageStoreState;
  /**
   * Calls the listener after each change of state. The first subscription
   * starts the store, and its listener may be called before `subscribe`
   * returns. Returns the function that unsubscribes.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Loads the failed language again, even when the setting has not changed. It
   * does nothing when none has failed or while that load is under way.
   */
  retry(): void;
  /**
   * Reads other services from now on. The catalogue on screen stays until
   * theirs has loaded; with no `languages`, it is their `messages` at once.
   * Services that are the same four objects change nothing.
   */
  setServices(services: MessageStoreServices): void;
}

/** What the language to show is worked out from. */
interface LanguageInputs {
  readonly tag: string;
  readonly messages: MessageCatalogue;
  readonly languages: LanguageCatalogue;
  readonly choice: string | null;
  readonly browserLanguages: readonly string[];
}

/**
 * The load in flight, or the last one to finish, for one language, with the
 * inputs it was made under. A failed one is tried again only once the setting
 * or the browser's languages have changed, so a failure never loops.
 */
interface LanguageRequest extends LanguageInputs {
  readonly failed: boolean;
}

/** Whether two language lists hold the same tags in the same order. */
function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

/** Whether `request` already answers for `next`, so no load is needed. */
function answers(
  request: LanguageRequest | undefined,
  next: LanguageInputs,
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

/** Whether every input is the one last looked at, by identity. */
function unchanged(
  seen: LanguageInputs | undefined,
  next: LanguageInputs,
): boolean {
  return (
    seen !== undefined &&
    seen.tag === next.tag &&
    seen.messages === next.messages &&
    seen.languages === next.languages &&
    seen.choice === next.choice &&
    seen.browserLanguages === next.browserLanguages
  );
}

/** Whether a load returned a promise rather than a ready catalogue. */
function isPending(
  loaded: MessageCatalogue | Promise<MessageCatalogue>,
): loaded is Promise<MessageCatalogue> {
  return loaded instanceof Promise;
}

function stateOf(
  messages: MessageCatalogue,
  failed: string | null = null,
  retrying = false,
): MessageStoreState {
  return Object.freeze({ messages, failed, retrying });
}

function sameState(a: MessageStoreState, b: MessageStoreState): boolean {
  return (
    a.messages === b.messages &&
    a.failed === b.failed &&
    a.retrying === b.retrying
  );
}

function pickServices({
  messages,
  languages,
  settings,
  preferences,
}: MessageStoreServices): MessageStoreServices {
  return { messages, languages, settings, preferences };
}

function sameServices(a: MessageStoreServices, b: MessageStoreServices) {
  return (
    a.messages === b.messages &&
    a.languages === b.languages &&
    a.settings === b.settings &&
    a.preferences === b.preferences
  );
}

/**
 * Builds the {@link MessageStore} for `services`, so a language loads once
 * however many parts of a page read it.
 *
 * @remarks Without `Services.languages` the catalogue is `Services.messages`,
 *   always. With it, the language is resolved from the person's setting and
 *   the browser's languages (see {@link resolveLanguage}) and then loaded.
 *
 *   Building the store does nothing: until its first subscription the state is
 *   `Services.messages` and nothing is read, loaded or subscribed to, so it is
 *   safe on a server and when a framework builds it twice. While anything
 *   listens, it follows the settings and preferences stores, and it releases
 *   both with the last listener. A later subscription picks up what changed
 *   meanwhile, and does not repeat a load that is in flight, has succeeded, or
 *   has failed with the setting and the browser's languages as they were.
 *
 *   Every render until a load finishes uses `Services.messages` or the last
 *   catalogue that loaded, so a slow load never blanks the text. A load that
 *   finishes after another language was asked for is dropped. One that fails
 *   keeps the previous catalogue and warns, names the language in
 *   {@link MessageStoreState.failed}, and the language is requested again the
 *   next time the setting or the browser's languages change, even to the same
 *   tag, or when {@link MessageStore.retry} is called.
 */
export function createMessageStore(
  services: MessageStoreServices,
): MessageStore {
  let current = pickServices(services);
  let initial = stateOf(current.messages);
  let state = initial;
  let started = false;
  let requested: LanguageRequest | undefined;
  let seen: LanguageInputs | undefined;
  let releases: readonly (() => void)[] = [];
  const listeners = new Set<() => void>();

  function publish(next: MessageStoreState): void {
    if (sameState(state, next)) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function startLoad(inputs: LanguageInputs): void {
    const request = { ...inputs, failed: false };
    requested = request;
    const { tag, languages } = inputs;
    const failed = state.failed === tag ? tag : null;
    publish(stateOf(state.messages, failed, failed !== null));
    const succeed = (catalogue: MessageCatalogue) => {
      if (requested === request) {
        publish(stateOf(catalogue));
      }
    };
    const fail = (error: unknown) => {
      if (requested === request) {
        requested = { ...request, failed: true };
        publish(stateOf(state.messages, tag));
      }
      console.warn(`Could not load the "${tag}" language.`, error);
    };
    let loaded: MessageCatalogue | Promise<MessageCatalogue>;
    try {
      loaded = languages.load(tag);
    } catch (error) {
      fail(error);
      return;
    }
    if (isPending(loaded)) {
      loaded.then(succeed, fail);
      return;
    }
    succeed(loaded);
  }

  /** Brings the state in step with the services, when what it reads has changed. */
  function follow(): void {
    const { messages, languages, settings, preferences } = current;
    if (languages === undefined) {
      return;
    }
    const choice = settings.get().language;
    const browserLanguages = preferences.get().languages;
    const tag = resolveLanguage(
      choice,
      languages.languages.map((language) => language.tag),
      browserLanguages,
      languages.defaultLanguage,
    );
    const inputs = { tag, messages, languages, choice, browserLanguages };
    if (unchanged(seen, inputs)) {
      return;
    }
    seen = inputs;
    if (tag === messages.language) {
      requested = undefined;
      publish(stateOf(messages));
      return;
    }
    if (!answers(requested, inputs)) {
      startLoad(inputs);
    }
  }

  function release(): void {
    for (const stop of releases) {
      stop();
    }
    releases = [];
  }

  function connect(): void {
    const { languages, settings, preferences } = current;
    if (languages === undefined) {
      return;
    }
    releases = [
      settings.subscribe(() => follow()),
      preferences.subscribe(() => follow()),
    ];
    follow();
  }

  return {
    getState: () => state,
    getInitialState: () => initial,
    subscribe: (listener) => {
      const entry = () => listener();
      listeners.add(entry);
      if (listeners.size === 1) {
        started = true;
        connect();
      }
      return () => {
        if (listeners.delete(entry) && listeners.size === 0) {
          release();
        }
      };
    },
    retry: () => {
      if (requested?.failed) {
        startLoad(requested);
      }
    },
    setServices: (next) => {
      if (sameServices(current, next)) {
        return;
      }
      release();
      current = pickServices(next);
      if (initial.messages !== current.messages) {
        initial = stateOf(current.messages);
      }
      if (!started || current.languages === undefined) {
        requested = undefined;
        seen = undefined;
        publish(initial);
      }
      if (listeners.size > 0) {
        connect();
      }
    },
  };
}
