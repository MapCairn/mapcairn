import { THEME_STORAGE_KEY } from "@mapcairn/core";
import { runSettingsStoreContract } from "@mapcairn/core/contracts";
import { describe, expect, it } from "vitest";
import {
  LocalStorageSettingsStore,
  type StorageEventTarget,
} from "./LocalStorageSettingsStore";

/** A Storage that behaves like the real one and can be told to throw. */
class FakeStorage implements Storage {
  readonly #items = new Map<string, string>();
  failReads = false;
  failWrites = false;

  get length(): number {
    return this.#items.size;
  }
  clear(): void {
    this.#items.clear();
  }
  getItem(key: string): string | null {
    if (this.failReads) {
      throw new DOMException("blocked", "SecurityError");
    }
    return this.#items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) {
      throw new DOMException("full", "QuotaExceededError");
    }
    this.#items.set(key, value);
  }
  /** Writes without the failure switches, as another tab would. */
  put(key: string, value: string): void {
    this.#items.set(key, value);
  }
  keys(): string[] {
    return [...this.#items.keys()];
  }
}

class FakeEvents implements StorageEventTarget {
  readonly listeners = new Set<(event: Event) => void>();
  addEventListener(_type: "storage", listener: (event: Event) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(
    _type: "storage",
    listener: (event: Event) => void,
  ): void {
    this.listeners.delete(listener);
  }
  fire(key: string | null, storageArea: Storage | null): void {
    const event = Object.assign(new Event("storage"), { key, storageArea });
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

function setup(seed: Record<string, string> = {}) {
  const storage = new FakeStorage();
  for (const [key, value] of Object.entries(seed)) {
    storage.put(key, value);
  }
  const events = new FakeEvents();
  const store = new LocalStorageSettingsStore({
    getStorage: () => storage,
    events,
  });
  return { storage, events, store };
}

const VIEW = { center: { lat: -33.9, lng: 18.4 }, zoom: 11, bearing: 90 };

runSettingsStoreContract("LocalStorageSettingsStore", () => {
  const { store } = setup();
  return {
    store,
    controls: {
      createBlocked: () =>
        new LocalStorageSettingsStore({
          getStorage: () => {
            throw new DOMException("blocked", "SecurityError");
          },
          events: undefined,
        }),
    },
  };
});

describe("LocalStorageSettingsStore", () => {
  it("is persistent when storage works and leaves no probe key behind", () => {
    const { store, storage } = setup();
    expect(store.persistent).toBe(true);
    expect(storage.keys()).toEqual([]);
  });

  it("stores the theme as a plain string under the shared key", () => {
    const { store, storage } = setup();
    store.set({ theme: "dark" });
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("stores every other setting as JSON under its own key", () => {
    const { store, storage } = setup();
    store.set({
      units: "imperial",
      zoomButtons: false,
      saveData: true,
      basemapId: "positron",
      lastView: VIEW,
    });
    expect(storage.getItem("mapcairn:units")).toBe('"imperial"');
    expect(storage.getItem("mapcairn:zoomButtons")).toBe("false");
    expect(storage.getItem("mapcairn:saveData")).toBe("true");
    expect(storage.getItem("mapcairn:basemapId")).toBe('"positron"');
    expect(JSON.parse(storage.getItem("mapcairn:lastView") ?? "null")).toEqual(
      VIEW,
    );
  });

  it("reads back what an earlier visit stored", () => {
    const { store } = setup({
      [THEME_STORAGE_KEY]: "light",
      "mapcairn:units": '"imperial"',
      "mapcairn:zoomButtons": "true",
      "mapcairn:saveData": "false",
      "mapcairn:basemapId": '"osm"',
      "mapcairn:lastView": JSON.stringify(VIEW),
    });
    expect(store.get()).toEqual({
      theme: "light",
      units: "imperial",
      zoomButtons: true,
      saveData: false,
      basemapId: "osm",
      lastView: VIEW,
    });
  });

  it("keeps a Liberty choice saved before Bright became the default", () => {
    const { store } = setup({ "mapcairn:basemapId": '"liberty"' });
    expect(store.get().basemapId).toBe("liberty");
  });

  it("starts on the default basemap when nothing is saved, and saves nothing until a choice is made", () => {
    const { store, storage } = setup({});
    expect(store.get().basemapId).toBe("bright");
    store.set({ units: "imperial" });
    expect(storage.getItem("mapcairn:basemapId")).toBeNull();
  });

  it("replaces invalid stored values with the defaults", () => {
    const { store } = setup({
      [THEME_STORAGE_KEY]: '"dark"',
      "mapcairn:units": '"furlongs"',
      "mapcairn:zoomButtons": '"yes"',
      "mapcairn:saveData": '"yes"',
      "mapcairn:basemapId": '"Not A Basemap!"',
      "mapcairn:lastView":
        '{"center":{"lat":200,"lng":0},"zoom":3,"bearing":0}',
    });
    expect(store.get()).toEqual({
      theme: "system",
      units: "metric",
      zoomButtons: null,
      saveData: null,
      basemapId: "bright",
      lastView: null,
    });
  });

  it("replaces unparseable and wrongly shaped JSON with the defaults", () => {
    for (const lastView of [
      "{not json",
      "null",
      "42",
      '{"center":null,"zoom":3,"bearing":0}',
      '{"center":{"lat":0,"lng":0},"zoom":99,"bearing":0}',
      '{"center":{"lat":0,"lng":0},"zoom":3,"bearing":"north"}',
    ]) {
      const { store } = setup({ "mapcairn:lastView": lastView });
      expect(store.get().lastView).toBeNull();
    }
  });

  it("does not notify when the same view is set again as a new object", () => {
    const { store } = setup();
    store.set({ lastView: VIEW });
    const before = store.get();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    store.set({ lastView: { ...VIEW, center: { ...VIEW.center } } });
    expect(calls).toBe(0);
    expect(store.get()).toBe(before);
  });

  it("writes only the keys that changed", () => {
    const { store, storage } = setup();
    store.set({ units: "imperial" });
    expect(storage.keys()).toEqual(["mapcairn:units"]);
  });

  it("does not remember changes, and says so, when the write probe fails", () => {
    const storage = new FakeStorage();
    storage.failWrites = true;
    const store = new LocalStorageSettingsStore({
      getStorage: () => storage,
      events: undefined,
    });
    expect(store.persistent).toBe(false);
    store.set({ units: "imperial" });
    expect(store.get().units).toBe("imperial");
    expect(storage.keys()).toEqual([]);
  });

  it("still reads stored values when only writes are blocked", () => {
    const storage = new FakeStorage();
    storage.put("mapcairn:units", '"imperial"');
    storage.failWrites = true;
    const store = new LocalStorageSettingsStore({
      getStorage: () => storage,
      events: undefined,
    });
    expect(store.persistent).toBe(false);
    expect(store.get().units).toBe("imperial");
  });

  it("reports not persistent when there is no storage at all", () => {
    const store = new LocalStorageSettingsStore({
      getStorage: () => undefined,
      events: undefined,
    });
    expect(store.persistent).toBe(false);
    store.set({ theme: "dark" });
    expect(store.get().theme).toBe("dark");
  });

  it("falls back to memory when a later write fails", () => {
    const { store, storage } = setup();
    expect(store.persistent).toBe(true);
    storage.failWrites = true;
    store.set({ units: "imperial" });
    expect(store.persistent).toBe(false);
    expect(store.get().units).toBe("imperial");
    storage.failWrites = false;
    store.set({ theme: "dark" });
    expect(storage.keys()).toEqual([]);
  });

  it("falls back to memory when storage disappears after construction", () => {
    let available = true;
    const storage = new FakeStorage();
    const store = new LocalStorageSettingsStore({
      getStorage: () => (available ? storage : undefined),
      events: undefined,
    });
    available = false;
    store.set({ units: "imperial" });
    expect(store.persistent).toBe(false);
    expect(store.get().units).toBe("imperial");
  });

  it("uses the global localStorage by default", () => {
    localStorage.clear();
    const store = new LocalStorageSettingsStore();
    expect(store.persistent).toBe(true);
    store.set({ theme: "light" });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    localStorage.clear();
  });

  describe("other tabs", () => {
    it("listens only while someone is subscribed", () => {
      const { store, events } = setup();
      expect(events.listeners.size).toBe(0);
      const first = store.subscribe(() => undefined);
      const second = store.subscribe(() => undefined);
      expect(events.listeners.size).toBe(1);
      first();
      expect(events.listeners.size).toBe(1);
      second();
      expect(events.listeners.size).toBe(0);
      second();
      expect(events.listeners.size).toBe(0);
    });

    it("adopts a change another tab made and notifies once", () => {
      const { store, storage, events } = setup();
      const seen: string[] = [];
      store.subscribe((settings) => seen.push(settings.units));
      storage.put("mapcairn:units", '"imperial"');
      events.fire("mapcairn:units", storage);
      expect(store.get().units).toBe("imperial");
      expect(seen).toEqual(["imperial"]);
    });

    it("adopts a theme change made in another tab", () => {
      const { store, storage, events } = setup();
      store.subscribe(() => undefined);
      storage.put(THEME_STORAGE_KEY, "dark");
      events.fire(THEME_STORAGE_KEY, storage);
      expect(store.get().theme).toBe("dark");
    });

    it("resets to the defaults when another tab clears storage", () => {
      const { store, storage, events } = setup({
        "mapcairn:units": '"imperial"',
      });
      store.subscribe(() => undefined);
      storage.clear();
      events.fire(null, storage);
      expect(store.get().units).toBe("metric");
    });

    it("ignores unrelated keys, other storage areas and echoes of its own state", () => {
      const { store, storage, events } = setup();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      storage.put("mapcairn:units", '"imperial"');
      events.fire("something-else", storage);
      events.fire("mapcairn:units", new FakeStorage());
      expect(calls).toBe(0);
      events.fire("mapcairn:units", storage);
      expect(calls).toBe(1);
      events.fire("mapcairn:units", storage);
      expect(calls).toBe(1);
    });

    it("keeps its values when storage cannot be read during a sync", () => {
      const { store, storage, events } = setup();
      store.set({ units: "imperial" });
      store.subscribe(() => undefined);
      storage.failReads = true;
      events.fire("mapcairn:units", storage);
      expect(store.get().units).toBe("imperial");
    });
  });
});
