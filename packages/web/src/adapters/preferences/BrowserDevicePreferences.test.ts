// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { DevicePreferencesValue } from "@mapcairn/core";
import { runDevicePreferencesContract } from "@mapcairn/core/contracts";
import { describe, expect, it, vi } from "vitest";
import type { MediaQueryLike } from "../shared/mediaQuery";
import { BrowserDevicePreferences } from "./BrowserDevicePreferences";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/** A media query whose result and change events a test drives. */
class FakeMediaQuery implements MediaQueryLike {
  matches: boolean;
  readonly #listeners = new Set<() => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: "change", listener: () => void): void {
    this.#listeners.add(listener);
  }
  removeEventListener(_type: "change", listener: () => void): void {
    this.#listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.#listeners.size;
  }
  /** Changes the result and fires `change`. */
  set(matches: boolean): void {
    this.matches = matches;
    this.fire();
  }
  fire(): void {
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }
}

/** The window's `online` and `offline` events, and `navigator.onLine`, as a test drives them. */
class FakeNetwork {
  onLine = true;
  readonly #listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const set = this.#listeners.get(type) ?? new Set();
    set.add(listener);
    this.#listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.#listeners.get(type)?.delete(listener);
  }
  get listenerCount(): number {
    return [...this.#listeners.values()].reduce(
      (total, set) => total + set.size,
      0,
    );
  }
  /** Changes the state and fires the event the browser fires for it. */
  set(onLine: boolean): void {
    this.onLine = onLine;
    for (const listener of [
      ...(this.#listeners.get(onLine ? "online" : "offline") ?? []),
    ]) {
      listener();
    }
  }
}

function setup(languages: readonly string[] | null = ["af-ZA", "en"]) {
  const queries = {
    reducedMotion: new FakeMediaQuery(false),
    finePointer: new FakeMediaQuery(true),
  };
  const network = new FakeNetwork();
  const window = {
    matchMedia: vi.fn((query: string) => {
      if (query === REDUCED_MOTION) {
        return queries.reducedMotion as unknown as MediaQueryList;
      }
      if (query === FINE_POINTER) {
        return queries.finePointer as unknown as MediaQueryList;
      }
      throw new Error(`unexpected query ${query}`);
    }),
  };
  const preferences = new BrowserDevicePreferences({
    getWindow: () => window,
    getLanguages: () => languages ?? undefined,
    getOnline: () => network.onLine,
    getEvents: () => network,
  });
  return { queries, network, window, preferences };
}

runDevicePreferencesContract("BrowserDevicePreferences", () => {
  const { queries, network, preferences } = setup();
  return {
    preferences,
    controls: {
      set(patch: Partial<DevicePreferencesValue>) {
        if (patch.online !== undefined && network.onLine !== patch.online) {
          network.set(patch.online);
        }
        if (patch.reducedMotion !== undefined) {
          setIfChanged(queries.reducedMotion, patch.reducedMotion);
        }
        if (patch.finePointer !== undefined) {
          setIfChanged(queries.finePointer, patch.finePointer);
        }
      },
    },
  };
});

/** A browser only fires `change` when the result changes. */
function setIfChanged(query: FakeMediaQuery, matches: boolean): void {
  if (query.matches !== matches) {
    query.set(matches);
  }
}

describe("BrowserDevicePreferences", () => {
  it("reads both media queries", () => {
    const { window, preferences } = setup();
    expect(preferences.get()).toEqual({
      reducedMotion: false,
      finePointer: true,
      languages: ["af-ZA", "en"],
      online: true,
    });
    expect(window.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION);
    expect(window.matchMedia).toHaveBeenCalledWith(FINE_POINTER);
  });

  it("reports no languages where the browser gives none or reading them throws", () => {
    expect(setup(null).preferences.get().languages).toEqual([]);
    const throwing = new BrowserDevicePreferences({
      getWindow: () => undefined,
      getLanguages: () => {
        throw new Error("blocked");
      },
    });
    expect(throwing.get().languages).toEqual([]);
  });

  it("reads the browser's languages from navigator by default", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["af", "en-GB"]);
    const preferences = new BrowserDevicePreferences({
      getWindow: () => undefined,
    });
    expect(preferences.get().languages).toEqual(["af", "en-GB"]);
    vi.restoreAllMocks();
  });

  it("is never stale without subscribers", () => {
    const { queries, preferences } = setup();
    const before = preferences.get();
    queries.reducedMotion.set(true);
    const after = preferences.get();
    expect(after).not.toBe(before);
    expect(after.reducedMotion).toBe(true);
  });

  it("does not notify on a spurious change event", () => {
    const { queries, preferences } = setup();
    const seen: DevicePreferencesValue[] = [];
    preferences.subscribe((value) => seen.push(value));
    queries.reducedMotion.fire();
    expect(seen).toHaveLength(0);
  });

  it("notifies once for a change and hands out the same object from get", () => {
    const { queries, preferences } = setup();
    const seen: DevicePreferencesValue[] = [];
    preferences.subscribe((value) => seen.push(value));
    queries.finePointer.set(false);
    expect(seen).toHaveLength(1);
    expect(preferences.get()).toBe(seen[0]);
    expect(preferences.get()).toBe(preferences.get());
  });

  it("reflects a change that happened before it subscribed without notifying about it", () => {
    const { queries, preferences } = setup();
    queries.reducedMotion.matches = true;
    const seen: DevicePreferencesValue[] = [];
    preferences.subscribe((value) => seen.push(value));
    expect(seen).toHaveLength(0);
    expect(preferences.get().reducedMotion).toBe(true);
  });

  it("listens only while someone is subscribed", () => {
    const { queries, preferences } = setup();
    const first = preferences.subscribe(() => undefined);
    const second = preferences.subscribe(() => undefined);
    expect(queries.reducedMotion.listenerCount).toBe(1);
    expect(queries.finePointer.listenerCount).toBe(1);
    first();
    expect(queries.reducedMotion.listenerCount).toBe(1);
    second();
    second();
    expect(queries.reducedMotion.listenerCount).toBe(0);
    expect(queries.finePointer.listenerCount).toBe(0);
  });

  it("falls back to addListener on Safari before 14", () => {
    const handlers: (() => void)[] = [];
    const removeListener = vi.fn();
    const legacy = {
      matches: false,
      addListener: (listener: () => void) => handlers.push(listener),
      removeListener,
    } as unknown as MediaQueryLike;
    const preferences = new BrowserDevicePreferences({
      getWindow: () => ({ matchMedia: () => legacy as MediaQueryList }),
    });
    const seen: DevicePreferencesValue[] = [];
    const unsubscribe = preferences.subscribe((value) => seen.push(value));
    expect(handlers).toHaveLength(2);
    (legacy as { matches: boolean }).matches = true;
    handlers[0]?.();
    expect(seen).toHaveLength(1);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledTimes(2);
  });

  it("reports false for both when matchMedia is missing or throws", () => {
    for (const getWindow of [
      () => undefined,
      () => ({
        matchMedia: () => {
          throw new Error("blocked");
        },
      }),
    ]) {
      const preferences = new BrowserDevicePreferences({
        getWindow,
        getLanguages: () => undefined,
      });
      expect(preferences.get()).toEqual({
        reducedMotion: false,
        finePointer: false,
        languages: [],
        online: true,
      });
      expect(() => preferences.subscribe(() => undefined)()).not.toThrow();
    }
  });

  describe("online", () => {
    it("follows navigator.onLine, read afresh", () => {
      const { network, preferences } = setup();
      expect(preferences.get().online).toBe(true);
      network.onLine = false;
      expect(preferences.get().online).toBe(false);
    });

    it("notifies when the browser fires offline and online, and listens only while subscribed", () => {
      const { network, preferences } = setup();
      expect(network.listenerCount).toBe(0);
      const seen: (boolean | undefined)[] = [];
      const stop = preferences.subscribe((value) => seen.push(value.online));
      expect(network.listenerCount).toBe(2);
      network.set(false);
      network.set(true);
      expect(seen).toEqual([false, true]);
      stop();
      expect(network.listenerCount).toBe(0);
    });

    it("is online where there is no signal, and when reading it throws", () => {
      for (const getOnline of [
        () => undefined,
        () => {
          throw new Error("blocked");
        },
      ]) {
        const preferences = new BrowserDevicePreferences({
          getWindow: () => undefined,
          getOnline,
          getEvents: () => undefined,
        });
        expect(preferences.get().online).toBe(true);
        expect(() => preferences.subscribe(() => undefined)()).not.toThrow();
      }
    });

    it("reads navigator.onLine and the window's events by default", () => {
      const onLine = vi.spyOn(navigator, "onLine", "get");
      try {
        onLine.mockReturnValue(false);
        const preferences = new BrowserDevicePreferences();
        const seen: (boolean | undefined)[] = [];
        const stop = preferences.subscribe((value) => seen.push(value.online));
        expect(preferences.get().online).toBe(false);
        onLine.mockReturnValue(true);
        window.dispatchEvent(new Event("online"));
        expect(seen).toEqual([true]);
        stop();
      } finally {
        onLine.mockRestore();
      }
    });
  });

  it("uses the global window by default", () => {
    const value = new BrowserDevicePreferences().get();
    expect(typeof value.reducedMotion).toBe("boolean");
    expect(typeof value.finePointer).toBe("boolean");
  });
});
