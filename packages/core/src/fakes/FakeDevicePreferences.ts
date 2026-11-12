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
 * and no save-data request by default) and call `set(patch)` to change them. Subscribers are notified
 * only when a value actually changes, and `get()` returns the same object
 * until then.
 */
export class FakeDevicePreferences implements DevicePreferences {
  #value: DevicePreferencesValue;
  #listeners = new Set<(value: DevicePreferencesValue) => void>();

  constructor(initial: Partial<DevicePreferencesValue> = {}) {
    this.#value = {
      reducedMotion: false,
      finePointer: true,
      saveData: false,
      ...initial,
    };
  }

  /** Changes preferences and notifies subscribers if anything differs. */
  set(patch: Partial<DevicePreferencesValue>): void {
    const next = { ...this.#value, ...patch };
    if (
      next.reducedMotion === this.#value.reducedMotion &&
      next.finePointer === this.#value.finePointer &&
      next.saveData === this.#value.saveData
    ) {
      return;
    }
    this.#value = next;
    for (const listener of [...this.#listeners]) {
      listener(next);
    }
  }

  get(): DevicePreferencesValue {
    return this.#value;
  }

  subscribe(listener: (value: DevicePreferencesValue) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
