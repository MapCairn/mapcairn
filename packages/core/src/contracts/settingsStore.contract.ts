import { describe, expect, it } from "vitest";
import type { Settings, SettingsStore } from "../ports/settings";

/** What the settings contract needs besides the store itself. */
export interface SettingsStoreControls {
  /**
   * Builds a store whose storage is blocked (every read and write throws).
   * Optional because an in-memory store has no storage to block.
   */
  createBlocked?(): SettingsStore;
}

/** One settings store under test, with its controls. */
export interface SettingsStoreSubject {
  /** A store over fresh, empty storage. */
  readonly store: SettingsStore;
  readonly controls: SettingsStoreControls;
}

/**
 * Runs the shared behavioural suite for a {@link SettingsStore}. Every test
 * calls `create` for a fresh subject.
 */
export function runSettingsStoreContract(
  name: string,
  create: () => SettingsStoreSubject,
): void {
  describe(`SettingsStore contract: ${name}`, () => {
    it("starts with the documented defaults", () => {
      const { store } = create();
      expect(store.get()).toEqual({
        theme: "system",
        units: "metric",
        zoomButtons: null,
        saveData: null,
        projection: "flat",
        basemapId: "bright",
        lastView: null,
      });
      expect(typeof store.persistent).toBe("boolean");
    });

    it("returns the same object until something changes", () => {
      const { store } = create();
      expect(store.get()).toBe(store.get());
    });

    it("merges a patch into the settings and returns a new object", () => {
      const { store } = create();
      const before = store.get();
      store.set({ units: "imperial" });
      const after = store.get();
      expect(after).not.toBe(before);
      expect(after.units).toBe("imperial");
      expect(after.theme).toBe("system");
      expect(after.basemapId).toBe("bright");
      expect(before.units).toBe("metric");
    });

    it("stores every settings field", () => {
      const { store } = create();
      const lastView = {
        center: { lat: -33.9, lng: 18.4 },
        zoom: 11,
        bearing: 0,
      };
      store.set({
        theme: "dark",
        units: "imperial",
        zoomButtons: true,
        saveData: true,
        projection: "globe",
        basemapId: "osm",
        lastView,
      });
      expect(store.get()).toEqual({
        theme: "dark",
        units: "imperial",
        zoomButtons: true,
        saveData: true,
        projection: "globe",
        basemapId: "osm",
        lastView,
      });
      store.set({ zoomButtons: null, saveData: null, lastView: null });
      expect(store.get().zoomButtons).toBeNull();
      expect(store.get().saveData).toBeNull();
      expect(store.get().lastView).toBeNull();
    });

    it("notifies subscribers with the new settings after a change", () => {
      const { store } = create();
      const seen: Settings[] = [];
      store.subscribe((settings) => seen.push(settings));
      store.set({ theme: "dark" });
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe(store.get());
      expect(seen[0]?.theme).toBe("dark");
    });

    it("notifies every subscriber", () => {
      const { store } = create();
      let first = 0;
      let second = 0;
      store.subscribe(() => {
        first += 1;
      });
      store.subscribe(() => {
        second += 1;
      });
      store.set({ units: "imperial" });
      expect([first, second]).toEqual([1, 1]);
    });

    it("neither notifies nor changes the reference when nothing changes", () => {
      const { store } = create();
      store.set({ units: "imperial", theme: "dark" });
      const before = store.get();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      store.set({});
      store.set({ units: "imperial" });
      store.set({ units: "imperial", theme: "dark" });
      store.set({ lastView: null });
      expect(calls).toBe(0);
      expect(store.get()).toBe(before);
    });

    it("notifies once for a patch that changes only some fields", () => {
      const { store } = create();
      let calls = 0;
      store.subscribe(() => {
        calls += 1;
      });
      store.set({ units: "metric", theme: "light" });
      expect(calls).toBe(1);
      expect(store.get().theme).toBe("light");
    });

    it("stops notifying after unsubscribe, and unsubscribing twice is safe", () => {
      const { store } = create();
      let calls = 0;
      const unsubscribe = store.subscribe(() => {
        calls += 1;
      });
      store.set({ theme: "dark" });
      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
      store.set({ theme: "light" });
      expect(calls).toBe(1);
    });

    it("never throws from get, set or subscribe", () => {
      const { store } = create();
      expect(() => {
        store.get();
        store.set({ theme: "dark" });
        store.set({ theme: "dark" });
        store.subscribe(() => undefined)();
      }).not.toThrow();
    });

    it("still works in memory, and says so, when storage is blocked", () => {
      const { controls } = create();
      if (controls.createBlocked === undefined) {
        return;
      }
      const blocked = controls.createBlocked();
      expect(blocked.persistent).toBe(false);
      let calls = 0;
      blocked.subscribe(() => {
        calls += 1;
      });
      expect(() => blocked.set({ units: "imperial" })).not.toThrow();
      expect(blocked.get().units).toBe("imperial");
      expect(calls).toBe(1);
    });
  });
}
