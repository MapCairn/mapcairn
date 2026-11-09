import type { DevicePreferencesValue } from "@karta/core";
import { runDevicePreferencesContract } from "@karta/core/contracts";
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

function setup() {
  const queries = {
    reducedMotion: new FakeMediaQuery(false),
    finePointer: new FakeMediaQuery(true),
  };
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
  const preferences = new BrowserDevicePreferences({ getWindow: () => window });
  return { queries, window, preferences };
}

runDevicePreferencesContract("BrowserDevicePreferences", () => {
  const { queries, preferences } = setup();
  return {
    preferences,
    controls: {
      set(patch: Partial<DevicePreferencesValue>) {
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
    });
    expect(window.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION);
    expect(window.matchMedia).toHaveBeenCalledWith(FINE_POINTER);
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
      const preferences = new BrowserDevicePreferences({ getWindow });
      expect(preferences.get()).toEqual({
        reducedMotion: false,
        finePointer: false,
      });
      expect(() => preferences.subscribe(() => undefined)()).not.toThrow();
    }
  });

  it("uses the global window by default", () => {
    const value = new BrowserDevicePreferences().get();
    expect(typeof value.reducedMotion).toBe("boolean");
    expect(typeof value.finePointer).toBe("boolean");
  });
});
