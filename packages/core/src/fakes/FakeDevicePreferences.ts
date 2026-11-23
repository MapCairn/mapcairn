// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import type {
  DevicePreferences,
  DevicePreferencesValue,
} from "../ports/preferences";

/**
 * Scripted {@link DevicePreferences}.
 *
 * How to script it: pass the starting values (no reduced motion, fine pointer
 * and no save-data request, no languages and online by default) and call `set(patch)` to change them. Subscribers are notified
 * only when a value actually changes, and `get()` returns the same object
 * until then.
 */
export class FakeDevicePreferences implements DevicePreferences {
  #value: DevicePreferencesValue;
  readonly #listeners = new Set<(value: DevicePreferencesValue) => void>();

  constructor(initial: Partial<DevicePreferencesValue> = {}) {
    this.#value = {
      reducedMotion: false,
      finePointer: true,
      saveData: false,
      languages: [],
      online: true,
      ...initial,
    };
  }

  /** Changes preferences and notifies subscribers if anything differs. */
  set(patch: Partial<DevicePreferencesValue>): void {
    const next = { ...this.#value, ...patch };
    if (
      next.reducedMotion === this.#value.reducedMotion &&
      next.finePointer === this.#value.finePointer &&
      next.saveData === this.#value.saveData &&
      next.online === this.#value.online &&
      next.languages.join(",") === this.#value.languages.join(",")
    ) {
      return;
    }
    this.#value = next;
    for (const listener of [...this.#listeners]) {
      listener(next);
    }
  }

  /** The current values. The same object is returned until `set` changes one. */
  get(): DevicePreferencesValue {
    return this.#value;
  }

  /** Calls the listener when `set` changes a value. Returns the function that unsubscribes. */
  subscribe(listener: (value: DevicePreferencesValue) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
