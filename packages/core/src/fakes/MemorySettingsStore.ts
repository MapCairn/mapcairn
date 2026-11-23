// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type { Settings, SettingsStore } from "../ports/settings";

/** What a fresh {@link MemorySettingsStore} holds. */
export const DEFAULT_FAKE_SETTINGS: Settings = Object.freeze({
  theme: "system",
  units: "metric",
  zoomButtons: null,
  projection: "flat",
  basemapId: null,
  lastView: null,
  tourSeen: null,
  language: null,
});

/** Options for {@link MemorySettingsStore}. */
export interface MemorySettingsStoreOptions {
  /**
   * What `persistent` reports. Defaults to true. False simulates blocked
   * storage: the store still works, in memory only.
   */
  readonly persistent?: boolean;
  /** Overrides applied on top of {@link DEFAULT_FAKE_SETTINGS}. */
  readonly initial?: Partial<Settings>;
}

/**
 * An in-memory {@link SettingsStore}.
 *
 * How to script it: pass `persistent: false` to simulate blocked storage and
 * `initial` to start from non-default settings. `get()` returns the same
 * frozen object until a `set` changes a value (compared with `Object.is`), so
 * a no-op `set` neither notifies nor changes the reference. Properties in a
 * patch whose value is `undefined` are ignored.
 */
export class MemorySettingsStore implements SettingsStore {
  /** Whether changes would survive a reload, as the constructor option set it. */
  readonly persistent: boolean;

  #settings: Settings;
  readonly #listeners = new Set<(settings: Settings) => void>();

  constructor(options: MemorySettingsStoreOptions = {}) {
    this.persistent = options.persistent ?? true;
    this.#settings = Object.freeze({
      ...DEFAULT_FAKE_SETTINGS,
      ...options.initial,
    });
  }

  /** The current settings, a frozen object that stays the same until a `set` changes a value. */
  get(): Settings {
    return this.#settings;
  }

  /** Merges the patch, ignoring properties whose value is `undefined`. It notifies only when a value changed. */
  set(patch: Partial<Settings>): void {
    let next: Settings = this.#settings;
    for (const key of Object.keys(patch) as (keyof Settings)[]) {
      const value = patch[key];
      if (value !== undefined && !Object.is(value, this.#settings[key])) {
        next = { ...next, [key]: value };
      }
    }
    if (next === this.#settings) {
      return;
    }
    this.#settings = Object.freeze(next);
    for (const listener of [...this.#listeners]) {
      listener(this.#settings);
    }
  }

  /** Calls the listener with the new settings after a change. Returns the function that unsubscribes. */
  subscribe(listener: (settings: Settings) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
