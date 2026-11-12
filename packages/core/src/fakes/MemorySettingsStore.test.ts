// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import { describe, expect, it } from "vitest";
import {
  runSettingsStoreContract,
  type SettingsStoreSubject,
} from "../contracts/settingsStore.contract";
import {
  DEFAULT_FAKE_SETTINGS,
  MemorySettingsStore,
} from "./MemorySettingsStore";

runSettingsStoreContract(
  "MemorySettingsStore",
  (): SettingsStoreSubject => ({
    store: new MemorySettingsStore(),
    controls: {
      createBlocked: () => new MemorySettingsStore({ persistent: false }),
    },
  }),
);

runSettingsStoreContract(
  "MemorySettingsStore (no optional controls)",
  (): SettingsStoreSubject => ({
    store: new MemorySettingsStore(),
    controls: {},
  }),
);

describe("MemorySettingsStore", () => {
  it("is persistent by default and not when told so", () => {
    expect(new MemorySettingsStore().persistent).toBe(true);
    expect(new MemorySettingsStore({ persistent: false }).persistent).toBe(
      false,
    );
  });

  it("starts from the defaults with overrides applied", () => {
    expect(new MemorySettingsStore().get()).toEqual(DEFAULT_FAKE_SETTINGS);
    const store = new MemorySettingsStore({ initial: { units: "imperial" } });
    expect(store.get()).toEqual({
      ...DEFAULT_FAKE_SETTINGS,
      units: "imperial",
    });
  });

  it("freezes the settings it hands out", () => {
    const store = new MemorySettingsStore();
    expect(Object.isFrozen(store.get())).toBe(true);
    store.set({ theme: "dark" });
    expect(Object.isFrozen(store.get())).toBe(true);
  });

  it("ignores patch properties that are undefined", () => {
    const store = new MemorySettingsStore();
    const before = store.get();
    store.set({ theme: undefined });
    expect(store.get()).toBe(before);
  });

  it("treats a new but equal lastView object as a change", () => {
    const store = new MemorySettingsStore();
    const view = { center: { lat: 1, lng: 2 }, zoom: 3, bearing: 0 };
    store.set({ lastView: view });
    const before = store.get();
    store.set({ lastView: { ...view } });
    expect(store.get()).not.toBe(before);
  });

  it("lets a listener unsubscribe itself while being notified", () => {
    const store = new MemorySettingsStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
      unsubscribe();
    });
    store.set({ theme: "dark" });
    store.set({ theme: "light" });
    expect(calls).toBe(1);
  });
});
