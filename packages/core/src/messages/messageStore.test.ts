// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeServices } from "../fakes/createFakeServices";
import { FakeMessageCatalogue } from "../fakes/FakeMessageCatalogue";
import type { MessageCatalogue } from "../ports/messages";
import type { DevicePreferencesValue } from "../ports/preferences";
import { createLanguageCatalogue } from "./languageCatalogue";
import { createMessageStore, type MessageStore } from "./messageStore";

const ENGLISH = new FakeMessageCatalogue({ language: "en-GB" });
const AFRIKAANS = new FakeMessageCatalogue({ language: "af" });
const OFFERED = [
  { tag: "en-GB", label: "English" },
  { tag: "af", label: "Afrikaans" },
];

type Load = (tag: string) => MessageCatalogue | Promise<MessageCatalogue>;

interface Deferred {
  readonly promise: Promise<MessageCatalogue>;
  readonly resolve: (catalogue: MessageCatalogue) => void;
  readonly reject: (error: Error) => void;
}

function defer(): Deferred {
  let resolve!: Deferred["resolve"];
  let reject!: Deferred["reject"];
  const promise = new Promise<MessageCatalogue>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Lets every settled promise run its handlers. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0));

const ready: Load = (tag) => (tag === "af" ? AFRIKAANS : ENGLISH);

/** A preferences store whose languages a test replaces. */
function scriptedPreferences(languages: readonly string[]) {
  let value: DevicePreferencesValue = {
    reducedMotion: false,
    finePointer: true,
    languages,
  };
  const listeners = new Set<(next: DevicePreferencesValue) => void>();
  return {
    listeners,
    get: () => value,
    subscribe: (listener: (next: DevicePreferencesValue) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    speak(next: readonly string[]) {
      value = { ...value, languages: next };
      for (const listener of listeners) {
        listener(value);
      }
    },
  };
}

interface Options {
  readonly load?: Load;
  readonly language?: string | null;
  readonly languages?: readonly string[];
}

function setup({
  load = ready,
  language = null,
  languages = [],
}: Options = {}) {
  const preferences = scriptedPreferences(languages);
  const loader = vi.fn(load);
  const services = {
    ...createFakeServices({
      messages: ENGLISH,
      languages: createLanguageCatalogue(OFFERED, "en-GB", loader),
    }),
    preferences,
  };
  services.settings.set({ language });
  const store = createMessageStore(services);
  const choose = (tag: string | null) => {
    services.settings.set({ language: tag });
  };
  const listen = () => {
    const listener = vi.fn();
    return { listener, stop: store.subscribe(listener) };
  };
  const loadsOf = (tag: string) =>
    loader.mock.calls.filter(([asked]) => asked === tag).length;
  return { store, services, preferences, loader, choose, listen, loadsOf };
}

const spoken = (store: MessageStore) => store.getState().messages.language;
const failure = (store: MessageStore) => {
  const { failed, retrying } = store.getState();
  return `${failed ?? "ok"}${retrying ? " retrying" : ""}`;
};

/** A loader whose Afrikaans load fails until `recover` is called. */
function failingThenWorking() {
  let offline = true;
  const load: Load = (tag) => {
    if (tag !== "af") {
      return ENGLISH;
    }
    return offline
      ? Promise.reject(new Error("offline"))
      : Promise.resolve(AFRIKAANS);
  };
  return {
    load,
    recover: () => {
      offline = false;
    },
  };
}

const alwaysOffline: Load = (tag) =>
  tag === "af" ? Promise.reject(new Error("offline")) : ENGLISH;

const throwing: Load = (tag) => {
  if (tag === "af") {
    throw new Error("no messages");
  }
  return ENGLISH;
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createMessageStore before its first subscription", () => {
  it("does nothing: no load, even a ready one, and no subscription to anything", () => {
    const { services, preferences, loader } = setup({ language: "af" });
    const settings = vi.spyOn(services.settings, "subscribe");

    const first = createMessageStore(services);
    const second = createMessageStore(services);
    first.retry();

    expect(first.getState()).toEqual({
      messages: ENGLISH,
      failed: null,
      retrying: false,
    });
    expect(second.getState().messages).toBe(ENGLISH);
    expect(loader).not.toHaveBeenCalled();
    expect(settings).not.toHaveBeenCalled();
    expect(preferences.listeners.size).toBe(0);
  });

  it("keeps its initial state, for a server snapshot, once another language has loaded", () => {
    const { store, listen } = setup({ language: "af" });
    const before = store.getState();

    listen();

    expect(spoken(store)).toBe("af");
    expect(store.getInitialState()).toBe(before);
    expect(store.getInitialState().messages).toBe(ENGLISH);
  });
});

describe("createMessageStore's state", () => {
  it("is the same object until something changes, and tells nobody about a change that alters nothing", () => {
    const { store, services, preferences, listen } = setup();
    const { listener } = listen();
    const before = store.getState();

    services.settings.set({ units: "imperial" });
    preferences.speak([]);

    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("is a new object, announced once, when a ready language is chosen", () => {
    const { store, choose, listen } = setup();
    const { listener } = listen();
    const before = store.getState();

    choose("af");

    expect(store.getState()).not.toBe(before);
    expect(store.getState()).toBe(store.getState());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tells a listener about a load made by its own subscription", () => {
    const { listen } = setup({ language: "af" });
    expect(listen().listener).toHaveBeenCalledTimes(1);
  });

  it("can be read without binding", () => {
    const { store } = setup();
    const { getState, getInitialState, subscribe } = store;
    const stop = subscribe(() => {});
    expect(getState()).toBe(getInitialState());
    stop();
  });
});

describe("createMessageStore without a language catalogue", () => {
  it("is the services' catalogue whatever the setting says, and follows nothing", () => {
    const { services, preferences } = setup({ language: "af" });
    const settings = vi.spyOn(services.settings, "subscribe");
    const store = createMessageStore({ ...services, languages: undefined });

    store.subscribe(() => {});

    expect(spoken(store)).toBe("en-GB");
    expect(settings).not.toHaveBeenCalled();
    expect(preferences.listeners.size).toBe(0);
  });
});

describe("createMessageStore choosing a language", () => {
  it("speaks the default language when nothing else matches, loading nothing", () => {
    const { store, loader, listen } = setup();
    listen();
    expect(spoken(store)).toBe("en-GB");
    expect(loader).not.toHaveBeenCalled();
  });

  it("follows the browser's languages while no choice is made", () => {
    const { store, preferences, listen } = setup({
      languages: ["fr", "af-ZA"],
    });
    listen();
    expect(spoken(store)).toBe("af");
    preferences.speak(["en"]);
    expect(spoken(store)).toBe("en-GB");
  });

  it("prefers the person's choice to the browser's languages, and goes back to following them", () => {
    const { store, choose, listen } = setup({
      languages: ["af"],
      language: "en-GB",
    });
    listen();
    expect(spoken(store)).toBe("en-GB");
    choose("af");
    expect(spoken(store)).toBe("af");
    choose("en-GB");
    expect(spoken(store)).toBe("en-GB");
    choose(null);
    expect(spoken(store)).toBe("af");
  });

  it("ignores a stored choice the host does not offer", () => {
    const { store, listen } = setup({ language: "fr" });
    listen();
    expect(spoken(store)).toBe("en-GB");
  });

  it("keeps the previous catalogue while a lazy load is pending, then swaps it in", async () => {
    const pending = defer();
    const { store, choose, listen } = setup({ load: () => pending.promise });
    listen();
    choose("af");
    expect(spoken(store)).toBe("en-GB");
    pending.resolve(AFRIKAANS);
    await settle();
    expect(spoken(store)).toBe("af");
  });

  it("ignores a load that finishes after the person chose another language", async () => {
    const slow = defer();
    const { store, choose, listen } = setup({ load: () => slow.promise });
    listen();
    choose("af");
    choose("en-GB");
    slow.resolve(AFRIKAANS);
    await settle();
    expect(spoken(store)).toBe("en-GB");
  });

  it("ignores, but still warns about, a failure that arrives after another choice", async () => {
    const slow = defer();
    const { store, choose, listen } = setup({ load: () => slow.promise });
    listen();
    choose("af");
    choose("en-GB");
    slow.reject(new Error("offline"));
    await settle();
    expect(failure(store)).toBe("ok");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not load again for the same language", () => {
    const { choose, listen, loadsOf, services } = setup();
    listen();
    choose("af");
    choose("af");
    services.settings.set({ units: "imperial" });
    expect(loadsOf("af")).toBe(1);
  });
});

describe("createMessageStore when a load fails", () => {
  it("keeps the previous catalogue, names the language and warns when a load rejects", async () => {
    const error = new Error("offline");
    const { store, choose, listen } = setup({
      load: () => Promise.reject(error),
    });
    listen();
    choose("af");
    await settle();
    expect(spoken(store)).toBe("en-GB");
    expect(failure(store)).toBe("af");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Could not load the "af" language.',
      error,
    );
  });

  it("does the same when a load throws", () => {
    const { store, choose, listen } = setup({ load: throwing });
    listen();
    choose("af");
    expect(spoken(store)).toBe("en-GB");
    expect(failure(store)).toBe("af");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not take a listener's own error for a failed load", () => {
    const { store, choose } = setup();
    store.subscribe(() => {
      throw new Error("the listener's own");
    });
    expect(() => choose("af")).toThrow("the listener's own");
    expect(failure(store)).toBe("ok");
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries when the language is resolved again, and ends in the chosen language", async () => {
    const { load, recover } = failingThenWorking();
    const { store, choose, listen, loadsOf } = setup({
      load,
      languages: ["af"],
    });
    listen();
    await settle();
    choose("en-GB");
    choose("af");
    await settle();
    expect(spoken(store)).toBe("en-GB");
    expect(loadsOf("af")).toBe(2);
    recover();
    choose(null);
    await settle();
    expect(spoken(store)).toBe("af");
    expect(loadsOf("af")).toBe(3);
  });

  it("retries a same-tag failure when the choice changes, once, and does not loop when that fails too", async () => {
    const { store, choose, listen, loader, services } = setup({
      load: alwaysOffline,
      language: "af",
      languages: ["af"],
    });
    listen();
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    choose(null);
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(spoken(store)).toBe("en-GB");
    expect(warn).toHaveBeenCalledTimes(2);
    services.settings.set({ units: "imperial" });
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the browser reports the same languages in a new array", async () => {
    const { preferences, listen, loader } = setup({
      load: alwaysOffline,
      languages: ["af"],
    });
    listen();
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    preferences.speak(["af"]);
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    preferences.speak(["af", "en"]);
    await settle();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("does not retry for an unrelated change after the choice changed while the load was in flight", async () => {
    const slow = defer();
    const { choose, listen, loader, services } = setup({
      load: () => slow.promise,
      language: "af",
      languages: ["af"],
    });
    listen();
    choose(null);
    slow.reject(new Error("offline"));
    await settle();
    services.settings.set({ units: "imperial" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("retries on request, says so while it does, then swaps the language in", async () => {
    const { load, recover } = failingThenWorking();
    const { store, listen, loadsOf } = setup({ load, language: "af" });
    listen();
    await settle();
    recover();
    store.retry();
    expect(failure(store)).toBe("af retrying");
    await settle();
    expect(failure(store)).toBe("ok");
    expect(spoken(store)).toBe("af");
    expect(loadsOf("af")).toBe(2);
  });

  it("keeps the failure when the retry fails too", async () => {
    const { store, listen, loadsOf } = setup({
      load: alwaysOffline,
      language: "af",
    });
    listen();
    await settle();
    store.retry();
    await settle();
    expect(failure(store)).toBe("af");
    expect(spoken(store)).toBe("en-GB");
    expect(loadsOf("af")).toBe(2);
  });

  it("does not start a second load for a retry already under way", () => {
    const slow = defer();
    let first = true;
    const { store, listen, loader } = setup({
      load: () => {
        if (first) {
          first = false;
          throw new Error("offline");
        }
        return slow.promise;
      },
      language: "af",
    });
    listen();
    store.retry();
    store.retry();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("clears the failure when the person chooses another language", async () => {
    const { store, choose, listen } = setup({
      load: alwaysOffline,
      language: "af",
    });
    listen();
    await settle();
    choose("en-GB");
    expect(failure(store)).toBe("ok");
  });

  it("retries the latest request, not a stale one, after the setting changed during the failure", async () => {
    const { load, recover } = failingThenWorking();
    const { store, choose, listen, loadsOf } = setup({
      load,
      language: "af",
    });
    listen();
    await settle();
    choose(null);
    await settle();
    expect(loadsOf("af")).toBe(1);
    choose("af");
    await settle();
    expect(loadsOf("af")).toBe(2);
    recover();
    store.retry();
    await settle();
    expect(loadsOf("af")).toBe(3);
    expect(failure(store)).toBe("ok");
    expect(spoken(store)).toBe("af");
  });

  it("does nothing when asked to retry with no failure", () => {
    const { store, listen, loader } = setup();
    listen();
    store.retry();
    expect(loader).not.toHaveBeenCalled();
    expect(failure(store)).toBe("ok");
  });
});

describe("createMessageStore's subscriptions", () => {
  it("follows the services once however many listen, and releases them with the last listener", () => {
    const { services, preferences, listen } = setup();
    const release = vi.fn();
    const settings = vi
      .spyOn(services.settings, "subscribe")
      .mockReturnValue(release);

    const first = listen();
    const second = listen();
    expect(settings).toHaveBeenCalledTimes(1);
    expect(preferences.listeners.size).toBe(1);

    first.stop();
    first.stop();
    expect(release).not.toHaveBeenCalled();
    expect(preferences.listeners.size).toBe(1);

    second.stop();
    second.stop();
    expect(release).toHaveBeenCalledTimes(1);
    expect(preferences.listeners.size).toBe(0);
  });

  it("picks up on resubscription a change it missed", () => {
    const { store, choose, listen } = setup();
    listen().stop();
    choose("af");
    expect(spoken(store)).toBe("en-GB");
    listen();
    expect(spoken(store)).toBe("af");
  });

  it("does not start again a load in flight, and takes its result with nobody listening", async () => {
    const slow = defer();
    const { store, listen, loader } = setup({
      load: () => slow.promise,
      language: "af",
    });
    listen().stop();
    const again = listen();
    expect(loader).toHaveBeenCalledTimes(1);
    again.stop();
    slow.resolve(AFRIKAANS);
    await settle();
    expect(spoken(store)).toBe("af");
    listen();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not load again after a success", () => {
    const { listen, loader } = setup({ language: "af" });
    listen().stop();
    listen();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not load again after a failure whose inputs are unchanged", async () => {
    const { store, listen, loader } = setup({
      load: alwaysOffline,
      language: "af",
    });
    const first = listen();
    await settle();
    first.stop();
    listen();
    await settle();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(failure(store)).toBe("af");
  });
});

describe("createMessageStore given other services", () => {
  it("keeps the loaded language, without loading again, for another preferences store, and moves to it", () => {
    const { store, services, preferences, listen, loader } = setup({
      language: "af",
    });
    listen();
    const other = scriptedPreferences([]);

    store.setServices({ ...services, preferences: other });

    expect(spoken(store)).toBe("af");
    expect(loader).toHaveBeenCalledTimes(1);
    expect(preferences.listeners.size).toBe(0);
    expect(other.listeners.size).toBe(1);
  });

  it("changes nothing for the same four services in another object", () => {
    const { store, services, listen } = setup();
    listen();
    const settings = vi.spyOn(services.settings, "subscribe");
    const before = store.getState();

    store.setServices({ ...services });

    expect(store.getState()).toBe(before);
    expect(settings).not.toHaveBeenCalled();
  });

  it("keeps the previous catalogue while a new language catalogue loads", async () => {
    const { store, services, listen } = setup({ language: "af" });
    listen();
    const next = defer();

    store.setServices({
      ...services,
      languages: createLanguageCatalogue(OFFERED, "en-GB", () => next.promise),
    });

    expect(store.getState().messages).toBe(AFRIKAANS);
    const replacement = new FakeMessageCatalogue({ language: "af" });
    next.resolve(replacement);
    await settle();
    expect(store.getState().messages).toBe(replacement);
  });

  it("speaks the new services' catalogue when they offer no languages, and ignores an older load", async () => {
    const slow = defer();
    const { store, services, preferences, listen } = setup({
      load: () => slow.promise,
      language: "af",
    });
    listen();
    const other = new FakeMessageCatalogue({ language: "en-GB" });

    store.setServices({ ...services, messages: other, languages: undefined });
    slow.resolve(AFRIKAANS);
    await settle();

    expect(store.getState().messages).toBe(other);
    expect(store.getInitialState().messages).toBe(other);
    expect(preferences.listeners.size).toBe(0);
  });

  it("stays idle when given them before its first subscription", () => {
    const { store, services, preferences, loader } = setup({ language: "af" });
    const other = new FakeMessageCatalogue({ language: "en-GB" });

    store.setServices({ ...services, messages: other });

    expect(store.getState().messages).toBe(other);
    expect(store.getState()).toBe(store.getInitialState());
    expect(loader).not.toHaveBeenCalled();
    expect(preferences.listeners.size).toBe(0);
  });
});
